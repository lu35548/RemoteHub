// packages/frontend/src/components/MfaChallengePage.tsx
// 票 #31：/mfa 挑战页——mfaPending 三相状态机：
// setup（扫码绑定 → confirm）→ codes（恢复码一次性展示）→ challenge（TOTP/恢复码二段验证）。
// mfaPending 为纯内存态：本页无 pending 直接弹回 /login（刷新即重走密码）。
import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, AlertCircle, Copy } from 'lucide-react';
import { useUI } from './UIComponents';
import { useMfaSetup, useMfaConfirm, useMfaVerify } from '../api/queries';
import { setMfaPending, getMfaPending } from '../api/mfaPending';
import type { ApiErrorResponse } from '@remotehub/shared';

/** ApiErrorResponse → error.code 提取（非标准形状回落空串） */
function errCode(err: unknown): string {
  return (err as ApiErrorResponse)?.error?.code ?? '';
}

const MfaChallengePage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useUI();
  const pending = getMfaPending();

  const [phase, setPhase] = useState<'setup' | 'codes' | 'challenge'>(
    pending?.mfaStage === 'setup' ? 'setup' : 'challenge',
  );
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [error, setError] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const setupQuery = useMfaSetup(pending?.mfaStage === 'setup' && phase === 'setup');
  const confirmMutation = useMfaConfirm();
  const verifyMutation = useMfaVerify();

  if (!pending) {
    return <Navigate to="/login" replace />;
  }

  // 绑定信息拉取失败分路：挑战 token 过期/2FA 状态冲突 → 弹回登录页重走密码
  if (pending.mfaStage === 'setup' && phase === 'setup' && setupQuery.isError) {
    const code = errCode(setupQuery.error);
    if (code === 'MFA_002' || code === 'MFA_003') {
      return <Navigate to="/login" replace />;
    }
  }

  // ─── 二段验证（stage=verify 或绑定完成后）──────────────────────
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const body = mode === 'totp' ? { token: code } : { recoveryCode: code };
    try {
      const result = await verifyMutation.mutateAsync(body);
      setMfaPending(null);
      toast('success', '欢迎回来', `${result.user.nickname}，验证成功`);
      navigate('/');
    } catch (err) {
      if (errCode(err) === 'MFA_002') {
        // 挑战 token 无效/过期 → 清态回登录（不进 client 的 refresh 强制登出逻辑）
        setMfaPending(null);
        navigate('/login');
        return;
      }
      setError((err as ApiErrorResponse)?.error?.message || '验证失败，请重试');
    }
  };

  // ─── 绑定流 confirm ────────────────────────────────────────────
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!setupQuery.data) return;
    try {
      const { recoveryCodes: codes } = await confirmMutation.mutateAsync({
        secret: setupQuery.data.secret,
        token: confirmCode,
      });
      setRecoveryCodes(codes);
      setPhase('codes');
    } catch (err) {
      if (errCode(err) === 'MFA_002') {
        setMfaPending(null);
        navigate('/login');
        return;
      }
      setError((err as ApiErrorResponse)?.error?.message || '验证码错误，请重试');
    }
  };

  const challengeForm = (submitting: boolean) => (
    <form onSubmit={handleVerify} className="space-y-5">
      <div className="flex rounded-xl bg-slate-950/50 border border-white/10 p-1 gap-1">
        <button
          type="button"
          onClick={() => { setMode('totp'); setCode(''); setError(''); }}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'totp' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          动态验证码
        </button>
        <button
          type="button"
          onClick={() => { setMode('recovery'); setCode(''); setError(''); }}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'recovery' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          恢复码
        </button>
      </div>

      {mode === 'totp' ? (
        <input
          type="text"
          inputMode="numeric"
          aria-label="动态验证码"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5em] placeholder:text-slate-600 focus:ring-2 focus:ring-blue-600/50 outline-none"
          placeholder="000000"
          autoFocus
        />
      ) : (
        <input
          type="text"
          aria-label="恢复码"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-mono focus:ring-2 focus:ring-blue-600/50 outline-none"
          placeholder="XXXXX-XXXXX"
        />
      )}

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || code.length === 0}
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-all border border-white/10"
      >
        验证并登录
      </button>
    </form>
  );

  // ─── 渲染 ──────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (phase === 'setup' && setupQuery.data) {
    body = (
      <form onSubmit={handleConfirm} className="space-y-5">
        <p className="text-sm text-slate-400">使用验证器 App 扫描二维码，或手动输入密钥，然后输入 6 位动态码完成绑定。</p>
        <div className="flex justify-center">
          <div className="bg-white p-3 rounded-2xl">
            <QRCodeSVG value={setupQuery.data.otpauthUri} size={168} level="M" marginSize={2} bgColor="#ffffff" fgColor="#0f172a" title="扫描绑定双因素认证" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">手动输入密钥</label>
          <div className="bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-300 text-center font-mono text-sm break-all select-all">
            {setupQuery.data.secret}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">验证码确认</label>
          <input
            type="text"
            inputMode="numeric"
            aria-label="验证码确认"
            maxLength={6}
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5em] focus:ring-2 focus:ring-blue-600/50 outline-none"
            placeholder="000000"
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={confirmMutation.isPending || confirmCode.length === 0}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-all border border-white/10"
        >
          确认绑定
          </button>
      </form>
    );
  } else if (phase === 'codes') {
    body = (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">请保存恢复码</h3>
          <p className="text-xs text-slate-400">每个恢复码仅可使用一次，且不会再次显示。丢失验证器时可用于登录。</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {recoveryCodes.map((c) => (
            <div key={c} className="bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm text-center">
              {c}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(recoveryCodes.join('\n'));
              toast('success', '已复制', '恢复码已复制到剪贴板');
            } catch {
              toast('error', '复制失败', '请手动选中恢复码复制');
            }
          }}
          className="w-full border border-white/10 hover:bg-slate-800 text-slate-200 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Copy size={16} /> 复制全部
        </button>
        <button
          type="button"
          onClick={() => setPhase('challenge')}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3.5 rounded-xl transition-all border border-white/10"
        >
          我已保存，前往验证
        </button>
      </div>
    );
  } else {
    body = challengeForm(verifyMutation.isPending);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow" />
      </div>
      <div className="w-full max-w-md relative z-10 px-4">
        <div className="glass-panel rounded-3xl shadow-2xl p-8 animate-in fade-in-up duration-500">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/50 mb-3 ring-1 ring-white/20">
              <ShieldCheck className="text-white w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {phase === 'challenge' ? '双因素验证' : '双因素认证绑定'}
            </h1>
            <p className="text-slate-400 text-xs mt-1.5">
              {phase === 'challenge' ? '输入验证器中的动态码完成登录' : '绑定成功后即可使用动态码登录'}
            </p>
          </div>
          {body}
        </div>
      </div>
    </div>
  );
};

export default MfaChallengePage;
