import { config } from '@/config/config';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = this.getLogLevel(config.logging.level);
  }

  private getLogLevel(level: string): LogLevel {
    switch (level) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    
    let formattedMessage = `[${timestamp}] [${level}] [PID:${pid}] ${message}`;
    
    if (data) {
      formattedMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    return formattedMessage;
  }

  private log(level: LogLevel, levelName: string, message: string, data?: any): void {
    if (level <= this.level) {
      const formattedMessage = this.formatMessage(levelName, message, data);
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
      }
    }
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, data);
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data);
  }

  // Special logging methods for common scenarios
  httpRequest(method: string, url: string, statusCode: number, responseTime: number): void {
    this.info(`HTTP Request`, {
      method,
      url,
      statusCode,
      responseTime: `${responseTime}ms`,
    });
  }

  databaseError(operation: string, error: Error): void {
    this.error(`Database operation failed: ${operation}`, {
      error: error.message,
      stack: error.stack,
    });
  }

  authenticationError(userId?: string, reason?: string): void {
    this.warn('Authentication failed', {
      userId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  serverInfo(event: string, data?: any): void {
    this.info(`Server event: ${event}`, data);
  }
}

export const logger = new Logger();
export default logger;