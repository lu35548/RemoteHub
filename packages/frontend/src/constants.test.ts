import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_RESOURCES } from '@remotehub/shared';
import { AUDIT_ACTION_LABELS, AUDIT_RESOURCE_LABELS } from './constants';

// 票 #22：审计枚举 → 中文标签全量表（P0-9 审计页复用）。
// Record<AuditAction, string> 类型化让键全量由 tsc 门保证；本文件是运行时防线（防 as 绕过/漏译）。
describe('审计中文标签表', () => {
  it('AUDIT_ACTION_LABELS：21 键全量对齐 AUDIT_ACTIONS（含 SECURITY_SUSPICIOUS_IP），值非空', () => {
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect(Object.keys(AUDIT_ACTION_LABELS)).toContain('SECURITY_SUSPICIOUS_IP');
    for (const v of Object.values(AUDIT_ACTION_LABELS)) expect(v.trim()).not.toBe('');
  });

  it('AUDIT_RESOURCE_LABELS：6 键全量对齐 AUDIT_RESOURCES，值非空', () => {
    expect(Object.keys(AUDIT_RESOURCE_LABELS).sort()).toEqual([...AUDIT_RESOURCES].sort());
    for (const v of Object.values(AUDIT_RESOURCE_LABELS)) expect(v.trim()).not.toBe('');
  });
});
