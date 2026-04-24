/**
 * Common enums used across the RemoteHub application
 */

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  ACCESS = 'access',
  EXPORT = 'export',
  IMPORT = 'import',
}

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  XML = 'xml',
  SQL = 'sql',
}

export enum ImportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum DataFormat {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'datetime',
  JSON = 'json',
  ARRAY = 'array',
  OBJECT = 'object',
}

/**
 * Helper functions for common enums
 */
export const SortOrderHelper = {
  toggle(order: SortOrder): SortOrder {
    return order === SortOrder.ASC ? SortOrder.DESC : SortOrder.ASC;
  },

  getLabel(order: SortOrder): string {
    const labels = {
      [SortOrder.ASC]: '升序',
      [SortOrder.DESC]: '降序',
    };
    return labels[order] || order;
  },

  getAllOrders(): SortOrder[] {
    return Object.values(SortOrder);
  },
};

export const LogLevelHelper = {
  getLevel(level: LogLevel): number {
    const levels = {
      [LogLevel.ERROR]: 0,
      [LogLevel.WARN]: 1,
      [LogLevel.INFO]: 2,
      [LogLevel.DEBUG]: 3,
    };
    return levels[level] || 2;
  },

  shouldLog(currentLevel: LogLevel, messageLevel: LogLevel): boolean {
    return LogLevelHelper.getLevel(currentLevel) >= LogLevelHelper.getLevel(messageLevel);
  },

  getLabel(level: LogLevel): string {
    const labels = {
      [LogLevel.ERROR]: '错误',
      [LogLevel.WARN]: '警告',
      [LogLevel.INFO]: '信息',
      [LogLevel.DEBUG]: '调试',
    };
    return labels[level] || level;
  },

  getColor(level: LogLevel): string {
    const colors = {
      [LogLevel.ERROR]: '#ef4444',   // red
      [LogLevel.WARN]: '#f59e0b',    // amber
      [LogLevel.INFO]: '#3b82f6',    // blue
      [LogLevel.DEBUG]: '#6b7280',   // gray
    };
    return colors[level] || '#6b7280';
  },

  getIcon(level: LogLevel): string {
    const icons = {
      [LogLevel.ERROR]: '❌',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.INFO]: 'ℹ️',
      [LogLevel.DEBUG]: '🐛',
    };
    return icons[level] || 'ℹ️';
  },

  getAllLevels(): LogLevel[] {
    return Object.values(LogLevel);
  },
};

export const AuditActionHelper = {
  isModification(action: AuditAction): boolean {
    return [AuditAction.CREATE, AuditAction.UPDATE, AuditAction.DELETE].includes(action);
  },

  isAccess(action: AuditAction): boolean {
    return [AuditAction.LOGIN, AuditAction.LOGOUT, AuditAction.ACCESS].includes(action);
  },

  isDataTransfer(action: AuditAction): boolean {
    return [AuditAction.EXPORT, AuditAction.IMPORT].includes(action);
  },

  getLabel(action: AuditAction): string {
    const labels = {
      [AuditAction.CREATE]: '创建',
      [AuditAction.UPDATE]: '更新',
      [AuditAction.DELETE]: '删除',
      [AuditAction.LOGIN]: '登录',
      [AuditAction.LOGOUT]: '登出',
      [AuditAction.ACCESS]: '访问',
      [AuditAction.EXPORT]: '导出',
      [AuditAction.IMPORT]: '导入',
    };
    return labels[action] || action;
  },

  getColor(action: AuditAction): string {
    const colors = {
      [AuditAction.CREATE]: '#10b981',   // green
      [AuditAction.UPDATE]: '#3b82f6',   // blue
      [AuditAction.DELETE]: '#ef4444',   // red
      [AuditAction.LOGIN]: '#8b5cf6',    // purple
      [AuditAction.LOGOUT]: '#f59e0b',   // amber
      [AuditAction.ACCESS]: '#6b7280',   // gray
      [AuditAction.EXPORT]: '#14b8a6',   // teal
      [AuditAction.IMPORT]: '#84cc16',   // lime
    };
    return colors[action] || '#6b7280';
  },

  getAllActions(): AuditAction[] {
    return Object.values(AuditAction);
  },
};

export const ExportFormatHelper = {
  getMimeType(format: ExportFormat): string {
    const mimeTypes = {
      [ExportFormat.JSON]: 'application/json',
      [ExportFormat.CSV]: 'text/csv',
      [ExportFormat.XML]: 'application/xml',
      [ExportFormat.SQL]: 'application/sql',
    };
    return mimeTypes[format] || 'text/plain';
  },

  getFileExtension(format: ExportFormat): string {
    const extensions = {
      [ExportFormat.JSON]: '.json',
      [ExportFormat.CSV]: '.csv',
      [ExportFormat.XML]: '.xml',
      [ExportFormat.SQL]: '.sql',
    };
    return extensions[format] || '.txt';
  },

  getLabel(format: ExportFormat): string {
    const labels = {
      [ExportFormat.JSON]: 'JSON',
      [ExportFormat.CSV]: 'CSV',
      [ExportFormat.XML]: 'XML',
      [ExportFormat.SQL]: 'SQL',
    };
    return labels[format] || format;
  },

  supportsNestedData(format: ExportFormat): boolean {
    return [ExportFormat.JSON, ExportFormat.XML].includes(format);
  },

  isTabular(format: ExportFormat): boolean {
    return [ExportFormat.CSV, ExportFormat.SQL].includes(format);
  },

  getAllFormats(): ExportFormat[] {
    return Object.values(ExportFormat);
  },
};

export const ImportStatusHelper = {
  isActive(status: ImportStatus): boolean {
    return status === ImportStatus.PROCESSING;
  },

  isCompleted(status: ImportStatus): boolean {
    return [ImportStatus.COMPLETED, ImportStatus.FAILED, ImportStatus.CANCELLED].includes(status);
  },

  canCancel(status: ImportStatus): boolean {
    return [ImportStatus.PENDING, ImportStatus.PROCESSING].includes(status);
  },

  getLabel(status: ImportStatus): string {
    const labels = {
      [ImportStatus.PENDING]: '等待中',
      [ImportStatus.PROCESSING]: '处理中',
      [ImportStatus.COMPLETED]: '已完成',
      [ImportStatus.FAILED]: '失败',
      [ImportStatus.CANCELLED]: '已取消',
    };
    return labels[status] || status;
  },

  getColor(status: ImportStatus): string {
    const colors = {
      [ImportStatus.PENDING]: '#6b7280',   // gray
      [ImportStatus.PROCESSING]: '#3b82f6', // blue
      [ImportStatus.COMPLETED]: '#10b981',  // green
      [ImportStatus.FAILED]: '#ef4444',     // red
      [ImportStatus.CANCELLED]: '#f59e0b',  // amber
    };
    return colors[status] || '#6b7280';
  },

  getAllStatuses(): ImportStatus[] {
    return Object.values(ImportStatus);
  },
};

export const NotificationTypeHelper = {
  getSeverity(type: NotificationType): 'low' | 'medium' | 'high' {
    const severities: Record<NotificationType, 'low' | 'medium' | 'high'> = {
      [NotificationType.INFO]: 'low',
      [NotificationType.SUCCESS]: 'low',
      [NotificationType.WARNING]: 'medium',
      [NotificationType.ERROR]: 'high',
    };
    return severities[type] || 'low';
  },

  getColor(type: NotificationType): string {
    const colors = {
      [NotificationType.INFO]: '#3b82f6',     // blue
      [NotificationType.SUCCESS]: '#10b981',  // green
      [NotificationType.WARNING]: '#f59e0b',  // amber
      [NotificationType.ERROR]: '#ef4444',    // red
    };
    return colors[type] || '#6b7280';
  },

  getIcon(type: NotificationType): string {
    const icons = {
      [NotificationType.INFO]: 'ℹ️',
      [NotificationType.SUCCESS]: '✅',
      [NotificationType.WARNING]: '⚠️',
      [NotificationType.ERROR]: '❌',
    };
    return icons[type] || 'ℹ️';
  },

  getLabel(type: NotificationType): string {
    const labels = {
      [NotificationType.INFO]: '信息',
      [NotificationType.SUCCESS]: '成功',
      [NotificationType.WARNING]: '警告',
      [NotificationType.ERROR]: '错误',
    };
    return labels[type] || type;
  },

  getAllTypes(): NotificationType[] {
    return Object.values(NotificationType);
  },
};

export const DataFormatHelper = {
  isNumeric(format: DataFormat): boolean {
    return format === DataFormat.NUMBER;
  },

  isText(format: DataFormat): boolean {
    return [DataFormat.STRING, DataFormat.JSON].includes(format);
  },

  isDate(format: DataFormat): boolean {
    return [DataFormat.DATE, DataFormat.DATETIME].includes(format);
  },

  isComplex(format: DataFormat): boolean {
    return [DataFormat.JSON, DataFormat.ARRAY, DataFormat.OBJECT].includes(format);
  },

  getDefaultValue(format: DataFormat): any {
    const defaults = {
      [DataFormat.STRING]: '',
      [DataFormat.NUMBER]: 0,
      [DataFormat.BOOLEAN]: false,
      [DataFormat.DATE]: null,
      [DataFormat.DATETIME]: null,
      [DataFormat.JSON]: null,
      [DataFormat.ARRAY]: [],
      [DataFormat.OBJECT]: {},
    };
    return defaults[format];
  },

  getLabel(format: DataFormat): string {
    const labels = {
      [DataFormat.STRING]: '文本',
      [DataFormat.NUMBER]: '数字',
      [DataFormat.BOOLEAN]: '布尔值',
      [DataFormat.DATE]: '日期',
      [DataFormat.DATETIME]: '日期时间',
      [DataFormat.JSON]: 'JSON',
      [DataFormat.ARRAY]: '数组',
      [DataFormat.OBJECT]: '对象',
    };
    return labels[format] || format;
  },

  getAllFormats(): DataFormat[] {
    return Object.values(DataFormat);
  },
};