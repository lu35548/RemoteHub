
import { RemoteConnection } from './types';

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// --- RDP Utils ---
const RDP_CONFIG_KEY = 'rh_rdp_configured';
export const isRdpConfigured = (): boolean => localStorage.getItem(RDP_CONFIG_KEY) === 'true';
export const markRdpConfigured = () => localStorage.setItem(RDP_CONFIG_KEY, 'true');

export const downloadRdpFile = (connection: RemoteConnection) => {
  const content = `full address:s:${connection.host}:${connection.port || 3389}\nusername:s:${connection.username || ''}\nprompt for credentials:i:1`;
  const blob = new Blob([content], { type: 'application/x-rdp' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${connection.name}.rdp`;
  a.click();
};

export const generateRdpRegistryFile = () => {
  const regContent = `Windows Registry Editor Version 5.00\n\n[HKEY_CLASSES_ROOT\\rh-rdp]\n@="URL:RemoteHub RDP Protocol"\n"URL Protocol"=""\n\n[HKEY_CLASSES_ROOT\\rh-rdp\\shell\\open\\command]\n@="cmd /V:ON /C \\"set url=%1 & set url=!url:rh-rdp://=! & set url=!url:rh-rdp:=! & set url=!url:/=! & start mstsc /v:!url!\\""`;
  const blob = new Blob([regContent], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RemoteHub-OneClick-Install.reg`;
  a.click();
};

export const getProtocolColor = (protocol: any): string => {
   switch (protocol) {
    case '桌面远程 (RDP)': return 'text-blue-400 bg-blue-500/10 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]';
    case 'SSH (Linux)': return 'text-slate-200 bg-slate-700 border-slate-500 shadow-[0_0_10px_rgba(148,163,184,0.2)]';
    case 'ToDesk': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]';
    case 'VPN': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/50';
    default: return 'text-purple-400 bg-purple-500/10 border-purple-500/50';
  }
};
