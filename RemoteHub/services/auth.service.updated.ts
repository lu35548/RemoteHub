// Updated Authentication Service with JWT Token Support
// Supports both localStorage and backend API authentication modes
// Removes client-side password hashing for better security

import { User, UserRole } from '../types';
import { generateId } from '../utils';
import { config } from './config.service';
import { apiStorage, ApiError } from './api.adapter';
import { storage, DB_KEYS } from './storage.adapter';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export class AuthService {
  private static tokens: AuthTokens | null = null;
  private static refreshTimer: NodeJS.Timeout | null = null;

  // Initialize authentication system
  static async initialize(): Promise<void> {
    if (config.shouldUseApi()) {
      // Initialize with backend API
      await this.initializeWithApi();
    } else {
      // Initialize with localStorage (fallback)
      await this.initializeWithLocalStorage();
    }
  }

  // Login with username and password
  static async login(username: string, password: string): Promise<User | null> {
    if (config.shouldUseApi()) {
      return await this.loginWithApi(username, password);
    } else {
      return await this.loginWithLocalStorage(username, password);
    }
  }

  // Logout current user
  static async logout(): Promise<void> {
    if (config.shouldUseApi()) {
      await this.logoutWithApi();
    } else {
      await this.logoutWithLocalStorage();
    }

    // Clear local tokens
    this.clearTokens();
  }

  // Get current authenticated user
  static async getCurrentUser(): Promise<User | null> {
    if (config.shouldUseApi()) {
      return await this.getCurrentUserWithApi();
    } else {
      return await this.getCurrentUserWithLocalStorage();
    }
  }

  // Get all users (admin only)
  static async getAllUsers(): Promise<User[]> {
    if (config.shouldUseApi()) {
      try {
        return await apiStorage.read<User[]>(DB_KEYS.USERS, []);
      } catch (error) {
        console.error('Failed to get users from API:', error);
        return [];
      }
    } else {
      return await storage.read<User[]>(DB_KEYS.USERS, []);
    }
  }

  // Create new user (admin only)
  static async createUser(newUser: Partial<User>, creator: User): Promise<User> {
    if (creator.role !== UserRole.ADMIN) {
      throw new Error('Permission Denied');
    }

    if (config.shouldUseApi()) {
      // Remove password hashing - let server handle it
      const userToCreate = {
        ...newUser,
        password: newUser.passwordHash // Send plain password to server
      };
      delete userToCreate.passwordHash;

      await apiStorage.write(DB_KEYS.USERS, userToCreate);
      // Return the created user (server will assign ID and hash password)
      return { ...newUser, id: generateId() } as User;
    } else {
      return await this.createUserWithLocalStorage(newUser);
    }
  }

  // Delete user (admin only)
  static async deleteUser(targetUserId: string, admin: User): Promise<void> {
    if (admin.role !== UserRole.ADMIN) throw new Error('Permission Denied');
    if (targetUserId === admin.id) throw new Error('Cannot delete self');

    if (config.shouldUseApi()) {
      await apiStorage.deleteUser(targetUserId);
    } else {
      await this.deleteUserWithLocalStorage(targetUserId);
    }
  }

  // Change current user's password
  static async changeMyPassword(userId: string, oldPass: string, newPass: string): Promise<void> {
    if (config.shouldUseApi()) {
      try {
        await this.makeApiRequest('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: oldPass,
            newPassword: newPass
          })
        });
      } catch (error) {
        throw new Error('Failed to change password');
      }
    } else {
      await this.changePasswordWithLocalStorage(userId, oldPass, newPass);
    }
  }

  // Reset user password (admin only)
  static async resetPassword(targetUserId: string, admin: User): Promise<void> {
    if (admin.role !== UserRole.ADMIN) throw new Error('Permission Denied');

    if (config.shouldUseApi()) {
      try {
        await this.makeApiRequest(`/admin/users/${targetUserId}/reset-password`, {
          method: 'POST'
        });
      } catch (error) {
        throw new Error('Failed to reset password');
      }
    } else {
      await this.resetPasswordWithLocalStorage(targetUserId);
    }
  }

  // Get online users count
  static async getOnlineCount(): Promise<number> {
    if (config.shouldUseApi()) {
      try {
        const response = await this.makeApiRequest('/users/online/count');
        return response.count || 0;
      } catch (error) {
        console.error('Failed to get online count:', error);
        return 0;
      }
    } else {
      return await this.getOnlineUsersWithLocalStorage().length;
    }
  }

  // Get online users
  static async getOnlineUsers(): Promise<User[]> {
    if (config.shouldUseApi()) {
      try {
        const response = await this.makeApiRequest('/users/online');
        return response.users || [];
      } catch (error) {
        console.error('Failed to get online users:', error);
        return [];
      }
    } else {
      return await this.getOnlineUsersWithLocalStorage();
    }
  }

  // Send heartbeat to maintain online status
  static async heartbeat(): Promise<void> {
    if (config.shouldUseApi()) {
      try {
        await this.makeApiRequest('/auth/heartbeat', {
          method: 'POST'
        });
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    } else {
      await this.heartbeatWithLocalStorage();
    }
  }

  // Check if user is authenticated
  static isAuthenticated(): boolean {
    return this.tokens !== null || localStorage.getItem('rh_current_user_id') !== null;
  }

  // Get access token
  static getAccessToken(): string | null {
    return this.tokens?.accessToken || localStorage.getItem('rh_jwt_token');
  }

  // Private methods for localStorage fallback
  private static async initializeWithLocalStorage(): Promise<void> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    if (users.length === 0) {
      const admin: User = {
        id: 'u_admin',
        username: 'admin',
        nickname: '超级管理员',
        role: UserRole.ADMIN,
        passwordHash: this.hashPassword('admin123'), // Only for localStorage fallback
        lastActiveAt: Date.now(),
        createdAt: Date.now()
      };
      await storage.write(DB_KEYS.USERS, [admin]);
    }
  }

  private static async initializeWithApi(): Promise<void> {
    // Load tokens from localStorage
    const storedToken = localStorage.getItem('rh_jwt_token');
    const storedRefreshToken = localStorage.getItem('rh_refresh_token');
    const storedExpiresAt = localStorage.getItem('rh_token_expires_at');

    if (storedToken && storedRefreshToken && storedExpiresAt) {
      this.tokens = {
        accessToken: storedToken,
        refreshToken: storedRefreshToken,
        expiresAt: parseInt(storedExpiresAt)
      };

      // Check if token needs refresh
      if (this.isTokenExpiringSoon()) {
        await this.refreshToken();
      } else {
        this.scheduleTokenRefresh();
      }
    }
  }

  private static async loginWithLocalStorage(username: string, password: string): Promise<User | null> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const hash = this.hashPassword(password);
    const user = users.find(u => u.username === username && u.passwordHash === hash);

    if (user) {
      user.lastActiveAt = Date.now();
      await this.updateUserWithLocalStorage(user);
      await storage.write(DB_KEYS.SESSION, user.id);
      return user;
    }
    return null;
  }

  private static async loginWithApi(username: string, password: string): Promise<User | null> {
    try {
      const response = await this.makeApiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (response.user && response.tokens) {
        this.setTokens(response.tokens);
        return response.user;
      }
      return null;
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('Login failed');
    }
  }

  private static async logoutWithApi(): Promise<void> {
    try {
      await this.makeApiRequest('/auth/logout', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
  }

  private static async logoutWithLocalStorage(): Promise<void> {
    await storage.remove(DB_KEYS.SESSION);
  }

  private static async getCurrentUserWithApi(): Promise<User | null> {
    if (!this.tokens) {
      return null;
    }

    try {
      const response = await this.makeApiRequest('/auth/current-user');
      return response.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Token expired, clear it
        this.clearTokens();
      }
      return null;
    }
  }

  private static async getCurrentUserWithLocalStorage(): Promise<User | null> {
    const uid = await storage.read<string | null>(DB_KEYS.SESSION, null);
    if (!uid) return null;

    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === uid);

    if (user) {
      user.lastActiveAt = Date.now();
      await this.updateUserWithLocalStorage(user);
    }
    return user || null;
  }

  // Token management methods
  private static setTokens(tokens: AuthTokens): void {
    this.tokens = tokens;
    localStorage.setItem('rh_jwt_token', tokens.accessToken);
    localStorage.setItem('rh_refresh_token', tokens.refreshToken);
    localStorage.setItem('rh_token_expires_at', tokens.expiresAt.toString());
    this.scheduleTokenRefresh();
  }

  private static clearTokens(): void {
    this.tokens = null;
    localStorage.removeItem('rh_jwt_token');
    localStorage.removeItem('rh_refresh_token');
    localStorage.removeItem('rh_token_expires_at');

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private static isTokenExpiringSoon(): boolean {
    if (!this.tokens) return true;

    const threshold = config.getSecurityConfig().tokenRefreshThreshold * 60 * 1000; // Convert to milliseconds
    return Date.now() >= (this.tokens.expiresAt - threshold);
  }

  private static scheduleTokenRefresh(): void {
    if (!this.tokens) return;

    const threshold = config.getSecurityConfig().tokenRefreshThreshold * 60 * 1000;
    const timeUntilRefresh = this.tokens.expiresAt - Date.now() - threshold;

    if (timeUntilRefresh > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken();
      }, timeUntilRefresh);
    }
  }

  private static async refreshToken(): Promise<void> {
    if (!this.tokens) return;

    try {
      const response = await this.makeApiRequest('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: this.tokens.refreshToken })
      });

      if (response.tokens) {
        this.setTokens(response.tokens);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearTokens();
    }
  }

  // Helper methods
  private static async makeApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const apiConfig = config.getApiConfig();
    const url = `${apiConfig.baseURL}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.tokens?.accessToken) {
      headers.Authorization = `Bearer ${this.tokens.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError({
        status: response.status,
        code: errorData.code || 'HTTP_ERROR',
        message: errorData.message || `HTTP ${response.status}`,
        details: errorData.details
      });
    }

    return await response.json();
  }

  // Legacy localStorage methods (password hashing only for fallback)
  private static hashPassword(pwd: string): string {
    // Only used for localStorage fallback - API will handle server-side hashing
    return btoa(pwd).split('').reverse().join('');
  }

  private static async updateUserWithLocalStorage(user: User): Promise<void> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx] = user;
      await storage.write(DB_KEYS.USERS, users);
    }
  }

  private static async createUserWithLocalStorage(newUser: Partial<User>): Promise<User> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    if (users.some(u => u.username === newUser.username)) throw new Error('Username exists');

    const user: User = {
      id: generateId(),
      username: newUser.username!,
      nickname: newUser.nickname || newUser.username!,
      role: newUser.role || UserRole.USER,
      passwordHash: this.hashPassword(newUser.passwordHash!),
      lastActiveAt: 0,
      createdAt: Date.now()
    };

    users.push(user);
    await storage.write(DB_KEYS.USERS, users);
    return user;
  }

  private static async deleteUserWithLocalStorage(targetUserId: string): Promise<void> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const newUsers = users.filter(u => u.id !== targetUserId);
    await storage.write(DB_KEYS.USERS, newUsers);
  }

  private static async changePasswordWithLocalStorage(userId: string, oldPass: string, newPass: string): Promise<void> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');

    if (user.passwordHash !== this.hashPassword(oldPass)) {
      throw new Error('旧密码错误');
    }
    user.passwordHash = this.hashPassword(newPass);
    await storage.write(DB_KEYS.USERS, users);
  }

  private static async resetPasswordWithLocalStorage(targetUserId: string): Promise<void> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === targetUserId);
    if (user) {
      user.passwordHash = this.hashPassword('123456');
      await storage.write(DB_KEYS.USERS, users);
    }
  }

  private static async getOnlineUsersWithLocalStorage(): Promise<User[]> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const threshold = Date.now() - 5 * 60 * 1000; // 5 minutes
    return users.filter(u => u.lastActiveAt > threshold).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  private static async heartbeatWithLocalStorage(): Promise<void> {
    const uid = await storage.read<string | null>(DB_KEYS.SESSION, null);
    if (!uid) return;

    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === uid);

    if (user && Date.now() - user.lastActiveAt > 10000) {
      user.lastActiveAt = Date.now();
      await this.updateUserWithLocalStorage(user);
    }
  }
}