// packages/frontend/src/components/ForgotPasswordPage.tsx
// 票 #29：/forgot-password（登录页入口，requireUnauth 域）。
// 设计约束：后端统一成功响应不暴露用户存在性——本页提交后渲染固定文案，不做任何分支提示。
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useForgotPassword } from '../api/queries';
import { useUI } from './UIComponents';
import { errMsg } from '../utils';

const ForgotPasswordPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useUI();
  const forgot = useForgotPassword();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await forgot.mutateAsync({ username });
      setSubmitted(true);
    } catch (err) {
      toast('error', '请求失败', errMsg(err, '无法提交重置请求'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow" />
      </div>

      <div className="w-full max-w-md relative z-10 px-4">
        <div className="glass-panel rounded-3xl shadow-2xl p-8 animate-in fade-in-up duration-500">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/50 mb-4 ring-1 ring-white/20">
              <KeyRound className="text-white w-8 h-8 drop-shadow-md" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">忘记密码</h1>
            <p className="text-slate-400 text-sm mt-2 tracking-wide">提交后请联系管理员获取重置链接</p>
          </div>

          {submitted ? (
            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm p-4 rounded-xl">
              <p>请求已提交。如该用户名存在，系统已生成重置链接，请联系管理员获取。</p>
              <Link to="/login" className="inline-block text-blue-400 hover:text-blue-300 text-xs underline mt-2">
                返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="forgot-username" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">账号</label>
                <input
                  id="forgot-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-600/50 focus:border-blue-500/50 outline-none transition-all shadow-inner"
                  placeholder="请输入用户名"
                  autoFocus
                  required
                />
              </div>
              <button
                type="submit"
                disabled={forgot.isPending}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3.5 rounded-xl shadow-lg shadow-blue-900/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed border border-white/10"
              >
                {forgot.isPending ? '提交中...' : '提交请求'}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <Link to="/login" className="text-xs text-slate-400 hover:text-blue-400 transition-colors">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
