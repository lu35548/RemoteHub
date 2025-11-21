import React, { useState } from 'react';
import { Monitor, Lock, User, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { AuthService } from '../services/auth.service';
import { useUI } from './UIComponents';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useUI();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Simulate network delay for realism + async service
      await new Promise(resolve => setTimeout(resolve, 600));
      const user = await AuthService.login(username, password);
      
      if (user) {
        toast('success', '欢迎回来', `${user.nickname}，系统已准备就绪`);
        onLoginSuccess();
      } else {
        setError('用户名或密码错误');
        setIsLoading(false);
      }
    } catch (err) {
      setError('登录服务异常');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-indigo-600/10 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '2s' }} />
      </div>

      <div className="w-full max-w-md relative z-10 px-4">
        <div className="glass-panel rounded-3xl shadow-2xl p-8 animate-in fade-in-up duration-500">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/50 mb-4 ring-1 ring-white/20">
              <Monitor className="text-white w-8 h-8 drop-shadow-md" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">RemoteHub</h1>
            <p className="text-slate-400 text-sm mt-2 tracking-wide">企业级远程协作与管理平台</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">账号</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                <input 
                  type="text" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-600/50 focus:border-blue-500/50 outline-none transition-all shadow-inner"
                  placeholder="请输入用户名"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">密码</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-blue-600/50 focus:border-blue-500/50 outline-none transition-all shadow-inner"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 animate-in slide-in-from-left-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3.5 rounded-xl shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-4 border border-white/10"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="font-semibold tracking-wide">安全登录</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">
              <ShieldCheck size={10} />
              <span>内部系统 · 仅限授权访问</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;