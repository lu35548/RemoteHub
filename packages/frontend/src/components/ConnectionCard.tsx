import React, { useState } from 'react';
import { MoreVertical, Copy, Edit2, Trash2, Shield, Power, Eye, User as UserIcon, Clock, ExternalLink, Zap } from 'lucide-react';
import type { ConnectionListItem } from '@remotehub/shared';
import { PROTOCOL_SHORT_LABELS, PROPRIETARY_PROTOCOLS, WEB_PROTOCOLS, VPN_TYPE_LABELS, getProtocolColor } from '../constants';
import { ProtocolIcon } from './Icons';

interface ConnectionCardProps {
  connection: ConnectionListItem;
  vpnDependency?: ConnectionListItem;
  onEdit: (conn: ConnectionListItem) => void;
  onDelete: (id: string) => void;
}

// T5：卡片渲染与编辑/删除入口（v1 信息展示等价）；连接动作系统（RDP 直连/SSH 唤起/复制系/密码解密）
// 归 T6（spec story 8a），届时操作按钮解除 disabled 并从 v1 ConnectionCard 恢复动作实现

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
  const [showMenu, setShowMenu] = useState(false);

  const getActionLabel = () => {
    if (connection.protocol === 'RDP') return '一键直连';
    if (connection.protocol === 'SSH') return '打开 SSH';
    if (WEB_PROTOCOLS.includes(connection.protocol)) return '打开网页';
    if (PROPRIETARY_PROTOCOLS.includes(connection.protocol)) return '复制设备码';
    if (connection.protocol === 'VPN') return connection.vpnType === 'SSL_VPN' ? '跳转登录' : '复制 VPN 地址';
    return '连接';
  };

  const isProprietary = PROPRIETARY_PROTOCOLS.includes(connection.protocol);
  const protocolStyle = getProtocolColor(connection.protocol);
  const tags = connection.tags ? connection.tags.split(',').filter(Boolean) : [];

  return (
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
            <div className="relative">
              <button aria-label="更多操作" onClick={() => setShowMenu(!showMenu)} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors active:scale-90"><MoreVertical size={16} /></button>
              {showMenu && (
                <div className="absolute right-0 top-8 w-36 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-20 py-1 animate-in fade-in zoom-in duration-150 ring-1 ring-black/50 origin-top-right">
                  <button onClick={() => { setShowMenu(false); onEdit(connection); }} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"><Edit2 size={12} /> 编辑配置</button>
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
               disabled
               title="即将开放"
               className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md opacity-0 group-hover/row:opacity-100 transition-all active:scale-90 disabled:cursor-not-allowed"
             >
               <Copy size={14} />
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
                    disabled
                    title="即将开放"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md opacity-0 group-hover/row:opacity-100 transition-all active:scale-95 disabled:cursor-not-allowed"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              )}

              {connection.hasPassword && (
                <div className="group/row relative flex flex-col justify-center bg-slate-950/50 rounded-lg p-2 border border-white/5 hover:border-blue-500/30 transition-colors h-[52px] col-span-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">PASS</span>
                  <span className="text-slate-300 font-mono text-xs truncate select-all pr-14">
                    {/* 明文经 decrypt-password 按需解密（T6）；T5 恒遮罩 */}
                    ••••••••
                  </span>

                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <button
                      disabled
                      title="显示"
                      className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors rounded-md active:scale-95 disabled:cursor-not-allowed"
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      disabled
                      title="即将开放"
                      className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-all active:scale-95 disabled:cursor-not-allowed"
                    >
                      <Copy size={12} />
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
              <button disabled title="即将开放" className="text-indigo-400 hover:text-indigo-200 flex items-center gap-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"><Power size={10} />{vpnDependency.vpnType === 'SSL_VPN' ? '跳转' : '复制'}</button>
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

        {/* 主操作按钮（连接动作归 T6，届时解除 disabled） */}
        <button
          disabled
          className={`w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60
            ${isProprietary || connection.protocol === 'VPN'
              ? 'bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/10 shadow-black/20'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/20 hover:shadow-blue-900/40 border border-white/10'
            }`}
        >
          {getActionLabel()}
          {!isProprietary && connection.protocol !== 'VPN' && connection.protocol !== 'RDP' && <ExternalLink size={14} className="opacity-70" />}
          {connection.protocol === 'RDP' && <Zap size={16} className="text-blue-200" />}
        </button>

        {/* 审计脚注 */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5"><UserIcon size={12} className="opacity-70" /> {connection.updatedBy.nickname}</div>
          <div className="flex items-center gap-1.5"><Clock size={12} className="opacity-70" /> {getRelativeTime(connection.updatedAt)}</div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionCard;
