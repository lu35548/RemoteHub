/**
 * Project-related enums for the RemoteHub application
 */

export enum ProjectStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  SUSPENDED = 'suspended',
}

export enum ProjectVisibility {
  PRIVATE = 'private',   // Only project members can see
  TEAM = 'team',         // Only team members can see
  PUBLIC = 'public',     // Anyone can see
}

export enum ProjectMemberRole {
  OWNER = 'owner',       // Full control over the project
  ADMIN = 'admin',       // Can manage members and settings
  EDITOR = 'editor',     // Can edit project content
  VIEWER = 'viewer',     // Read-only access
}

export enum ProjectPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ProjectMemberStatus {
  ACTIVE = 'active',
  PENDING = 'pending',   // Invitation sent, not yet accepted
  INACTIVE = 'inactive', // Deactivated member
  BANNED = 'banned',     // Banned from project
}

/**
 * Helper functions for project enums
 */
export const ProjectStatusHelper = {
  isActive(status: ProjectStatus): boolean {
    return status === ProjectStatus.ACTIVE;
  },

  isAccessible(status: ProjectStatus): boolean {
    return [ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED].includes(status);
  },

  canEdit(status: ProjectStatus): boolean {
    return status === ProjectStatus.ACTIVE;
  },

  getLabel(status: ProjectStatus): string {
    const labels = {
      [ProjectStatus.DRAFT]: '草稿',
      [ProjectStatus.ACTIVE]: '活跃',
      [ProjectStatus.ARCHIVED]: '已归档',
      [ProjectStatus.SUSPENDED]: '已暂停',
    };
    return labels[status] || status;
  },

  getAllStatuses(): ProjectStatus[] {
    return Object.values(ProjectStatus);
  },
};

export const ProjectVisibilityHelper = {
  canPubliclyAccess(visibility: ProjectVisibility): boolean {
    return visibility === ProjectVisibility.PUBLIC;
  },

  requiresInvitation(visibility: ProjectVisibility): boolean {
    return visibility === ProjectVisibility.PRIVATE;
  },

  getLabel(visibility: ProjectVisibility): string {
    const labels = {
      [ProjectVisibility.PRIVATE]: '私有',
      [ProjectVisibility.TEAM]: '团队',
      [ProjectVisibility.PUBLIC]: '公开',
    };
    return labels[visibility] || visibility;
  },

  getAllVisibilities(): ProjectVisibility[] {
    return Object.values(ProjectVisibility);
  },
};

export const ProjectMemberRoleHelper = {
  canManageMembers(role: ProjectMemberRole): boolean {
    return [ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN].includes(role);
  },

  canEditProject(role: ProjectMemberRole): boolean {
    return [ProjectMemberRole.OWNER, ProjectMemberRole.ADMIN, ProjectMemberRole.EDITOR].includes(role);
  },

  canViewProject(role: ProjectMemberRole): boolean {
    return Object.values(ProjectMemberRole).includes(role);
  },

  canDeleteProject(role: ProjectMemberRole): boolean {
    return role === ProjectMemberRole.OWNER;
  },

  getLevel(role: ProjectMemberRole): number {
    const levels = {
      [ProjectMemberRole.OWNER]: 4,
      [ProjectMemberRole.ADMIN]: 3,
      [ProjectMemberRole.EDITOR]: 2,
      [ProjectMemberRole.VIEWER]: 1,
    };
    return levels[role] || 0;
  },

  hasPermission(userRole: ProjectMemberRole, requiredRole: ProjectMemberRole): boolean {
    return ProjectMemberRoleHelper.getLevel(userRole) >= ProjectMemberRoleHelper.getLevel(requiredRole);
  },

  getLabel(role: ProjectMemberRole): string {
    const labels = {
      [ProjectMemberRole.OWNER]: '所有者',
      [ProjectMemberRole.ADMIN]: '管理员',
      [ProjectMemberRole.EDITOR]: '编辑者',
      [ProjectMemberRole.VIEWER]: '查看者',
    };
    return labels[role] || role;
  },

  getAllRoles(): ProjectMemberRole[] {
    return Object.values(ProjectMemberRole);
  },
};

export const ProjectPriorityHelper = {
  getWeight(priority: ProjectPriority): number {
    const weights = {
      [ProjectPriority.LOW]: 1,
      [ProjectPriority.MEDIUM]: 2,
      [ProjectPriority.HIGH]: 3,
      [ProjectPriority.URGENT]: 4,
    };
    return weights[priority] || 0;
  },

  getLabel(priority: ProjectPriority): string {
    const labels = {
      [ProjectPriority.LOW]: '低',
      [ProjectPriority.MEDIUM]: '中',
      [ProjectPriority.HIGH]: '高',
      [ProjectPriority.URGENT]: '紧急',
    };
    return labels[priority] || priority;
  },

  getColor(priority: ProjectPriority): string {
    const colors = {
      [ProjectPriority.LOW]: '#6b7280',     // gray
      [ProjectPriority.MEDIUM]: '#3b82f6',  // blue
      [ProjectPriority.HIGH]: '#f59e0b',    // amber
      [ProjectPriority.URGENT]: '#ef4444',  // red
    };
    return colors[priority] || '#6b7280';
  },

  getAllPriorities(): ProjectPriority[] {
    return Object.values(ProjectPriority);
  },
};

export const ProjectMemberStatusHelper = {
  isActive(status: ProjectMemberStatus): boolean {
    return status === ProjectMemberStatus.ACTIVE;
  },

  canParticipate(status: ProjectMemberStatus): boolean {
    return [ProjectMemberStatus.ACTIVE, ProjectMemberStatus.PENDING].includes(status);
  },

  getLabel(status: ProjectMemberStatus): string {
    const labels = {
      [ProjectMemberStatus.ACTIVE]: '活跃',
      [ProjectMemberStatus.PENDING]: '待确认',
      [ProjectMemberStatus.INACTIVE]: '未激活',
      [ProjectMemberStatus.BANNED]: '已禁用',
    };
    return labels[status] || status;
  },

  getAllStatuses(): ProjectMemberStatus[] {
    return Object.values(ProjectMemberStatus);
  },
};