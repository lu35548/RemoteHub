// v1 RemoteHub/utils.ts 的 RDP 系统四函数等价迁移（T6，spec story 8a）。
// 参数类型从 v1 RemoteConnection 改为 v2 ConnectionListItem 的字段子集。
import type { ConnectionListItem } from '@remotehub/shared';

// key 逐字照 v1：v1 用户升级 v2 后一键直连配置保留
const RDP_CONFIG_KEY = 'rh_rdp_configured';

export const isRdpConfigured = (): boolean => localStorage.getItem(RDP_CONFIG_KEY) === 'true';

export const markRdpConfigured = () => localStorage.setItem(RDP_CONFIG_KEY, 'true');

export const downloadRdpFile = (connection: Pick<ConnectionListItem, 'name' | 'host' | 'port' | 'username'>) => {
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
