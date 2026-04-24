import { logger } from '@/utils/logger';
import { getServices } from './container';

interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  path: string;
  method: string;
  timestamp: Date;
  details: any;
  resolved?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

enum SecurityEventType {
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  FAILED_AUTHENTICATION = 'failed_authentication',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  BRUTE_FORCE_ATTACK = 'brute_force_attack',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_ATTEMPT = 'csrf_attempt',
  DATA_LEAKAGE = 'data_leakage',
  ABNORMAL_TRAFFIC = 'abnormal_traffic',
  SESSION_HIJACKING = 'session_hijacking',
  MALICIOUS_REQUEST = 'malicious_request',
}

interface SecurityAlert {
  id: string;
  eventId: string;
  type: 'immediate' | 'daily' | 'weekly';
  recipients: string[];
  subject: string;
  message: string;
  sentAt?: Date;
}

interface SecurityStatistics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<string, number>;
  eventsToday: number;
  eventsThisWeek: number;
  topOffenders: Array<{
    ipAddress: string;
    count: number;
  }>;
}

export class SecurityMonitoringService {
  private static events: SecurityEvent[] = [];
  private static alerts: SecurityAlert[] = [];

  /**
   * 记录安全事件
   */
  public static async recordSecurityEvent(
    type: SecurityEventType,
    severity: 'low' | 'medium' | 'high' | 'critical',
    req: any,
    details: any = {}
  ): Promise<string> {
    const eventId = `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const event: SecurityEvent = {
      id: eventId,
      type,
      severity,
      userId: req.user?.id,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date(),
      details,
    };

    this.events.push(event);

    // 记录到日志
    logger.warn('安全事件记录', {
      eventId,
      type,
      severity,
      userId: event.userId,
      ipAddress: event.ipAddress,
      path: event.path,
      details,
    });

    // 根据严重程度触发警报
    if (severity === 'high' || severity === 'critical') {
      await this.triggerImmediateAlert(event);
    }

    // 限制内存中事件数量
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000); // 保留最近5000个事件
    }

    return eventId;
  }

  /**
   * 触发即时警报
   */
  private static async triggerImmediateAlert(event: SecurityEvent): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert: SecurityAlert = {
      id: alertId,
      eventId: event.id,
      type: 'immediate',
      recipients: await this.getSecurityTeamEmails(),
      subject: `[${event.severity.toUpperCase()}] RemoteHub安全警报: ${this.getEventTypeName(event.type)}`,
      message: this.generateAlertMessage(event),
    };

    this.alerts.push(alert);

    // 这里应该发送邮件或通知
    // await this.sendAlert(alert);
    logger.error('安全警报触发', {
      alertId,
      eventId: event.id,
      type: alert.type,
      recipients: alert.recipients,
    });
  }

  /**
   * 获取安全团队邮箱
   */
  private static async getSecurityTeamEmails(): Promise<string[]> {
    // 这里应该从配置或数据库中获取
    return ['security@remotehub.com', 'admin@remotehub.com'];
  }

  /**
   * 获取事件类型名称
   */
  private static getEventTypeName(type: SecurityEventType): string {
    const typeNames: Record<SecurityEventType, string> = {
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: '可疑活动',
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: '速率限制超出',
      [SecurityEventType.FAILED_AUTHENTICATION]: '认证失败',
      [SecurityEventType.UNAUTHORIZED_ACCESS]: '未授权访问',
      [SecurityEventType.BRUTE_FORCE_ATTACK]: '暴力破解攻击',
      [SecurityEventType.SQL_INJECTION_ATTEMPT]: 'SQL注入尝试',
      [SecurityEventType.XSS_ATTEMPT]: 'XSS攻击尝试',
      [SecurityEventType.CSRF_ATTEMPT]: 'CSRF攻击尝试',
      [SecurityEventType.DATA_LEAKAGE]: '数据泄露',
      [SecurityEventType.ABNORMAL_TRAFFIC]: '异常流量',
      [SecurityEventType.SESSION_HIJACKING]: '会话劫持',
      [SecurityEventType.MALICIOUS_REQUEST]: '恶意请求',
    };

    return typeNames[type] || '未知事件类型';
  }

  /**
   * 生成警报消息
   */
  private static generateAlertMessage(event: SecurityEvent): string {
    return `
安全事件详情：

事件ID: ${event.id}
类型: ${this.getEventTypeName(event.type)}
严重程度: ${event.severity.toUpperCase()}
时间: ${event.timestamp.toISOString()}
IP地址: ${event.ipAddress}
用户ID: ${event.userId || 'N/A'}
路径: ${event.method} ${event.path}
用户代理: ${event.userAgent || 'N/A'}

详细信息:
${JSON.stringify(event.details, null, 2)}

请立即登录系统查看详情并采取必要措施。
    `.trim();
  }

  /**
   * 获取安全事件
   */
  public static async getSecurityEvents(filters: {
    startDate?: Date;
    endDate?: Date;
    type?: SecurityEventType;
    severity?: string;
    ipAddress?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ events: SecurityEvent[]; total: number }> {
    let filteredEvents = [...this.events];

    // 应用过滤器
    if (filters.startDate) {
      filteredEvents = filteredEvents.filter(event =>
        event.timestamp >= filters.startDate!
      );
    }

    if (filters.endDate) {
      filteredEvents = filteredEvents.filter(event =>
        event.timestamp <= filters.endDate!
      );
    }

    if (filters.type) {
      filteredEvents = filteredEvents.filter(event =>
        event.type === filters.type
      );
    }

    if (filters.severity) {
      filteredEvents = filteredEvents.filter(event =>
        event.severity === filters.severity
      );
    }

    if (filters.ipAddress) {
      filteredEvents = filteredEvents.filter(event =>
        event.ipAddress === filters.ipAddress
      );
    }

    if (filters.userId) {
      filteredEvents = filteredEvents.filter(event =>
        event.userId === filters.userId
      );
    }

    // 按时间倒序排列
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = filteredEvents.length;
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const events = filteredEvents.slice(offset, offset + limit);

    return { events, total };
  }

  /**
   * 获取安全统计
   */
  public static async getSecurityStatistics(): Promise<SecurityStatistics> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const eventsToday = this.events.filter(event => event.timestamp >= today);
    const eventsThisWeek = this.events.filter(event => event.timestamp >= weekAgo);

    // 按类型统计
    const eventsByType: Record<SecurityEventType, number> = {} as any;
    Object.values(SecurityEventType).forEach(type => {
      eventsByType[type] = 0;
    });
    this.events.forEach(event => {
      eventsByType[event.type]++;
    });

    // 按严重程度统计
    const eventsBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    this.events.forEach(event => {
      eventsBySeverity[event.severity]++;
    });

    // 统计违规IP
    const ipCounts: Record<string, number> = {};
    this.events.forEach(event => {
      ipCounts[event.ipAddress] = (ipCounts[event.ipAddress] || 0) + 1;
    });

    const topOffenders = Object.entries(ipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ipAddress, count]) => ({ ipAddress, count }));

    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsBySeverity,
      eventsToday: eventsToday.length,
      eventsThisWeek: eventsThisWeek.length,
      topOffenders,
    };
  }

  /**
   * 标记事件为已解决
   */
  public static async resolveEvent(
    eventId: string,
    resolvedBy: string,
    notes?: string
  ): Promise<boolean> {
    const event = this.events.find(e => e.id === eventId);
    if (!event) {
      return false;
    }

    event.resolved = true;
    event.resolvedAt = new Date();
    event.resolvedBy = resolvedBy;

    if (notes) {
      event.details.resolutionNotes = notes;
    }

    logger.info('安全事件已解决', {
      eventId,
      resolvedBy,
      resolvedAt: event.resolvedAt,
    });

    return true;
  }

  /**
   * 获取IP地址的风险评分
   */
  public static async getIPRiskScore(ipAddress: string): Promise<{
    score: number; // 0-100
    level: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
  }> {
    const ipEvents = this.events.filter(event => event.ipAddress === ipAddress);

    let score = 0;
    const reasons: string[] = [];

    // 基于事件数量
    if (ipEvents.length > 10) {
      score += 20;
      reasons.push('高频安全事件');
    }

    // 基于事件严重程度
    const criticalEvents = ipEvents.filter(e => e.severity === 'critical').length;
    const highEvents = ipEvents.filter(e => e.severity === 'high').length;

    score += criticalEvents * 30;
    score += highEvents * 15;

    if (criticalEvents > 0) {
      reasons.push(`包含${criticalEvents}个严重事件`);
    }

    // 基于事件类型
    const attackTypes = [
      SecurityEventType.BRUTE_FORCE_ATTACK,
      SecurityEventType.SQL_INJECTION_ATTEMPT,
      SecurityEventType.XSS_ATTEMPT,
    ];

    const attackEvents = ipEvents.filter(e => attackTypes.includes(e.type));
    if (attackEvents.length > 0) {
      score += 25;
      reasons.push('检测到攻击行为');
    }

    // 基于最近活动
    const now = new Date();
    const recentEvents = ipEvents.filter(e =>
      now.getTime() - e.timestamp.getTime() < 24 * 60 * 60 * 1000
    );

    if (recentEvents.length > 5) {
      score += 15;
      reasons.push('最近24小时内活动频繁');
    }

    // 确定风险级别
    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (score >= 75) {
      level = 'critical';
    } else if (score >= 50) {
      level = 'high';
    } else if (score >= 25) {
      level = 'medium';
    }

    return {
      score: Math.min(100, score),
      level,
      reasons,
    };
  }

  /**
   * 自动安全检查
   */
  public static async performSecurityCheck(): Promise<{
    status: 'safe' | 'warning' | 'danger';
    issues: Array<{
      type: string;
      description: string;
      recommendation: string;
    }>;
  }> {
    const issues: Array<{
      type: string;
      description: string;
      recommendation: string;
    }> = [];

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 检查最近一小时的安全事件
    const recentEvents = this.events.filter(event => event.timestamp >= oneHourAgo);

    // 检查暴力破解攻击
    const bruteForceEvents = recentEvents.filter(e =>
      e.type === SecurityEventType.BRUTE_FORCE_ATTACK ||
      (e.type === SecurityEventType.FAILED_AUTHENTICATION && e.details.failureCount > 5)
    );

    if (bruteForceEvents.length > 10) {
      issues.push({
        type: 'brute_force',
        description: `检测到${bruteForceEvents.length}次暴力破解或认证失败尝试`,
        recommendation: '建议启用IP黑名单或增强认证限制',
      });
    }

    // 检查异常流量
    const trafficEvents = recentEvents.filter(e =>
      e.type === SecurityEventType.ABNORMAL_TRAFFIC
    );

    if (trafficEvents.length > 5) {
      issues.push({
        type: 'traffic',
        description: `检测到${trafficEvents.length}次异常流量模式`,
        recommendation: '建议检查服务器负载和网络配置',
      });
    }

    // 检查攻击尝试
    const attackEvents = recentEvents.filter(e =>
      [
        SecurityEventType.SQL_INJECTION_ATTEMPT,
        SecurityEventType.XSS_ATTEMPT,
        SecurityEventType.CSRF_ATTEMPT,
      ].includes(e.type)
    );

    if (attackEvents.length > 0) {
      issues.push({
        type: 'attack',
        description: `检测到${attackEvents.length}次攻击尝试`,
        recommendation: '建议检查输入验证和安全配置',
      });
    }

    // 确定总体状态
    let status: 'safe' | 'warning' | 'danger' = 'safe';
    if (issues.some(issue => issue.type === 'attack' || issue.type === 'brute_force')) {
      status = 'danger';
    } else if (issues.length > 0) {
      status = 'warning';
    }

    return { status, issues };
  }

  /**
   * 清理旧事件
   */
  public static cleanupOldEvents(olderThanDays: number = 30): void {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const beforeCount = this.events.length;

    this.events = this.events.filter(event => event.timestamp > cutoffDate);

    const cleanedCount = beforeCount - this.events.length;
    if (cleanedCount > 0) {
      logger.info(`清理了${cleanedCount}个旧安全事件`, {
        olderThanDays,
        cutoffDate: cutoffDate.toISOString(),
      });
    }
  }
}