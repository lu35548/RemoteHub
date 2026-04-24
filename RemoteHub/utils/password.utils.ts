/**
 * Frontend Password Utility
 * Mirrors the backend password service for client-side validation
 */

export interface PasswordStrengthResult {
  isValid: boolean;
  score: number; // 0-4
  feedback: string[];
  isStrong: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  strength: PasswordStrengthResult;
  errors: string[];
}

export class PasswordUtils {
  private readonly passwordMinLength = 8;

  /**
   * ⚠️ 安全警告：此方法已弃用
   * LocalStorage模式不安全，密码验证应始终通过后端API进行
   * 此方法仅保持向后兼容性，不应在新代码中使用
   * @deprecated 请使用API模式进行密码验证
   */
  public hashPassword(pwd: string): string {
    console.warn('⚠️ SECURITY WARNING: Using insecure password hashing. Please migrate to API mode.');
    // 临时使用更安全的（但仍然不推荐）的哈希
    // 在生产环境中应该完全依赖后端API
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd + 'remotehub-salt-2024'); // 添加固定盐值
    return btoa(String.fromCharCode(...data));
  }

  /**
   * ⚠️ 安全警告：此方法已弃用
   * @deprecated 请使用API模式进行密码验证
   */
  public verifyHashedPassword(password: string, hashedPassword: string): boolean {
    console.warn('⚠️ SECURITY WARNING: Using insecure password verification. Please migrate to API mode.');
    return this.hashPassword(password) === hashedPassword;
  }

  /**
   * 检查密码强度（与后端保持一致）
   */
  public checkPasswordStrength(password: string): PasswordStrengthResult {
    const feedback: string[] = [];
    let score = 0;

    // 长度检查
    if (password.length >= this.passwordMinLength) {
      score += 1;
    } else {
      feedback.push(`密码长度至少需要 ${this.passwordMinLength} 个字符`);
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

    const isValid = score >= 3 && password.length >= this.passwordMinLength;
    const isStrong = score >= 4;

    return {
      isValid,
      score: Math.min(4, Math.max(0, score)),
      feedback,
      isStrong,
    };
  }

  /**
   * 检查密码是否为常见弱密码
   */
  public isWeakPassword(password: string): boolean {
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
  public validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    // 检查密码强度
    const strength = this.checkPasswordStrength(password);

    // 检查是否为常见弱密码
    if (this.isWeakPassword(password)) {
      errors.push('此密码过于常见，请选择更安全的密码');
    }

    if (!strength.isValid) {
      errors.push(...strength.feedback);
    }

    return {
      isValid: strength.isValid && !this.isWeakPassword(password),
      strength,
      errors,
    };
  }

  /**
   * 生成随机密码（与后端保持一致）
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
   * 获取密码强度描述
   */
  public getPasswordStrengthDescription(score: number): string {
    switch (score) {
      case 0:
      case 1:
        return '弱';
      case 2:
        return '一般';
      case 3:
        return '强';
      case 4:
        return '非常强';
      default:
        return '未知';
    }
  }

  /**
   * 获取密码强度颜色
   */
  public getPasswordStrengthColor(score: number): string {
    switch (score) {
      case 0:
      case 1:
        return '#dc3545'; // 红色
      case 2:
        return '#ffc107'; // 黄色
      case 3:
        return '#28a745'; // 绿色
      case 4:
        return '#007bff'; // 蓝色
      default:
        return '#6c757d'; // 灰色
    }
  }
}

// 导出单例实例
export const passwordUtils = new PasswordUtils();