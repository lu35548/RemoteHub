import { beforeEach, describe, expect, it } from 'vitest';
import { isRdpConfigured, markRdpConfigured } from './utils';

// v1 utils.ts RDP 系统等价迁移（T6）；key 逐字一致保证 v1 用户升级后配置保留
describe('RDP utils（T6）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('markRdpConfigured 写入 rh_rdp_configured=true，isRdpConfigured 读回', () => {
    expect(isRdpConfigured()).toBe(false);
    markRdpConfigured();
    expect(localStorage.getItem('rh_rdp_configured')).toBe('true');
    expect(isRdpConfigured()).toBe(true);
  });
});
