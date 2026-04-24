
import { User, UserRole } from '../types';
import { generateId } from '../utils';
import { storage, DB_KEYS } from './storage.manager';

export class AuthService {
  static async initialize(): Promise<void> {
    // Check if we're using API mode
    const useApi = import.meta.env.VITE_USE_API === 'true';

    if (useApi) {
      // In API mode, initialize is handled by the backend
      // Just ensure we have a valid session
      console.log('[AuthService] Using API mode - initialization handled by backend');
      return;
    }

    // LocalStorage mode
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    // Initialize default admin if no users exist
    if (users.length === 0) {
      const admin: User = {
        id: 'u_admin',
        username: 'admin',
        nickname: '超级管理员',
        role: UserRole.ADMIN,
        passwordHash: this.hashPassword('admin123'),
        lastActiveAt: Date.now(),
        createdAt: Date.now()
      };
      await storage.write(DB_KEYS.USERS, [admin]);
    }
  }

  private static hashPassword(pwd: string): string {
    // Simulation: In production use bcrypt/argon2 on server
    return btoa(pwd).split('').reverse().join(''); 
  }

  static async login(username: string, password: string): Promise<User | null> {
    // Check if we're using API mode
    const useApi = import.meta.env.VITE_USE_API === 'true';

    if (useApi) {
      // In API mode, use the API adapter
      try {
        await storage.write(DB_KEYS.SESSION, { username, password });
        const user = await this.getCurrentUser();
        return user;
      } catch (error) {
        console.error('[AuthService] API login failed:', error);
        return null;
      }
    }

    // LocalStorage mode
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const hash = this.hashPassword(password);
    const user = users.find(u => u.username === username && u.passwordHash === hash);

    if (user) {
      user.lastActiveAt = Date.now();
      await this.updateUserInternal(users, user);
      await storage.write(DB_KEYS.SESSION, user.id);
      return user;
    }
    return null;
  }

  static async logout(): Promise<void> {
    // Check if we're using API mode
    const useApi = import.meta.env.VITE_USE_API === 'true';

    if (useApi) {
      // In API mode, remove session via API
      try {
        await storage.remove(DB_KEYS.SESSION);
        // Clear tokens from localStorage
        localStorage.removeItem('rh_jwt_token');
        localStorage.removeItem('rh_refresh_token');
      } catch (error) {
        console.error('[AuthService] API logout failed:', error);
      }
      return;
    }

    // LocalStorage mode
    await storage.remove(DB_KEYS.SESSION);
  }

  static async getCurrentUser(): Promise<User | null> {
    // Check if we're using API mode
    const useApi = import.meta.env.VITE_USE_API === 'true';

    if (useApi) {
      // In API mode, get current user via API
      try {
        // The API adapter handles fetching current user
        const session = await storage.read<any>(DB_KEYS.SESSION, null);
        if (!session) {
          // Check if we have a valid token
          const token = localStorage.getItem('rh_jwt_token');
          if (!token) return null;

          // Make a request to get current user
          const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/current-user`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              // Convert backend user format to frontend format
              const user: User = {
                id: data.data.id,
                username: data.data.username,
                nickname: data.data.firstName || data.data.lastName || data.data.username,
                role: data.data.role as UserRole,
                passwordHash: '', // Not returned from API
                lastActiveAt: Date.now(),
                createdAt: Date.now() // Backend doesn't return createdAt
              };
              return user;
            }
          }
        }
        return session;
      } catch (error) {
        console.error('[AuthService] API getCurrentUser failed:', error);
        return null;
      }
    }

    // LocalStorage mode
    const uid = await storage.read<string | null>(DB_KEYS.SESSION, null);
    if (!uid) return null;

    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === uid);

    if (user) {
      user.lastActiveAt = Date.now();
      await this.updateUserInternal(users, user);
    }
    return user || null;
  }

  static async getAllUsers(): Promise<User[]> {
    return await storage.read<User[]>(DB_KEYS.USERS, []);
  }

  static async createUser(newUser: Partial<User>, creator: User): Promise<User> {
    if (creator.role !== UserRole.ADMIN) throw new Error('Permission Denied');
    
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

  static async deleteUser(targetUserId: string, admin: User): Promise<void> {
    if (admin.role !== UserRole.ADMIN) throw new Error('Permission Denied');
    if (targetUserId === admin.id) throw new Error('Cannot delete self');
    
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const newUsers = users.filter(u => u.id !== targetUserId);
    await storage.write(DB_KEYS.USERS, newUsers);
  }

  static async changeMyPassword(userId: string, oldPass: string, newPass: string): Promise<void> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    
    if (user.passwordHash !== this.hashPassword(oldPass)) {
      throw new Error('旧密码错误');
    }
    user.passwordHash = this.hashPassword(newPass);
    await storage.write(DB_KEYS.USERS, users);
  }

  static async resetPassword(targetUserId: string, admin: User): Promise<void> {
    if (admin.role !== UserRole.ADMIN) throw new Error('Permission Denied');
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === targetUserId);
    if (user) {
      user.passwordHash = this.hashPassword('123456');
      await storage.write(DB_KEYS.USERS, users);
    }
  }

  static async getOnlineCount(): Promise<number> {
    const onlineUsers = await this.getOnlineUsers();
    return onlineUsers.length;
  }

  static async getOnlineUsers(): Promise<User[]> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const threshold = Date.now() - 5 * 60 * 1000; // 5 minutes
    // Return active users sorted by last active time (most recent first)
    return users.filter(u => u.lastActiveAt > threshold).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  static async heartbeat(): Promise<void> {
    const uid = await storage.read<string | null>(DB_KEYS.SESSION, null);
    if (!uid) return;
    
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const user = users.find(u => u.id === uid);
    
    if (user) {
      // Only update if more than 10 seconds have passed to avoid thrashing if called frequently
      if (Date.now() - user.lastActiveAt > 10000) {
         user.lastActiveAt = Date.now();
         await this.updateUserInternal(users, user);
      }
    }
  }

  private static async updateUserInternal(users: User[], updatedUser: User): Promise<void> {
    const idx = users.findIndex(u => u.id === updatedUser.id);
    if (idx !== -1) {
      users[idx] = updatedUser;
      await storage.write(DB_KEYS.USERS, users);
    }
  }
}