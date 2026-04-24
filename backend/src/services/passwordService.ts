import bcrypt from 'bcryptjs';
import { config } from '../config/config';

export interface PasswordStrengthResult {
  isValid: boolean;
  score: number; // 0-4
  feedback: string[];
  isStrong: boolean;
}

export class PasswordService {
  private readonly saltRounds = 12;

  /**
   * 哈希密码
   */
  public async hashPassword(password: string): Promise<string> {
    try {
      const salt = await bcrypt.genSalt(this.saltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);
      return hashedPassword;
    } catch (error) {
      throw new Error('Failed to hash password');
    }
  }

  /**
   * 验证密码
   */
  public async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
      const isValid = await bcrypt.compare(password, hashedPassword);
      return isValid;
    } catch (error) {
      throw new Error('Failed to verify password');
    }
  }

  /**
   * 检查密码强度
   */
  public checkPasswordStrength(password: string): PasswordStrengthResult {
    const feedback: string[] = [];
    let score = 0;

    // 长度检查
    if (password.length >= config.security.passwordMinLength) {
      score += 1;
    } else {
      feedback.push(`密码长度至少需要 ${config.security.passwordMinLength} 个字符`);
    }

    // 包含大写字母
    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('密码需要包含至少一个大写字母');
    }

    // 包含小写字母
    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('密码需要包含至少一个小写字母');
    }

    // 包含数字
    if (/\d/.test(password)) {
      score += 1;
    } else {
      feedback.push('密码需要包含至少一个数字');
    }

    // 包含特殊字符
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 1;
    } else {
      feedback.push('密码需要包含至少一个特殊字符');
    }

    // 额外的安全检查
    if (password.toLowerCase().includes('password')) {
      feedback.push('密码不能包含 "password"');
      score = Math.max(0, score - 1);
    }

    if (password.toLowerCase().includes('123456')) {
      feedback.push('密码不能包含常见的数字序列');
      score = Math.max(0, score - 1);
    }

    if (password.toLowerCase() === 'qwerty') {
      feedback.push('密码不能使用常见的键盘模式');
      score = Math.max(0, score - 1);
    }

    const isValid = score >= 3 && password.length >= config.security.passwordMinLength;
    const isStrong = score >= 4;

    return {
      isValid,
      score: Math.min(4, Math.max(0, score)),
      feedback,
      isStrong,
    };
  }

  /**
   * 生成随机密码
   */
  public generateRandomPassword(length: number = 12): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const allChars = uppercase + lowercase + numbers + symbols;

    let password = '';

    // 确保至少包含每种类型的字符
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // 填充剩余长度
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // 打乱字符顺序
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * 检查密码是否已被泄露（简化版本，实际应用中应该使用 HaveIBeenPwned API）
   */
  public async isPasswordCompromised(password: string): Promise<boolean> {
    // 这里应该调用 HaveIBeenPwned API 或类似服务
    // 为了演示，我们只检查一些常见的弱密码
    const commonPasswords = [
      '123456', 'password', '123456789', '12345678', '12345',
      '1234567', '1234567890', 'qwerty', 'abc123', '111111',
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];

    return commonPasswords.includes(password.toLowerCase());
  }

  /**
   * 验证密码是否符合所有安全要求
   */
  public async validatePassword(password: string): Promise<{
    isValid: boolean;
    strength: PasswordStrengthResult;
    isCompromised: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // 检查密码强度
    const strength = this.checkPasswordStrength(password);

    // 检查是否已被泄露
    const isCompromised = await this.isPasswordCompromised(password);

    if (isCompromised) {
      errors.push('此密码已被泄露，请选择其他密码');
    }

    if (!strength.isValid) {
      errors.push(...strength.feedback);
    }

    return {
      isValid: strength.isValid && !isCompromised,
      strength,
      isCompromised,
      errors,
    };
  }
}

export const passwordService = new PasswordService();