import {
  USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_PATTERN,
  NICKNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH, CONNECTION_NAME_MAX_LENGTH,
  HOST_MAX_LENGTH, PORT_MIN, PORT_MAX, TAGS_MAX_LENGTH,
} from './constants.js';
import { isProtocol, isUserRole, isMemberRole, isVpnType } from './enums.js';

export type ValidationResult = { valid: true } | { valid: false; message: string };

function fail(message: string): { valid: false; message: string } {
  return { valid: false, message };
}

export function validateUsername(value: string): ValidationResult {
  if (value.length < USERNAME_MIN_LENGTH) return fail(`用户名长度不能少于 ${USERNAME_MIN_LENGTH} 个字符`);
  if (value.length > USERNAME_MAX_LENGTH) return fail(`用户名长度不能超过 ${USERNAME_MAX_LENGTH} 个字符`);
  if (!USERNAME_PATTERN.test(value)) return fail('用户名只能包含字母、数字和下划线');
  return { valid: true };
}

export function validateNickname(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('昵称不能为空');
  if (value.length > NICKNAME_MAX_LENGTH) return fail(`昵称长度不能超过 ${NICKNAME_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validatePassword(value: string): ValidationResult {
  if (value.length < PASSWORD_MIN_LENGTH) return fail(`密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
  if (value.length > PASSWORD_MAX_LENGTH) return fail(`密码长度不能超过 ${PASSWORD_MAX_LENGTH} 个字符`);
  if (!/[a-z]/.test(value)) return fail('密码必须包含小写字母');
  if (!/[A-Z]/.test(value)) return fail('密码必须包含大写字母');
  if (!/[0-9]/.test(value)) return fail('密码必须包含数字');
  return { valid: true };
}

export function validateRole(value: string): ValidationResult {
  if (!isUserRole(value)) return fail('无效的用户角色');
  return { valid: true };
}

export function validateMemberRole(value: string): ValidationResult {
  if (!isMemberRole(value)) return fail('无效的成员角色');
  return { valid: true };
}

export function validateProtocol(value: string): ValidationResult {
  if (!isProtocol(value)) return fail('无效的连接协议');
  return { valid: true };
}

export function validateVpnType(value: string | null | undefined): ValidationResult {
  if (value != null && !isVpnType(value)) return fail('无效的 VPN 类型');
  return { valid: true };
}

export function validateProjectName(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('项目名称不能为空');
  if (value.length > PROJECT_NAME_MAX_LENGTH) return fail(`项目名称不能超过 ${PROJECT_NAME_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validateConnectionName(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('连接名称不能为空');
  if (value.length > CONNECTION_NAME_MAX_LENGTH) return fail(`连接名称不能超过 ${CONNECTION_NAME_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validateHost(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('主机地址不能为空');
  if (value.length > HOST_MAX_LENGTH) return fail(`主机地址不能超过 ${HOST_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validatePort(value: number | null | undefined): ValidationResult {
  if (value == null) return { valid: true };
  if (!Number.isInteger(value) || value < PORT_MIN || value > PORT_MAX) {
    return fail(`端口必须在 ${PORT_MIN}-${PORT_MAX} 范围内`);
  }
  return { valid: true };
}

export function validateTags(value: string | null | undefined): ValidationResult {
  if (value != null && value.length > TAGS_MAX_LENGTH) return fail(`标签不能超过 ${TAGS_MAX_LENGTH} 个字符`);
  return { valid: true };
}
