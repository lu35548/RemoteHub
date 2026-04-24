import { describe, it, expect } from 'vitest';
import {
  validateUsername, validateNickname, validatePassword,
  validateProjectName, validateConnectionName,
  validateHost, validatePort, validateTags,
} from './validators.js';

describe('validateUsername', () => {
  it('接受合法用户名', () => {
    expect(validateUsername('admin')).toEqual({ valid: true });
    expect(validateUsername('user_01')).toEqual({ valid: true });
  });
  it('拒绝过短', () => {
    expect(validateUsername('ab').valid).toBe(false);
  });
  it('拒绝过长', () => {
    expect(validateUsername('a'.repeat(51)).valid).toBe(false);
  });
  it('拒绝非法字符', () => {
    expect(validateUsername('user-name').valid).toBe(false);
    expect(validateUsername('用户名').valid).toBe(false);
  });
});

describe('validatePassword', () => {
  it('接受合法密码', () => {
    expect(validatePassword('Pass1234')).toEqual({ valid: true });
  });
  it('拒绝过短', () => {
    expect(validatePassword('Ab1').valid).toBe(false);
  });
  it('拒绝无大写', () => {
    expect(validatePassword('password1').valid).toBe(false);
  });
  it('拒绝无小写', () => {
    expect(validatePassword('PASSWORD1').valid).toBe(false);
  });
  it('拒绝无数字', () => {
    expect(validatePassword('Password').valid).toBe(false);
  });
  it('拒绝超长', () => {
    expect(validatePassword('A1' + 'a'.repeat(127)).valid).toBe(false);
  });
});

describe('validatePort', () => {
  it('接受合法端口', () => {
    expect(validatePort(80)).toEqual({ valid: true });
    expect(validatePort(443)).toEqual({ valid: true });
    expect(validatePort(3389)).toEqual({ valid: true });
  });
  it('拒绝超出范围', () => {
    expect(validatePort(0).valid).toBe(false);
    expect(validatePort(65536).valid).toBe(false);
  });
  it('接受 null', () => {
    expect(validatePort(null)).toEqual({ valid: true });
  });
});

describe('validateProjectName', () => {
  it('拒绝空字符串', () => {
    expect(validateProjectName('').valid).toBe(false);
  });
  it('拒绝超长', () => {
    expect(validateProjectName('x'.repeat(101)).valid).toBe(false);
  });
});

describe('validateHost', () => {
  it('拒绝空', () => { expect(validateHost('').valid).toBe(false); });
  it('拒绝超长', () => { expect(validateHost('x'.repeat(256)).valid).toBe(false); });
  it('接受合法', () => { expect(validateHost('192.168.1.1')).toEqual({ valid: true }); });
});
