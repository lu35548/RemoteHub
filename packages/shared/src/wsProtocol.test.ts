import { describe, it, expect } from 'vitest';
import { WS_PATH, isNotificationType } from './wsProtocol.js';
import { NOTIFICATION_TYPES } from './enums.js';

describe('WS_PATH', () => {
  it('定值 /api/v1/ws（dev vite proxy ws:true 与生产 nginx 反代同路径）', () => {
    expect(WS_PATH).toBe('/api/v1/ws');
  });
});

describe('isNotificationType', () => {
  it('通知类型全集通过', () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(isNotificationType(t)).toBe(true);
    }
  });

  it('控制码与未知 type 拒绝', () => {
    const controlTypes = ['joined', 'left', 'denied', 'error', 'reconnect_required'];
    for (const t of controlTypes) {
      expect(isNotificationType(t)).toBe(false);
    }
    expect(isNotificationType('UNKNOWN_TYPE')).toBe(false);
    expect(isNotificationType('force_logout')).toBe(false); // 大小写敏感
  });

  it('非字符串拒绝', () => {
    for (const v of [null, undefined, 42, true, {}, [], () => {}]) {
      expect(isNotificationType(v)).toBe(false);
    }
  });
});
