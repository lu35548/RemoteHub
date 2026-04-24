
import React, { useState, useEffect } from 'react';
import { X, Save, Shield, Plus, Monitor, Network, Laptop, Lock, Check, Loader2 } from 'lucide-react';
import { ConnectionInput, Project, Protocol, VpnType, RemoteConnection } from '../types';
import { generateId, getProtocolColor } from '../utils';
import { ProtocolIcon } from './Icons';
import { useUI } from './UIComponents';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (connection: ConnectionInput) => Promise<void>;
  projects: Project[];
  connections: RemoteConnection[];
  editingConnection: RemoteConnection | null;
  activeProjectId: string | null;
  onAddProjectRequest: () => void;
}

type TabMode = 'HOST' | 'VPN';

const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  projects,
  connections,
  editingConnection,
  activeProjectId,
  onAddProjectRequest
}) => {
  const { toast } = useUI();
  const [mode, setMode] = useState<TabMode>('HOST');
  const [isCreatingVpnForHost, setIsCreatingVpnForHost] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Use ConnectionInput type for form data
  const [hostFormData, setHostFormData] = useState<Partial<ConnectionInput>>({});
  const [vpnFormData, setVpnFormData] = useState<Partial<ConnectionInput>>({});
  const [tagInput, setTagInput] = useState('');

  const getDefaultProjectId = () => {
    if (editingConnection) return editingConnection.projectId;
    if (activeProjectId) return activeProjectId;
    return projects[0]?.id || '';
  };

  useEffect(() => {
    if (isOpen) {
      const defaultProjectId = getDefaultProjectId();
      if (editingConnection) {
        if (editingConnection.protocol === Protocol.VPN) {
          setMode('VPN');
          // Strip audit data when populating form
          const { createdBy, createdById, createdAt, updatedBy, updatedById, updatedAt, ...rest } = editingConnection;
          setVpnFormData({ ...rest });
          setHostFormData(createEmptyHost(defaultProjectId));
        } else {
          setMode('HOST');
          const { createdBy, createdById, createdAt, updatedBy, updatedById, updatedAt, ...rest } = editingConnection;
          setHostFormData({ ...rest });
          
          if (editingConnection.requiredVpnId) {
            const linkedVpn = connections.find(c => c.id === editingConnection.requiredVpnId);
            if (linkedVpn) {
               const { createdBy, createdById, createdAt, updatedBy, updatedById, updatedAt, ...vpnRest } = linkedVpn;
               setVpnFormData({ ...vpnRest });
            }
            else setVpnFormData(createEmptyVpn(editingConnection.projectId));
          } else {
            setVpnFormData(createEmptyVpn(editingConnection.projectId));
          }
        }
      } else {
        setMode('HOST');
        setHostFormData(createEmptyHost(defaultProjectId));
        setVpnFormData(createEmptyVpn(defaultProjectId));
      }
      setIsCreatingVpnForHost(false);
      setTagInput('');
    }
  }, [isOpen, editingConnection]);

  // FIX: Auto-select newly created project when activeProjectId changes while modal is open
  useEffect(() => {
    if (isOpen && !editingConnection && activeProjectId) {
      setHostFormData(prev => ({ ...prev, projectId: activeProjectId }));
      setVpnFormData(prev => ({ ...prev, projectId: activeProjectId }));
    }
  }, [activeProjectId, isOpen, editingConnection]);

  const createEmptyHost = (projectId?: string): Partial<ConnectionInput> => ({
    id: generateId(),
    projectId: projectId || '',
    name: '',
    host: '',
    protocol: Protocol.RDP,
    username: '',
    password: '',
    notes: '',
    tags: [],
    requiredVpnId: '',
    port: undefined
  });

  const createEmptyVpn = (projectId?: string): Partial<ConnectionInput> => ({
    id: generateId(),
    projectId: projectId || '',
    name: '',
    host: '',
    protocol: Protocol.VPN,
    vpnType: VpnType.CLIENT,
    username: '',
    password: '',
    notes: '',
    tags: []
  });

  if (!isOpen) return null;

  const currentData = mode === 'HOST' ? hostFormData : vpnFormData;
  const setCurrentData = mode === 'HOST' ? setHostFormData : setVpnFormData;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCurrentData(prev => ({ ...prev, [name]: value }));
  };

  const handleProtocolSelect = (p: Protocol) => setHostFormData(prev => ({ ...prev, protocol: p }));
  const handleVpnTypeSelect = (t: VpnType) => setVpnFormData(prev => ({ ...prev, vpnType: t }));

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTags = [...(currentData.tags || [])];
      if (!newTags.includes(tagInput.trim())) {
        newTags.push(tagInput.trim());
        setCurrentData(prev => ({ ...prev, tags: newTags }));
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setCurrentData(prev => ({ ...prev, tags: prev.tags?.filter(t => t !== tag) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentData.name || !currentData.host || !currentData.projectId) {
      toast('error', '校验失败', '请填写必要的名称、主机地址和所属项目');
      return;
    }

    const finalData = { ...currentData } as ConnectionInput;

    if (finalData.protocol === Protocol.VPN && finalData.vpnType === VpnType.WEB) {
      let url = finalData.host.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      finalData.host = url;
      finalData.vpnLoginUrl = url;
    }

    setIsSaving(true);
    try {
      if (mode === 'VPN' && isCreatingVpnForHost) {
        await onSave(finalData); // Wait for save
        setHostFormData(prev => ({ ...prev, requiredVpnId: finalData.id }));
        setMode('HOST');
        setIsCreatingVpnForHost(false);
        setVpnFormData(createEmptyVpn(hostFormData.projectId));
      } else {
        await onSave(finalData); // Wait for save
        onClose();
      }
    } catch (error) {
      console.error(error);
      // Error handled by toast in App.tsx, modal stays open
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAddVpn = () => {
    setIsCreatingVpnForHost(true);
    setMode('VPN');
    setVpnFormData(createEmptyVpn(hostFormData.projectId));
  };

  const HOST_PROTOCOLS = [
    { id: Protocol.RDP, name: '桌面远程' },
    { id: Protocol.SSH, name: 'SSH 终端' },
    { id: Protocol.TODESK, name: 'ToDesk' },
    { id: Protocol.SUNLOGIN, name: '向日葵' },
    { id: Protocol.TEAMVIEWER, name: 'TeamViewer' },
    { id: Protocol.ANYDESK, name: 'AnyDesk' },
    { id: Protocol.HTTPS, name: 'HTTPS' },
    { id: Protocol.HTTP, name: 'HTTP' },
    { id: Protocol.VNC, name: 'VNC' },
  ];

  const VPN_TYPES = [
    { id: VpnType.CLIENT, name: '客户端软件', desc: 'FortiClient, EasyConnect' },
    { id: VpnType.WEB, name: '网页认证', desc: 'Web Portal / SSL VPN' },
    { id: VpnType.OPENVPN, name: 'OpenVPN', desc: 'OpenVPN GUI / Config' },
    { id: VpnType.WIREGUARD, name: 'WireGuard', desc: 'WireGuard Tunnel' },
    { id: VpnType.L2TP, name: 'L2TP/IPsec', desc: '系统原生 VPN' },
  ];

  const isProprietary = [Protocol.TODESK, Protocol.SUNLOGIN, Protocol.TEAMVIEWER, Protocol.ANYDESK].includes(hostFormData.protocol || Protocol.RDP);
  const isWeb = [Protocol.HTTP, Protocol.HTTPS].includes(hostFormData.protocol || Protocol.RDP);
  const vpnOptions = connections.filter(c => c.protocol === Protocol.VPN && c.id !== hostFormData.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-slate-900 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between px-6 pt-5 pb-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {editingConnection ? '编辑连接' : '新建连接'}
              {isCreatingVpnForHost && <span className="text-sm font-normal text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-full">正在添加前置 VPN</span>}
            </h2>
            <button onClick={onClose} disabled={isSaving} className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-full disabled:opacity-50">
              <X size={20} />
            </button>
          </div>
          <div className="flex px-6 gap-8 mt-4">
            <button type="button" onClick={() => !isCreatingVpnForHost && setMode('HOST')} disabled={isCreatingVpnForHost || isSaving} className={`pb-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2 px-1 ${mode === 'HOST' ? 'text-blue-400 border-blue-400' : isCreatingVpnForHost ? 'text-slate-600 border-transparent cursor-not-allowed' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
              <Monitor size={16} /> 远程主机 / 服务
            </button>
            <button type="button" onClick={() => setMode('VPN')} disabled={isSaving} className={`pb-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2 px-1 ${mode === 'VPN' ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
              <Network size={16} /> VPN 节点 / 网关
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto scrollbar-stable bg-slate-950">
          <div className="p-6 grid grid-cols-12 gap-8">
            <div className="col-span-12 lg:col-span-8 space-y-6 min-h-[480px]">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {mode === 'HOST' ? '连接协议' : 'VPN 类型'}
                </label>
                {mode === 'HOST' ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 h-[150px] overflow-hidden content-start">
                    {HOST_PROTOCOLS.map((p) => {
                      const isSelected = hostFormData.protocol === p.id;
                      return (
                        <button key={p.id} type="button" onClick={() => handleProtocolSelect(p.id)} disabled={isSaving} className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg border transition-all duration-200 h-[68px] ${isSelected ? getProtocolColor(p.id) : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:border-slate-700'} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <ProtocolIcon protocol={p.id} className={`w-5 h-5 ${isSelected ? 'text-current' : 'text-slate-500'}`} />
                          <span className="text-[10px] font-medium text-center leading-tight">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 h-[150px] overflow-hidden content-start">
                    {VPN_TYPES.map((t) => {
                      const isSelected = vpnFormData.vpnType === t.id;
                      return (
                        <button key={t.id} type="button" onClick={() => handleVpnTypeSelect(t.id)} disabled={isSaving} className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left h-[68px] ${isSelected ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:border-slate-700'} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-500/20' : 'bg-slate-800'}`}><Shield size={16} className={isSelected ? 'text-indigo-400' : 'text-slate-500'} /></div>
                          <div><div className="text-xs font-medium">{t.name}</div><div className="text-[10px] text-slate-500 truncate max-w-[100px]">{t.desc}</div></div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 auto-rows-max">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">资源名称 <span className="text-rose-400">*</span></label>
                  <input name="name" value={currentData.name || ''} onChange={handleChange} disabled={isSaving} placeholder={mode === 'HOST' ? "例如: 财务部-应用服务器-01" : "例如: 总部 OpenVPN"} required className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50" />
                </div>
                <div className="space-y-2">
                   <label className="text-sm font-medium text-slate-300 flex items-center justify-between"><span>客户 / 项目</span><button type="button" onClick={onAddProjectRequest} disabled={isSaving} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"><Plus size={10} /> 新建项目</button></label>
                  <select name="projectId" value={currentData.projectId || ''} onChange={handleChange} disabled={isSaving} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none disabled:opacity-50">
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">{isProprietary ? '设备代码 / 识别码' : isWeb ? '网址 URL' : mode === 'VPN' && currentData.vpnType === VpnType.WEB ? '登录地址 (URL)' : '主机地址 (IP / Domain)'} <span className="text-rose-400">*</span></label>
                  <div className="flex gap-3">
                    <input name="host" value={currentData.host || ''} onChange={handleChange} disabled={isSaving} placeholder={isProprietary ? "例如: 882 331 992" : isWeb || (mode === 'VPN' && currentData.vpnType === VpnType.WEB) ? "https://..." : "192.168.1.100"} required className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50" />
                    {!isProprietary && !isWeb && mode === 'HOST' && (
                      <input name="port" type="number" value={currentData.port || ''} onChange={handleChange} disabled={isSaving} placeholder={hostFormData.protocol === Protocol.SSH ? "22" : hostFormData.protocol === Protocol.RDP ? "3389" : "Port"} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50" />
                    )}
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
                  {currentData.protocol !== Protocol.HTTP ? (
                    <>
                      <div className="space-y-2"><label className="text-sm font-medium text-slate-300">用户名 / 账号</label><input name="username" value={currentData.username || ''} onChange={handleChange} disabled={isSaving} placeholder={isProprietary ? "无 (可选)" : "root / administrator"} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50" /></div>
                      <div className="space-y-2"><label className="text-sm font-medium text-slate-300">密码 / Key</label><div className="relative"><input name="password" type="password" value={currentData.password || ''} onChange={handleChange} disabled={isSaving} placeholder="••••••••" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50" /><Lock className="absolute right-3 top-2.5 text-slate-600 w-4 h-4" /></div></div>
                    </>
                  ) : <div className="col-span-2 h-[74px]"></div>}
                </div>
              </div>
              {mode === 'HOST' && (
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 mt-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3"><Network size={16} className="text-indigo-400" /> 前置网络 / VPN 通道</label>
                  <div className="flex items-center gap-3">
                     <div className="flex-1 relative">
                       <select name="requiredVpnId" value={hostFormData.requiredVpnId || ''} onChange={handleChange} disabled={isSaving} className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none disabled:opacity-50">
                          <option value="">无需 VPN (直连)</option>
                          {vpnOptions.length > 0 && <optgroup label="现有 VPN 节点">{vpnOptions.map(vpn => <option key={vpn.id} value={vpn.id}>{vpn.name} ({vpn.host})</option>)}</optgroup>}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"><Shield size={14} className="text-slate-500" /></div>
                     </div>
                      <button type="button" onClick={handleQuickAddVpn} disabled={isSaving} className="px-3 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap disabled:opacity-50"><Plus size={14} /> 新建 VPN</button>
                  </div>
                  {hostFormData.requiredVpnId && <div className="mt-2 text-[10px] text-indigo-300 flex items-center gap-1"><Check size={10} /> 已关联: {connections.find(c => c.id === hostFormData.requiredVpnId)?.name}</div>}
                </div>
              )}
            </div>
            <div className="col-span-12 lg:col-span-4 space-y-6 lg:border-l lg:border-slate-800 lg:pl-8">
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-300">标签 (回车添加)</label>
                <div className={`flex flex-wrap gap-2 min-h-[38px] bg-slate-900 border border-slate-700 rounded-lg p-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all ${isSaving ? 'opacity-50' : ''}`}>
                   {currentData.tags?.map((tag, index) => (
                    <span key={index} className="bg-slate-700 text-slate-200 text-xs px-2 py-1 rounded flex items-center gap-1 animate-in zoom-in duration-200">
                      {tag} <button type="button" onClick={() => removeTag(tag)} disabled={isSaving} className="hover:text-white"><X size={10} /></button>
                    </span>
                  ))}
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} disabled={isSaving} placeholder={currentData.tags?.length ? "" : "例如: 生产环境..."} className="bg-transparent border-none outline-none text-sm text-white flex-1 min-w-[80px]" />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-300">备注说明</label>
                <textarea name="notes" value={currentData.notes || ''} onChange={handleChange} disabled={isSaving} rows={4} placeholder="填写更多连接细节..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:opacity-50" />
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><Laptop size={12} /> 连接预览</h4>
                <div className="text-xs text-slate-400 space-y-1">
                  <div className="flex justify-between"><span>类型:</span><span className="text-slate-200">{currentData.protocol?.split(' ')[0]}</span></div>
                  <div className="flex justify-between"><span>目标:</span><span className="text-slate-200 truncate max-w-[150px]">{currentData.host}</span></div>
                </div>
              </div>
            </div>
          </div>
        </form>
        <div className="p-6 border-t border-slate-800 bg-slate-900 flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-6 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium disabled:opacity-50">取消</button>
          <button onClick={handleSubmit} disabled={isSaving} className={`px-8 py-2.5 rounded-lg text-white text-sm font-medium shadow-lg transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${mode === 'HOST' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20'}`}>
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            {isCreatingVpnForHost ? <><Plus size={16} /> {isSaving ? '保存中...' : '添加 VPN 并返回'}</> : <><Save size={16} /> {isSaving ? '保存中...' : (editingConnection ? '保存修改' : '立即创建')}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
