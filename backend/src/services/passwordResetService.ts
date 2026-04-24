import { jwtService } from './jwtService';
import { logger } from '../utils/logger';
import { EmailServiceError, InvalidPasswordResetTokenError, PasswordResetTokenExpiredError } from '../utils/errors';

export interface PasswordResetRequest {
  userId: string;
  email: string;
  token: string;
  requestedAt: Date;
  expiresAt: Date;
  isUsed: boolean;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

export interface PasswordResetOptions {
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  expiresInHours?: number;
}

export class PasswordResetService {
  // 在实际应用中，这应该存储在数据库中
  private resetRequests: Map<string, PasswordResetRequest> = new Map();

  /**
   * 生成密码重置令牌
   */
  private generateResetToken(): string {
    const randomBytes = require('crypto').randomBytes(32);
    return randomBytes.toString('hex');
  }

  /**
   * 创建密码重置请求
   */
  public async createPasswordResetRequest(options: PasswordResetOptions): Promise<string> {
    const token = this.generateResetToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.expiresInHours || 1) * 60 * 60 * 1000);

    const resetRequest: PasswordResetRequest = {
      userId: options.userId,
      email: options.email,
      token,
      requestedAt: now,
      expiresAt,
      isUsed: false,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    };

    // 存储重置请求
    this.resetRequests.set(token, resetRequest);

    // 发送重置邮件
    await this.sendPasswordResetEmail(options.email, token);

    logger.info(`Password reset request created`, {
      userId: options.userId,
      email: options.email,
      token: token.substring(0, 8) + '...', // 只记录部分令牌
      expiresAt: expiresAt.toISOString(),
      ipAddress: options.ipAddress,
    });

    return token;
  }

  /**
   * 验证密码重置令牌
   */
  public async validateResetToken(token: string): Promise<PasswordResetRequest> {
    const resetRequest = this.resetRequests.get(token);

    if (!resetRequest) {
      throw new InvalidPasswordResetTokenError('重置令牌不存在');
    }

    if (resetRequest.isUsed) {
      throw new InvalidPasswordResetTokenError('重置令牌已被使用');
    }

    if (new Date() > resetRequest.expiresAt) {
      throw new PasswordResetTokenExpiredError('重置令牌已过期');
    }

    return resetRequest;
  }

  /**
   * 使用密码重置令牌
   */
  public async useResetToken(token: string): Promise<PasswordResetRequest> {
    const resetRequest = await this.validateResetToken(token);

    resetRequest.isUsed = true;
    this.resetRequests.set(token, resetRequest);

    logger.info(`Password reset token used`, {
      userId: resetRequest.userId,
      email: resetRequest.email,
      token: token.substring(0, 8) + '...',
    });

    return resetRequest;
  }

  /**
   * 撤销密码重置令牌
   */
  public async revokeResetToken(token: string): Promise<boolean> {
    const resetRequest = this.resetRequests.get(token);

    if (!resetRequest) {
      return false;
    }

    resetRequest.isUsed = true;
    this.resetRequests.set(token, resetRequest);

    logger.info(`Password reset token revoked`, {
      userId: resetRequest.userId,
      email: resetRequest.email,
      token: token.substring(0, 8) + '...',
    });

    return true;
  }

  /**
   * 撤销用户的所有重置令牌
   */
  public async revokeAllUserResetTokens(userId: string, reason?: string): Promise<number> {
    let revokedCount = 0;

    for (const [token, resetRequest] of this.resetRequests.entries()) {
      if (resetRequest.userId === userId && !resetRequest.isUsed) {
        resetRequest.isUsed = true;
        resetRequest.reason = reason || 'Manual revocation';
        this.resetRequests.set(token, resetRequest);
        revokedCount++;
      }
    }

    if (revokedCount > 0) {
      logger.info(`All password reset tokens revoked for user`, {
        userId,
        revokedCount,
      });
    }

    return revokedCount;
  }

  /**
   * 清理过期的重置令牌
   */
  public async cleanupExpiredTokens(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [token, resetRequest] of this.resetRequests.entries()) {
      if (now > resetRequest.expiresAt) {
        this.resetRequests.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired password reset tokens`, {
        cleanedCount,
        timestamp: now.toISOString(),
      });
    }

    return cleanedCount;
  }

  /**
   * 获取用户的重置令牌数量
   */
  public async getUserResetTokenCount(userId: string, activeOnly: boolean = false): Promise<number> {
    let count = 0;

    for (const resetRequest of this.resetRequests.values()) {
      if (resetRequest.userId === userId) {
        if (!activeOnly || (!resetRequest.isUsed && new Date() <= resetRequest.expiresAt)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 检查用户是否有活跃的重置请求
   */
  public async hasActiveResetRequest(userId: string): Promise<boolean> {
    for (const resetRequest of this.resetRequests.values()) {
      if (
        resetRequest.userId === userId &&
        !resetRequest.isUsed &&
        new Date() <= resetRequest.expiresAt
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取重置请求统计信息
   */
  public async getResetRequestStats(): Promise<{
    totalRequests: number;
    activeRequests: number;
    expiredRequests: number;
    usedRequests: number;
  }> {
    const now = new Date();
    let activeCount = 0;
    let expiredCount = 0;
    let usedCount = 0;

    for (const resetRequest of this.resetRequests.values()) {
      if (resetRequest.isUsed) {
        usedCount++;
      } else if (now > resetRequest.expiresAt) {
        expiredCount++;
      } else {
        activeCount++;
      }
    }

    return {
      totalRequests: this.resetRequests.size,
      activeRequests: activeCount,
      expiredRequests: expiredCount,
      usedRequests: usedCount,
    };
  }

  /**
   * 发送密码重置邮件
   */
  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    try {
      // 这里应该集成实际的邮件服务
      // 例如使用Nodemailer、SendGrid等

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

      // 模拟发送邮件
      logger.info(`Password reset email sent to ${email}`, {
        email,
        resetUrl,
        token: token.substring(0, 8) + '...',
      });

      // 实际实现示例：
      // const nodemailer = require('nodemailer');
      // const transporter = nodemailer.createTransporter({
      //   host: process.env.SMTP_HOST,
      //   port: process.env.SMTP_PORT,
      //   secure: process.env.SMTP_SECURE === 'true',
      //   auth: {
      //     user: process.env.SMTP_USER,
      //     pass: process.env.SMTP_PASS,
      //   },
      // });

      // await transporter.sendMail({
      //   from: process.env.EMAIL_FROM,
      //   to: email,
      //   subject: '密码重置请求 - RemoteHub',
      //   html: this.generateResetEmailTemplate(resetUrl),
      // });
    } catch (error) {
      logger.error(`Failed to send password reset email to ${email}`, {
        email,
        error: (error as Error).message,
      });
      throw new EmailServiceError('Failed to send password reset email');
    }
  }

  /**
   * 生成重置邮件模板
   */
  private generateResetEmailTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>密码重置 - RemoteHub</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
            <h1 style="color: #007bff; margin: 0;">RemoteHub</h1>
            <p style="margin: 10px 0; color: #666;">密码重置请求</p>
          </div>

          <div style="padding: 20px; background: #fff;">
            <h2 style="color: #333; margin-top: 0;">您好！</h2>

            <p>我们收到了您的密码重置请求。请点击下面的按钮来重置您的密码：</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}"
                 style="background: #007bff; color: white; padding: 12px 30px;
                        text-decoration: none; border-radius: 5px; display: inline-block;
                        font-weight: bold;">
                重置密码
              </a>
            </div>

            <p style="color: #666; font-size: 14px;">
              如果按钮无法点击，请复制以下链接到浏览器地址栏：<br>
              <span style="word-break: break-all;">${resetUrl}</span>
            </p>

            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <p style="margin: 0; font-size: 14px; color: #666;">
                <strong>安全提示：</strong>
              </p>
              <ul style="margin: 10px 0; font-size: 14px; color: #666;">
                <li>此链接将在1小时后过期</li>
                <li>如果您没有请求重置密码，请忽略此邮件</li>
                <li>请不要将此链接分享给他人</li>
              </ul>
            </div>
          </div>

          <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
            <p>此邮件由 RemoteHub 系统自动发送，请勿回复。</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * 发送密码更改通知邮件
   */
  public async sendPasswordChangeNotification(email: string): Promise<void> {
    try {
      logger.info(`Password change notification sent to ${email}`, {
        email,
      });

      // 实际实现示例：
      // await transporter.sendMail({
      //   from: process.env.EMAIL_FROM,
      //   to: email,
      //   subject: '密码已更改 - RemoteHub',
      //   html: this.generatePasswordChangeNotificationTemplate(),
      // });
    } catch (error) {
      logger.error(`Failed to send password change notification to ${email}`, {
        email,
        error: (error as Error).message,
      });
      // 不抛出错误，因为这只是通知邮件
    }
  }

  /**
   * 生成密码更改通知邮件模板
   */
  private generatePasswordChangeNotificationTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>密码已更改 - RemoteHub</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #28a745; padding: 20px; border-radius: 8px; text-align: center;">
            <h1 style="color: white; margin: 0;">RemoteHub</h1>
            <p style="margin: 10px 0; color: #fff;">密码已成功更改</p>
          </div>

          <div style="padding: 20px; background: #fff;">
            <h2 style="color: #333; margin-top: 0;">安全通知</h2>

            <p>您好！</p>

            <p>您的 RemoteHub 账户密码已成功更改。</p>

            <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <p style="margin: 0; font-size: 14px; color: #155724;">
                <strong>如果这是您本人的操作，请忽略此邮件。</strong>
              </p>
              <p style="margin: 10px 0; font-size: 14px; color: #155724;">
                如果这不是您本人的操作，请立即联系我们的客服团队。
              </p>
            </div>

            <p style="margin-top: 20px; font-size: 14px; color: #666;">
              为了保护您的账户安全，建议您：<br>
              • 定期更改密码<br>
              • 使用强密码<br>
              • 不要在多个网站使用相同的密码
            </p>
          </div>

          <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
            <p>此邮件由 RemoteHub 系统自动发送，请勿回复。</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export const passwordResetService = new PasswordResetService();