import { EntityValidator, ValidationRules, EntityValidationError } from './EntityValidator';
import { User, UserRole, UserStatus } from '../models/User';

/**
 * User entity validator
 */
export class UserValidator extends EntityValidator {
  /**
   * Validate user creation data
   */
  public static async validateCreation(userData: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role?: UserRole;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate username
    if (!userData.username) {
      errors.push('Username is required');
    } else if (!ValidationRules.isValidUsername(userData.username)) {
      errors.push('Username must be 3-30 characters long and contain only letters, numbers, and underscores');
    }

    // Validate email
    if (!userData.email) {
      errors.push('Email is required');
    } else if (!ValidationRules.isValidEmail(userData.email)) {
      errors.push('Invalid email format');
    }

    // Validate password
    if (!userData.password) {
      errors.push('Password is required');
    } else if (!ValidationRules.isValidPassword(userData.password)) {
      errors.push('Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character');
    }

    // Validate first name
    if (userData.firstName && !ValidationRules.isValidLength(userData.firstName, 1, 50)) {
      errors.push('First name must be between 1 and 50 characters');
    }

    // Validate last name
    if (userData.lastName && !ValidationRules.isValidLength(userData.lastName, 1, 50)) {
      errors.push('Last name must be between 1 and 50 characters');
    }

    // Validate phone
    if (userData.phone && !ValidationRules.isValidPhone(userData.phone)) {
      errors.push('Invalid phone number format');
    }

    // Validate role
    if (userData.role && !ValidationRules.isValidEnumValue(userData.role, UserRole)) {
      errors.push('Invalid user role');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate user update data
   */
  public static async validateUpdate(userData: {
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    bio?: string;
    avatar?: string;
    role?: UserRole;
    status?: UserStatus;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate username
    if (userData.username && !ValidationRules.isValidUsername(userData.username)) {
      errors.push('Username must be 3-30 characters long and contain only letters, numbers, and underscores');
    }

    // Validate email
    if (userData.email && !ValidationRules.isValidEmail(userData.email)) {
      errors.push('Invalid email format');
    }

    // Validate first name
    if (userData.firstName !== undefined && userData.firstName && !ValidationRules.isValidLength(userData.firstName, 1, 50)) {
      errors.push('First name must be between 1 and 50 characters');
    }

    // Validate last name
    if (userData.lastName !== undefined && userData.lastName && !ValidationRules.isValidLength(userData.lastName, 1, 50)) {
      errors.push('Last name must be between 1 and 50 characters');
    }

    // Validate phone
    if (userData.phone && !ValidationRules.isValidPhone(userData.phone)) {
      errors.push('Invalid phone number format');
    }

    // Validate bio length
    if (userData.bio && userData.bio.length > 1000) {
      errors.push('Bio must be less than 1000 characters');
    }

    // Validate avatar URL
    if (userData.avatar && !ValidationRules.isValidURL(userData.avatar)) {
      errors.push('Avatar must be a valid URL');
    }

    // Validate role
    if (userData.role && !ValidationRules.isValidEnumValue(userData.role, UserRole)) {
      errors.push('Invalid user role');
    }

    // Validate status
    if (userData.status && !ValidationRules.isValidEnumValue(userData.status, UserStatus)) {
      errors.push('Invalid user status');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate password change
   */
  public static async validatePasswordChange(data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate current password
    if (!data.currentPassword) {
      errors.push('Current password is required');
    }

    // Validate new password
    if (!data.newPassword) {
      errors.push('New password is required');
    } else if (!ValidationRules.isValidPassword(data.newPassword)) {
      errors.push('New password must be at least 8 characters long and contain uppercase, lowercase, number, and special character');
    } else if (data.newPassword === data.currentPassword) {
      errors.push('New password must be different from current password');
    }

    // Validate password confirmation
    if (!data.confirmPassword) {
      errors.push('Password confirmation is required');
    } else if (data.newPassword !== data.confirmPassword) {
      errors.push('Passwords do not match');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate password reset request
   */
  public static async validatePasswordResetRequest(email: string): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!email) {
      errors.push('Email is required');
    } else if (!ValidationRules.isValidEmail(email)) {
      errors.push('Invalid email format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate password reset
   */
  public static async validatePasswordReset(data: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate token
    if (!data.token) {
      errors.push('Reset token is required');
    }

    // Validate new password
    if (!data.newPassword) {
      errors.push('New password is required');
    } else if (!ValidationRules.isValidPassword(data.newPassword)) {
      errors.push('New password must be at least 8 characters long and contain uppercase, lowercase, number, and special character');
    }

    // Validate password confirmation
    if (!data.confirmPassword) {
      errors.push('Password confirmation is required');
    } else if (data.newPassword !== data.confirmPassword) {
      errors.push('Passwords do not match');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate user preferences
   */
  public static async validatePreferences(preferences: Record<string, any>): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (typeof preferences !== 'object' || preferences === null) {
      errors.push('Preferences must be a valid object');
      return { isValid: false, errors };
    }

    // Validate theme preference if present
    if (preferences.theme && !['light', 'dark', 'auto'].includes(preferences.theme)) {
      errors.push('Theme must be one of: light, dark, auto');
    }

    // Validate language preference if present
    if (preferences.language && !ValidationRules.isValidLength(preferences.language, 2, 10)) {
      errors.push('Language code must be 2-10 characters');
    }

    // Validate timezone preference if present
    if (preferences.timezone && !ValidationRules.isValidLength(preferences.timezone, 1, 50)) {
      errors.push('Timezone must be 1-50 characters');
    }

    // Validate notification preferences if present
    if (preferences.notifications) {
      if (typeof preferences.notifications !== 'object') {
        errors.push('Notification preferences must be an object');
      } else {
        const validNotificationTypes = ['email', 'push', 'sms'];
        Object.keys(preferences.notifications).forEach(key => {
          if (!validNotificationTypes.includes(key)) {
            errors.push(`Invalid notification type: ${key}`);
          }
          if (typeof preferences.notifications[key] !== 'boolean') {
            errors.push(`Notification ${key} must be a boolean`);
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if user can perform action based on role
   */
  public static canPerformAction(userRole: UserRole, requiredRole: UserRole): boolean {
    const roleLevels = {
      [UserRole.USER]: 1,
      [UserRole.ADMIN]: 2,
    };

    return roleLevels[userRole] >= roleLevels[requiredRole];
  }

  /**
   * Check if user status allows action
   */
  public static isStatusActiveForAction(status: UserStatus): boolean {
    return status === UserStatus.ACTIVE;
  }

  /**
   * Validate user search filters
   */
  public static validateSearchFilters(filters: {
    role?: UserRole;
    status?: UserStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): { isValid: boolean; errors: string[]; sanitizedFilters: any } {
    const errors: string[] = [];
    const sanitized: any = {};

    // Validate role filter
    if (filters.role !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.role, UserRole)) {
        errors.push('Invalid role filter');
      } else {
        sanitized.role = filters.role;
      }
    }

    // Validate status filter
    if (filters.status !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.status, UserStatus)) {
        errors.push('Invalid status filter');
      } else {
        sanitized.status = filters.status;
      }
    }

    // Validate search term
    if (filters.search !== undefined) {
      if (filters.search && filters.search.length > 100) {
        errors.push('Search term must be less than 100 characters');
      } else {
        sanitized.search = filters.search;
      }
    }

    // Validate pagination
    if (filters.page !== undefined) {
      if (!Number.isInteger(filters.page) || filters.page < 1) {
        errors.push('Page must be a positive integer');
      } else {
        sanitized.page = filters.page;
      }
    }

    if (filters.limit !== undefined) {
      if (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 100) {
        errors.push('Limit must be an integer between 1 and 100');
      } else {
        sanitized.limit = filters.limit;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedFilters: sanitized,
    };
  }
}