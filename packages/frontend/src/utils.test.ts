import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, formatTime, isRdpConfigured, markRdpConfigured } from './utils';

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

// formatTime（P0-9 从 AdminDashboardPage 提升）：MM-DD HH:mm 形状（toLocaleString 受运行时区影响，断形状不断具体值）
describe('formatTime（票 #23）', () => {
  it('ISO 时间 → MM-DD HH:mm', () => {
    expect(formatTime('2026-09-23T08:05:00.000Z')).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

// downloadBlob（票 #23 review 收敛：rdp/csv 两处 a[download] 机制共享）
describe('downloadBlob（票 #23）', () => {
  it('blob → a[download] 触发保存并回收 objectURL', () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:m'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // a.click() 无参调用，取元素只能经 this（jsdom 场景的正当 alias）
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      clicked = this;
    });

    downloadBlob(new Blob(['x'], { type: 'text/csv' }), 'f.csv');

    expect(clicked?.download).toBe('f.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:m');

    vi.restoreAllMocks();
  });
});
