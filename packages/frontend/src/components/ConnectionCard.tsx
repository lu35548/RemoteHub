import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, Copy, Check, Download, Edit2, Loader2, Trash2, Shield, Power, Eye, EyeOff, User as UserIcon, Clock, ExternalLink, ArrowRight, Zap } from 'lucide-react';
import type { ConnectionListItem } from '@remotehub/shared';
import { PROTOCOL_SHORT_LABELS, PROPRIETARY_PROTOCOLS, PROTOCOL_ACTION_META, VPN_TYPE_LABELS, getProtocolColor } from '../constants';
import { useDecryptPassword } from '../api/queries';
import { downloadRdpFile, generateRdpRegistryFile, isRdpConfigured, markRdpConfigured } from '../utils';
import { ProtocolIcon } from './Icons';
import { Modal, useUI } from './UIComponents';

interface ConnectionCardProps {
  connection: ConnectionListItem;
  vpnDependency?: ConnectionListItem;
  onEdit: (conn: ConnectionListItem) => void;
  onDelete: (id: string) => void;
}

const getRelativeTime = (dateStr?: string) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
};

const ConnectionCard: React.FC<ConnectionCardProps> = ({ connection, vpnDependency, onEdit, onDelete }) => {
  const { toast } = useUI();
  const decrypt = useDecryptPassword();
  const [showMenu, setShowMenu] = useState(false);
  // 明文密码经 decrypt-password 按需解密（v2 契约），v1 的本地明文字段不复存在
  const [showPassword, setShowPassword] = useState(false);
  const [plainPassword, setPlainPassword] = useState('');
  // v1 等价复制反馈链：2s 内命中按钮显示 Check
  const [isCopied, setIsCopied] = useState(false);
  const [copyTarget, setCopyTarget] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // RDP 一键直连（v1 等价）：就绪标记来自 localStorage（惰性初始化，v1 为 effect 内 setState，行为等价）
  const [isRdpReady, setIsRdpReady] = useState(() => isRdpConfigured());
  const [showRdpSetup, setShowRdpSetup] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const handleCopy = (text: string, target: string) => {
    navigator.clipboard.writeText(text);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);

    setCopyTarget(target);
    setIsCopied(true);

    const label = target.includes('user') ? '用户名' : target.includes('pass') ? '密码' : '地址';
    toast('success', '已复制', `${label} 已复制到剪贴板`);

    copyTimeoutRef.current = setTimeout(() => {
      setIsCopied(false);
      setCopyTarget(null);
    }, 2000);
  };

  // 解密结果缓存复用：显/隐/复制多次动作只请求一次（卡片以 key=connection.id 挂载，缓存不跨连接）
  const fetchPlainText = async (): Promise<string> => {
    if (plainPassword) return plainPassword;
    const result = await decrypt.mutateAsync(connection.id);
    setPlainPassword(result.password);
    return result.password;
  };

  const handleTogglePassword = async () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    try {
      await fetchPlainText();
      setShowPassword(true);
    } catch {
      toast('error', '解密失败', '无法获取密码明文，请重试');
    }
  };

  // v1 直接复制本地明文；v2 改为按需解密（已解密则复用，不重复请求）
  const handleCopyPassword = async () => {
    try {
      const text = await fetchPlainText();
      handleCopy(text, 'pass_row');
    } catch {
      toast('error', '解密失败', '无法获取密码明文，请重试');
    }
  };

  // SSL_VPN 认证页跳转（无协议前缀时补 https；v1 等价，主按钮/Via 行共用）
  const openVpnPortal = (host: string) => {
    let targetUrl = host;
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = `https://${targetUrl}`;
    window.open(targetUrl, '_blank');
  };

  // v1 handleVpnConnect 等价迁移：依赖 VPN 的 Via 行动作
  const handleVpnConnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!vpnDependency) return;
    if (vpnDependency.vpnType === 'SSL_VPN') {
      openVpnPortal(vpnDependency.host);
    } else {
      navigator.clipboard.writeText(vpnDependency.host);
      toast('success', 'VPN 地址已复制', '请粘贴到客户端进行连接');
    }
  };

  // v1 等价：动态 <a href="rh-rdp://"> 触发自定义协议唤起
  const triggerRdpProtocol = () => {
    const rdpUrl = `rh-rdp://${connection.host}:${connection.port || 3389}`;
    const link = document.createElement('a');
    link.href = rdpUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRdpSetupComplete = () => {
    markRdpConfigured();
    setIsRdpReady(true);
    triggerRdpProtocol();
    setShowRdpSetup(false);
    toast('success', '配置完成', '已保存连接首选项');
  };

  // v1 等价：触发协议后 1.5s 内窗口失焦 = 系统已注册 rh-rdp:// 处理器
  const detectProtocolSupport = (): Promise<boolean> => {
    return new Promise((resolve) => {
      let blurTriggered = false;
      const onBlur = () => {
        blurTriggered = true;
        window.removeEventListener('blur', onBlur);
        resolve(true);
      };
      window.addEventListener('blur', onBlur);
      triggerRdpProtocol();
      setTimeout(() => {
        window.removeEventListener('blur', onBlur);
        if (!blurTriggered) resolve(false);
      }, 1500);
    });
  };

  const stopRdpLaunch = () => {
    setIsLaunching(false);
    if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
  };

  const handleRdpConnect = async () => {
    if (isRdpReady) {
      setIsLaunching(true);
      const checkBlur = () => {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        setTimeout(() => setIsLaunching(false), 500);
        window.removeEventListener('blur', checkBlur);
      };
      window.addEventListener('blur', checkBlur);
      launchTimeoutRef.current = setTimeout(() => {
        triggerRdpProtocol();
      }, 300);
      blurTimeoutRef.current = setTimeout(() => {
        window.removeEventListener('blur', checkBlur);
        setIsLaunching(false);
      }, 5000);
      return;
    }
    setIsDetecting(true);
    const isSupported = await detectProtocolSupport();
    setIsDetecting(false);
    if (isSupported) {
      markRdpConfigured();
      setIsRdpReady(true);
      toast('success', '连接成功', '一键直连协议已就绪');
    } else {
      setShowRdpSetup(true);
    }
  };

  // v1 handleConnect 等价迁移：协议 → 动作分派（vpnType.WEB ↔ SSL_VPN、登录 URL 恒取 host 为 T5 定型的 v2 映射）
  const handleConnect = () => {
    switch (connection.protocol) {
      case 'RDP':
        handleRdpConnect();
        break;
      case 'HTTP':
      case 'HTTPS': {
        const scheme = connection.protocol === 'HTTPS' ? 'https' : 'http';
        const url = `${scheme}://${connection.host}:${connection.port || (connection.protocol === 'HTTPS' ? 443 : 80)}`;
        window.open(url, '_blank');
        toast('info', '正在打开', `正在新标签页访问 ${url}`);
        break;
      }
      case 'SSH': {
        const sshCmd = `ssh ${connection.username || 'user'}@${connection.host}${connection.port ? ` -p ${connection.port}` : ''}`;
        navigator.clipboard.writeText(sshCmd);
        toast('info', '终端命令已复制', 'SSH 协议已唤起');
        window.location.href = `ssh://${connection.username ? connection.username + '@' : ''}${connection.host}`;
        break;
      }
      case 'TODESK':
      case 'SUNLOGIN':
      case 'TEAMVIEWER':
      case 'ANYDESK':
        handleCopy(connection.host, 'host_main');
        break;
      case 'VPN':
        if (connection.vpnType === 'SSL_VPN') {
          openVpnPortal(connection.host);
          toast('info', 'VPN 跳转', '正在前往认证页面');
        } else {
          handleCopy(connection.host, 'host_main');
        }
        break;
      // VNC 无动作（v1 即如此，等价保留）
    }
  };

  const getActionLabel = () => {
    if (connection.protocol === 'VPN') return connection.vpnType === 'SSL_VPN' ? '跳转登录' : '复制 VPN 地址';
    return PROTOCOL_ACTION_META[connection.protocol].actionLabel ?? '连接';
  };

  const isProprietary = PROPRIETARY_PROTOCOLS.includes(connection.protocol);
  const protocolStyle = getProtocolColor(connection.protocol);
  const actionMeta = PROTOCOL_ACTION_META[connection.protocol];
  const tags = connection.tags ? connection.tags.split(',').filter(Boolean) : [];

  return (
    <>
    <div className="group relative flex flex-col h-full bg-slate-900/40 backdrop-blur-sm border border-white/5 rounded-2xl transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:bg-slate-900/60 hover:border-white/10 hover:shadow-2xl hover:shadow-black/50">

      {/* 顶部光晕线 */}
      <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="p-5 flex flex-col h-full">
        {/* 头部 */}
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`relative z-10 w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border backdrop-blur-md shadow-inner transition-all group-hover:scale-105 duration-300 ${protocolStyle} overflow-hidden isolate`}>
              <ProtocolIcon protocol={connection.protocol} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-100 truncate text-[15px] tracking-tight leading-tight" title={connection.name}>{connection.name}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <span className="truncate font-medium">{PROTOCOL_SHORT_LABELS[connection.protocol]}</span>
                {connection.protocol === 'VPN' && connection.vpnType && (
                  <span className="px-1.5 py-0.5 bg-indigo-500/10 rounded-md text-[10px] text-indigo-300 border border-indigo-500/20 font-medium tracking-wide">{VPN_TYPE_LABELS[connection.vpnType].split(' ')[0]}</span>
                )}
              </div>
            </div>
          </div>

          {/* 右上操作区 */}
          <div className="flex items-center gap-1">
            {connection.protocol === 'RDP' && (
              <button onClick={(e) => { e.stopPropagation(); setShowRdpSetup(true); }} className={`p-1.5 rounded-lg transition-all active:scale-90 ${isRdpReady ? 'text-amber-400 hover:bg-amber-500/10' : 'text-slate-600 hover:text-slate-400 hover:bg-white/5'}`} title={isRdpReady ? '已配置直连' : '未配置直连'}>
                <Zap size={16} className={isRdpReady ? 'fill-current' : ''} />
              </button>
            )}
            <div className="relative">
              <button aria-label="更多操作" onClick={() => setShowMenu(!showMenu)} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors active:scale-90"><MoreVertical size={16} /></button>
              {showMenu && (
                <div className="absolute right-0 top-8 w-36 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-20 py-1 animate-in fade-in zoom-in duration-150 ring-1 ring-black/50 origin-top-right">
                  <button onClick={() => { setShowMenu(false); onEdit(connection); }} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"><Edit2 size={12} /> 编辑配置</button>
                  {connection.protocol === 'RDP' && (
                    <>
                      <button onClick={() => { setShowMenu(false); setShowRdpSetup(true); }} className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-white/5 flex items-center gap-2"><Zap size={12} /> {isRdpReady ? '重新配置' : '配置直连'}</button>
                      <button onClick={() => { setShowMenu(false); downloadRdpFile(connection); }} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/5 flex items-center gap-2"><Download size={12} /> 下载 RDP</button>
                    </>
                  )}
                  <button onClick={() => { setShowMenu(false); onDelete(connection.id); }} className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-rose-600 hover:text-white flex items-center gap-2 border-t border-white/10 mt-1"><Trash2 size={12} /> 删除</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 信息区 */}
        <div className="space-y-2.5 flex-1">
          {/* 主机地址 */}
          <div className="group/row relative flex items-center justify-between bg-slate-950/50 rounded-lg p-2.5 border border-white/5 hover:border-blue-500/30 transition-colors">
             <div className="min-w-0 flex flex-col">
               <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">{isProprietary ? 'ID / Code' : 'HOST'}</span>
               <span className="text-slate-200 font-mono text-sm truncate select-all">{connection.host}</span>
             </div>
             <button
               aria-label="复制主机地址"
               onClick={(e) => { e.stopPropagation(); handleCopy(connection.host, 'host_main'); }}
               className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md opacity-0 group-hover/row:opacity-100 transition-all active:scale-90"
             >
               {isCopied && copyTarget === 'host_main' ? <Check size={14} /> : <Copy size={14} />}
             </button>
          </div>

          {/* 用户名 / 密码区 */}
          {(connection.username || connection.hasPassword) && (
            <div className="grid grid-cols-2 gap-2">
              {connection.username && (
                <div className="group/row relative flex flex-col justify-center bg-slate-950/50 rounded-lg p-2 border border-white/5 hover:border-blue-500/30 transition-colors h-[52px]">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">USER</span>
                  <span className="text-slate-300 font-mono text-xs truncate select-all pr-8">{connection.username}</span>
                  <button
                    aria-label="复制用户名"
                    onClick={(e) => { e.stopPropagation(); handleCopy(connection.username!, 'user_row'); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md opacity-0 group-hover/row:opacity-100 transition-all active:scale-95"
                  >
                    {isCopied && copyTarget === 'user_row' ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              )}

              {connection.hasPassword && (
                <div className="group/row relative flex flex-col justify-center bg-slate-950/50 rounded-lg p-2 border border-white/5 hover:border-blue-500/30 transition-colors h-[52px] col-span-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">PASS</span>
                  <span className="text-slate-300 font-mono text-xs truncate select-all pr-14">
                    {showPassword ? plainPassword : '••••••••'}
                  </span>

                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <button
                      onClick={handleTogglePassword}
                      title={showPassword ? '隐藏' : '显示'}
                      className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors rounded-md active:scale-95"
                    >
                      {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      aria-label="复制密码"
                      title="复制"
                      onClick={(e) => { e.stopPropagation(); handleCopyPassword(); }}
                      className={`p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-all active:scale-95 ${isCopied && copyTarget === 'pass_row' ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}
                    >
                      {isCopied && copyTarget === 'pass_row' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VPN 依赖 */}
          {vpnDependency && (
            <div className="flex items-center justify-between text-[10px] bg-indigo-500/5 px-3 py-2 rounded-lg border border-indigo-500/10 group-hover:border-indigo-500/20 transition-colors">
              <div className="flex items-center gap-2 text-indigo-300/80"><Shield size={12} /><span>Via: {vpnDependency.name}</span></div>
              <button onClick={handleVpnConnect} className="text-indigo-400 hover:text-indigo-200 flex items-center gap-1 font-medium transition-colors"><Power size={10} />{vpnDependency.vpnType === 'SSL_VPN' ? '跳转' : '复制'}</button>
            </div>
          )}

          {/* 标签 */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((tag, idx) => (
                <span key={idx} className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-800/40 text-slate-500 border border-white/5 group-hover:border-white/10 transition-colors">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 主操作按钮 */}
        <button
          onClick={handleConnect}
          disabled={isDetecting}
          className={`w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60
            ${actionMeta.neutralAction
              ? 'bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/10 shadow-black/20'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/20 hover:shadow-blue-900/40 border border-white/10'
            }`}
        >
          {isDetecting ? (
            <><Loader2 size={16} className="animate-spin text-white/70" /> <span className="text-white/90">呼叫中...</span></>
          ) : (
            <>
              {actionMeta.neutralAction && isCopied && copyTarget === 'host_main'
                ? '已复制'
                : getActionLabel()}
              {!actionMeta.neutralAction && connection.protocol !== 'RDP' && <ExternalLink size={14} className="opacity-70" />}
              {connection.protocol === 'RDP' && <Zap size={16} className={`${isRdpReady ? 'fill-current text-amber-200' : 'text-blue-200'}`} />}
            </>
          )}
        </button>

        {/* 审计脚注 */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5"><UserIcon size={12} className="opacity-70" /> {connection.updatedBy.nickname}</div>
          <div className="flex items-center gap-1.5"><Clock size={12} className="opacity-70" /> {getRelativeTime(connection.updatedAt)}</div>
        </div>
      </div>
    </div>

    {/* RDP 唤起中 Modal（v1 等价） */}
    <Modal isOpen={isLaunching} onClose={stopRdpLaunch} className="max-w-sm rounded-3xl border-0 overflow-hidden z-[100]">
      <div className="relative p-8 flex flex-col items-center text-center bg-slate-950/80 backdrop-blur-3xl border border-white/10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse pointer-events-none"></div>
        <div className="relative mb-6"><div className="w-16 h-16 bg-slate-900/80 rounded-2xl border border-white/10 flex items-center justify-center shadow-2xl relative ring-1 ring-white/5"><Loader2 size={32} className="text-blue-400 animate-spin" /><div className="absolute -bottom-2 -right-2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-900 shadow-lg">RDP</div></div></div>
        <h3 className="text-xl font-bold text-white mb-2 tracking-tight">正在建立连接</h3>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">正在呼叫远程桌面客户端。<br /><span className="text-slate-500 text-xs mt-2 block">请在系统弹窗中勾选 <span className="text-slate-300 font-medium border-b border-slate-700">始终允许</span> 以实现永久一键直连。</span></p>
        <button onClick={stopRdpLaunch} className="px-6 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs rounded-full transition-colors border border-white/5 backdrop-blur-md">取消呼叫</button>
      </div>
    </Modal>

    {/* RDP 直连配置引导（v1 等价；底部文案照 v1 运行态：点击仅关闭弹窗） */}
    <Modal isOpen={showRdpSetup} onClose={() => setShowRdpSetup(false)} className="max-w-md rounded-2xl overflow-hidden">
      <div className="relative p-8 flex flex-col items-center text-center bg-slate-950">
        <div className="relative mb-6"><div className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl transition-all duration-500 ring-1 ring-white/10 ${isRdpReady ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20' : 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-blue-500/20'}`}><Zap size={40} className="text-white fill-current drop-shadow-lg" /></div></div>
        <div className="space-y-2 mb-8"><h3 className="text-2xl font-bold text-white tracking-tight">{isRdpReady ? '直连功能已就绪' : '启用一键直连'}</h3><p className="text-sm text-slate-400 leading-relaxed px-4">{isRdpReady ? '浏览器已获得调用系统权限，现在点击连接即可直接唤起 Windows 远程桌面。' : '由于浏览器安全限制，请下载并运行注册表脚本以解锁原生级远程桌面体验。'}</p></div>
        <div className="w-full space-y-3">
          <button onClick={generateRdpRegistryFile} className="w-full group relative flex items-center justify-between px-5 py-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl transition-all duration-200"><div className="flex items-center gap-4"><div className="p-2 bg-slate-900 rounded-lg text-blue-400 group-hover:text-blue-300 ring-1 ring-white/5 transition-colors"><Download size={20} /></div><div className="text-left"><div className="text-sm font-bold text-slate-200 group-hover:text-white">1. 下载配置脚本</div><div className="text-[11px] text-slate-500 font-mono">RemoteHub-OneClick-Install.reg</div></div></div><ArrowRight size={18} className="text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" /></button>
          <button onClick={handleRdpSetupComplete} className="w-full group relative flex items-center justify-center gap-2 px-5 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 transition-all active:scale-[0.98] ring-1 ring-white/10"><span>2. 我已安装，完成设置</span><Check size={20} /></button>
        </div>
        <button onClick={() => setShowRdpSetup(false)} className="mt-6 text-xs text-slate-500 hover:text-slate-300 transition-colors border-b border-transparent hover:border-slate-500 pb-0.5">暂不配置，仅下载 .rdp 文件</button>
      </div>
    </Modal>
    </>
  );
};

export default ConnectionCard;
