// packages/frontend/src/components/ResetPasswordPage.tsx
// 票 #29：/reset-password?token= 重置页（requireUnauth 域）。
// 成功导航由 useResetPassword onSuccess 统一处理（会话空窗修复同款：清 token + 跳 /login）。
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useResetPassword } from '../api/queries';
import { useUI } from './UIComponents';
import { errMsg } from '../utils';

const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { toast } = useUI();
  const reset = useResetPassword();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast('error', '错误', '两次输入的新密码不一致');
      return;
    }
    try {
      await reset.mutateAsync({ token, newPassword: password });
      toast('success', '密码已重置', '请使用新密码登录');
    } catch (err) {
      toast('error', '重置失败', errMsg(err, '链接可能已过期，请联系管理员重新获取'));
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="glass-panel rounded-3xl p-8 text-center max-w-md">
          <h1 className="text-xl font-bold text-white mb-2">链接无效</h1>
          <p className="text-slate-400 text-sm mb-6">缺少重置令牌，请通过管理员提供的完整链接访问。</p>
          <Link to="/login" className="text-blue-400 hover:text-blue-300 text-sm underline">
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="w-full max-w-md relative z-10 px-4">
        <div className="glass-panel rounded-3xl shadow-2xl p-8 animate-in fade-in-up duration-500">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/50 mb-4 ring-1 ring-white/20">
              <KeyRound className="text-white w-8 h-8 drop-shadow-md" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">重置密码</h1>
            <p className="text-slate-400 text-sm mt-2 tracking-wide">链接一次性有效，请设置新密码</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="reset-password-new" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">新密码</label>
              <input
                id="reset-password-new"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-600/50 focus:border-blue-500/50 outline-none transition-all shadow-inner"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reset-password-confirm" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">确认新密码</label>
              <input
                id="reset-password-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-600/50 focus:border-blue-500/50 outline-none transition-all shadow-inner"
                required
              />
            </div>
            <button
              type="submit"
              disabled={reset.isPending}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3.5 rounded-xl shadow-lg shadow-blue-900/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed border border-white/10"
            >
              {reset.isPending ? '提交中...' : '重置密码'}
            </button>
          </form>

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

export default ResetPasswordPage;
