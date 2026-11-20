// packages/frontend/src/api/mfaPending.ts
// 票 #31：mfaPending 二段挑战态——纯内存存储（刷新即失 → 重走密码，票面钦定口径）。
// LoginPage 在登录响应为 mfaPending 时写入；MfaChallengePage 完成或过期后清空。
import type { MfaPendingLoginResponse } from '@remotehub/shared';

let pending: MfaPendingLoginResponse | null = null;

export function setMfaPending(p: MfaPendingLoginResponse | null): void {
  pending = p;
}

export function getMfaPending(): MfaPendingLoginResponse | null {
  return pending;
}
