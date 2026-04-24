import { ValidationRules } from './EntityValidator';
import { ProjectStatus, ProjectVisibility, ProjectPriority, ProjectMemberRole } from '../enums/ProjectEnums';

/**
 * Project entity validator
 */
export class ProjectValidator {
  /**
   * Validate project creation data
   */
  public static async validateCreation(projectData: {
    name: string;
    description?: string;
    status?: ProjectStatus;
    visibility?: ProjectVisibility;
    priority?: ProjectPriority;
    ownerId: string;
    tags?: string[];
    settings?: any;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate name
    if (!projectData.name) {
      errors.push('Project name is required');
    } else if (!ValidationRules.isValidLength(projectData.name, 1, 255)) {
      errors.push('Project name must be between 1 and 255 characters');
    }

    // Validate description
    if (projectData.description && projectData.description.length > 1000) {
      errors.push('Description must be less than 1000 characters');
    }

    // Validate status
    if (projectData.status && !ValidationRules.isValidEnumValue(projectData.status, ProjectStatus)) {
      errors.push('Invalid project status');
    }

    // Validate visibility
    if (projectData.visibility && !ValidationRules.isValidEnumValue(projectData.visibility, ProjectVisibility)) {
      errors.push('Invalid project visibility');
    }

    // Validate priority
    if (projectData.priority && !ValidationRules.isValidEnumValue(projectData.priority, ProjectPriority)) {
      errors.push('Invalid project priority');
    }

    // Validate owner ID
    if (!projectData.ownerId) {
      errors.push('Project owner is required');
    } else if (!ValidationRules.isValidUUID(projectData.ownerId)) {
      errors.push('Invalid owner ID format');
    }

    // Validate tags
    if (projectData.tags) {
      if (!Array.isArray(projectData.tags)) {
        errors.push('Tags must be an array');
      } else if (projectData.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      } else {
        for (const tag of projectData.tags) {
          if (typeof tag !== 'string' || tag.length > 50) {
            errors.push('Each tag must be a string of max 50 characters');
            break;
          }
        }
      }
    }

    // Validate settings
    if (projectData.settings) {
      const settingsValidation = this.validateProjectSettings(projectData.settings);
      if (!settingsValidation.isValid) {
        errors.push(...settingsValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate project update data
   */
  public static async validateUpdate(projectData: {
    name?: string;
    description?: string;
    status?: ProjectStatus;
    visibility?: ProjectVisibility;
    priority?: ProjectPriority;
    tags?: string[];
    settings?: any;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate name
    if (projectData.name !== undefined) {
      if (!projectData.name) {
        errors.push('Project name cannot be empty');
      } else if (!ValidationRules.isValidLength(projectData.name, 1, 255)) {
        errors.push('Project name must be between 1 and 255 characters');
      }
    }

    // Validate description
    if (projectData.description && projectData.description.length > 1000) {
      errors.push('Description must be less than 1000 characters');
    }

    // Validate status
    if (projectData.status && !ValidationRules.isValidEnumValue(projectData.status, ProjectStatus)) {
      errors.push('Invalid project status');
    }

    // Validate visibility
    if (projectData.visibility && !ValidationRules.isValidEnumValue(projectData.visibility, ProjectVisibility)) {
      errors.push('Invalid project visibility');
    }

    // Validate priority
    if (projectData.priority && !ValidationRules.isValidEnumValue(projectData.priority, ProjectPriority)) {
      errors.push('Invalid project priority');
    }

    // Validate tags
    if (projectData.tags !== undefined) {
      if (!Array.isArray(projectData.tags)) {
        errors.push('Tags must be an array');
      } else if (projectData.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      } else {
        for (const tag of projectData.tags) {
          if (typeof tag !== 'string' || tag.length > 50) {
            errors.push('Each tag must be a string of max 50 characters');
            break;
          }
        }
      }
    }

    // Validate settings
    if (projectData.settings) {
      const settingsValidation = this.validateProjectSettings(projectData.settings);
      if (!settingsValidation.isValid) {
        errors.push(...settingsValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate project settings
   */
  private static validateProjectSettings(settings: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof settings !== 'object' || settings === null) {
      return { isValid: false, errors: ['Settings must be a valid object'] };
    }

    // Validate maxMembers
    if (settings.maxMembers !== undefined) {
      if (!Number.isInteger(settings.maxMembers) || settings.maxMembers < 1 || settings.maxMembers > 1000) {
        errors.push('maxMembers must be an integer between 1 and 1000');
      }
    }

    // Validate allowMemberInvitation
    if (settings.allowMemberInvitation !== undefined && typeof settings.allowMemberInvitation !== 'boolean') {
      errors.push('allowMemberInvitation must be a boolean');
    }

    // Validate requireApprovalForJoin
    if (settings.requireApprovalForJoin !== undefined && typeof settings.requireApprovalForJoin !== 'boolean') {
      errors.push('requireApprovalForJoin must be a boolean');
    }

    // Validate defaultMemberRole
    if (settings.defaultMemberRole !== undefined) {
      if (!ValidationRules.isValidEnumValue(settings.defaultMemberRole, ProjectMemberRole)) {
        errors.push('defaultMemberRole must be one of: owner, admin, editor, viewer');
      }
    }

    // Validate features object
    if (settings.features) {
      if (typeof settings.features !== 'object') {
        errors.push('features must be an object');
      } else {
        const validFeatures = ['enableChat', 'enableFileSharing', 'enableConnections', 'enableAuditing'];
        Object.keys(settings.features).forEach(key => {
          if (!validFeatures.includes(key)) {
            errors.push(`Invalid feature: ${key}`);
          }
          if (typeof settings.features[key] !== 'boolean') {
            errors.push(`Feature ${key} must be a boolean`);
          }
        });
      }
    }

    // Validate notifications object
    if (settings.notifications) {
      if (typeof settings.notifications !== 'object') {
        errors.push('notifications must be an object');
      } else {
        const validNotifications = ['emailNotifications', 'projectUpdates', 'memberChanges', 'connectionChanges'];
        Object.keys(settings.notifications).forEach(key => {
          if (!validNotifications.includes(key)) {
            errors.push(`Invalid notification setting: ${key}`);
          }
          if (typeof settings.notifications[key] !== 'boolean') {
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
   * Validate project member creation
   */
  public static async validateMemberCreation(memberData: {
    userId: string;
    projectId: string;
    role: ProjectMemberRole;
    notes?: string;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate user ID
    if (!memberData.userId) {
      errors.push('User ID is required');
    } else if (!ValidationRules.isValidUUID(memberData.userId)) {
      errors.push('Invalid user ID format');
    }

    // Validate project ID
    if (!memberData.projectId) {
      errors.push('Project ID is required');
    } else if (!ValidationRules.isValidUUID(memberData.projectId)) {
      errors.push('Invalid project ID format');
    }

    // Validate role
    if (!memberData.role) {
      errors.push('Member role is required');
    } else if (!ValidationRules.isValidEnumValue(memberData.role, ProjectMemberRole)) {
      errors.push('Invalid member role');
    }

    // Validate notes
    if (memberData.notes && memberData.notes.length > 1000) {
      errors.push('Notes must be less than 1000 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate project member update
   */
  public static async validateMemberUpdate(memberData: {
    role?: ProjectMemberRole;
    status?: string;
    notes?: string;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate role
    if (memberData.role && !ValidationRules.isValidEnumValue(memberData.role, ProjectMemberRole)) {
      errors.push('Invalid member role');
    }

    // Validate status
    if (memberData.status && !['active', 'pending', 'inactive', 'banned'].includes(memberData.status)) {
      errors.push('Invalid member status');
    }

    // Validate notes
    if (memberData.notes && memberData.notes.length > 1000) {
      errors.push('Notes must be less than 1000 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate project search filters
   */
  public static validateSearchFilters(filters: {
    ownerId?: string;
    status?: ProjectStatus;
    visibility?: ProjectVisibility;
    priority?: ProjectPriority;
    search?: string;
    tags?: string[];
    page?: number;
    limit?: number;
  }): { isValid: boolean; errors: string[]; sanitizedFilters: any } {
    const errors: string[] = [];
    const sanitized: any = {};

    // Validate owner filter
    if (filters.ownerId !== undefined) {
      if (!ValidationRules.isValidUUID(filters.ownerId)) {
        errors.push('Invalid owner ID format');
      } else {
        sanitized.ownerId = filters.ownerId;
      }
    }

    // Validate status filter
    if (filters.status !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.status, ProjectStatus)) {
        errors.push('Invalid status filter');
      } else {
        sanitized.status = filters.status;
      }
    }

    // Validate visibility filter
    if (filters.visibility !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.visibility, ProjectVisibility)) {
        errors.push('Invalid visibility filter');
      } else {
        sanitized.visibility = filters.visibility;
      }
    }

    // Validate priority filter
    if (filters.priority !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.priority, ProjectPriority)) {
        errors.push('Invalid priority filter');
      } else {
        sanitized.priority = filters.priority;
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

    // Validate tags filter
    if (filters.tags !== undefined) {
      if (!Array.isArray(filters.tags)) {
        errors.push('Tags filter must be an array');
      } else if (filters.tags.length > 10) {
        errors.push('Maximum 10 tags allowed in filter');
      } else {
        sanitized.tags = filters.tags;
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

  /**
   * Check if user has permission for action
   */
  public static hasPermission(userRole: ProjectMemberRole, requiredRole: ProjectMemberRole): boolean {
    const roleLevels = {
      [ProjectMemberRole.VIEWER]: 1,
      [ProjectMemberRole.EDITOR]: 2,
      [ProjectMemberRole.ADMIN]: 3,
      [ProjectMemberRole.OWNER]: 4,
    };

    return roleLevels[userRole] >= roleLevels[requiredRole];
  }

  /**
   * Validate project deletion
   */
  public static validateDeletion(userId: string, ownerId: string, userRole: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!ValidationRules.isValidUUID(userId)) {
      errors.push('Invalid user ID format');
    }

    if (!ValidationRules.isValidUUID(ownerId)) {
      errors.push('Invalid owner ID format');
    }

    // Only owners can delete projects
    if (userId !== ownerId) {
      errors.push('Only project owners can delete projects');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}