import jwt from 'jsonwebtoken';
import { config } from '../config/config';

export interface JWTPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user';
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

export class JWTService {
  /**
   * 生成访问令牌和刷新令牌对
   */
  public generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp'>, sessionId: string, tokenVersion: number = 0): TokenPair {
    const accessTokenPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
      ...payload,
      sessionId,
    };

    const refreshTokenPayload: RefreshTokenPayload = {
      userId: payload.userId,
      sessionId,
      tokenVersion,
    };

    const signOptions = {
      expiresIn: config.jwt.accessExpiresIn,
      issuer: 'remotehub-api',
      audience: 'remotehub-client',
    } as any;

    const accessToken = jwt.sign(accessTokenPayload, config.jwt.secret, signOptions);

    const refreshSignOptions = {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: 'remotehub-api',
      audience: 'remotehub-client',
    } as any;

    const refreshToken = jwt.sign(refreshTokenPayload, config.jwt.secret, refreshSignOptions);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * 验证访问令牌
   */
  public verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'remotehub-api',
        audience: 'remotehub-client',
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * 验证刷新令牌
   */
  public verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'remotehub-api',
        audience: 'remotehub-client',
      }) as RefreshTokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else {
        throw new Error('Refresh token verification failed');
      }
    }
  }

  /**
   * 解码令牌（不验证签名）
   */
  public decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查令牌是否即将过期（在指定分钟内）
   */
  public isTokenExpiringSoon(token: string, minutesThreshold: number = 5): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    const threshold = minutesThreshold * 60;

    // 确保时间戳比较的安全性，处理时钟偏差
    const timeToExpiry = decoded.exp - now;
    return timeToExpiry <= threshold || timeToExpiry < 0;
  }

  /**
   * 从请求头中提取令牌
   */
  public extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * 生成会话ID
   */
  public generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const jwtService = new JWTService();