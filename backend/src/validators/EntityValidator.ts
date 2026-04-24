import { validate, ValidationError } from 'class-validator';
import { plainToClass, classToPlain } from 'class-transformer';

/**
 * Base entity validator class
 */
export abstract class EntityValidator {
  /**
   * Validate entity instance
   */
  public static async validate<T extends object>(
    entity: T,
    options?: {
      skipMissingProperties?: boolean;
      whitelist?: boolean;
      forbidNonWhitelisted?: boolean;
    }
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const validationErrors = await validate(entity, {
      skipMissingProperties: options?.skipMissingProperties || false,
      whitelist: options?.whitelist || true,
      forbidNonWhitelisted: options?.forbidNonWhitelisted || true,
    });

    if (validationErrors.length === 0) {
      return { isValid: true, errors: [] };
    }

    const errors = this.formatValidationErrors(validationErrors);
    return { isValid: false, errors };
  }

  /**
   * Validate entity before creation
   */
  public static async validateForCreation<T extends object>(entity: T): Promise<{ isValid: boolean; errors: string[] }> {
    return this.validate(entity, {
      skipMissingProperties: false,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  /**
   * Validate entity before update
   */
  public static async validateForUpdate<T extends object>(entity: T): Promise<{ isValid: boolean; errors: string[] }> {
    return this.validate(entity, {
      skipMissingProperties: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  /**
   * Validate partial entity for patch operations
   */
  public static async validateForPatch<T extends object>(data: Partial<T>, EntityClass: new () => T): Promise<{ isValid: boolean; errors: string[] }> {
    const entity = plainToClass(EntityClass, data);
    return this.validate(entity, {
      skipMissingProperties: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  /**
   * Format validation errors into human-readable messages
   */
  private static formatValidationErrors(errors: ValidationError[]): string[] {
    const formattedErrors: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        Object.values(error.constraints).forEach(message => {
          formattedErrors.push(`${error.property}: ${message}`);
        });
      }

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const childErrors = this.formatValidationErrors(error.children);
        formattedErrors.push(...childErrors.map(err => `${error.property}.${err}`));
      }
    }

    return formattedErrors;
  }

  /**
   * Sanitize entity data by removing non-whitelisted properties
   */
  public static sanitize<T extends object>(data: any, EntityClass: new () => T): T {
    return plainToClass(EntityClass, data, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform entity to plain object while excluding sensitive fields
   */
  public static transform<T extends object>(
    entity: T,
    options?: {
      excludeSensitiveFields?: boolean;
      sensitiveFields?: string[];
    }
  ): Record<string, any> {
    const plain = classToPlain(entity);

    if (options?.excludeSensitiveFields) {
      const sensitiveFields = options.sensitiveFields || [
        'password',
        '_encryptedPassword',
        'twoFactorSecret',
        'backupCodes',
        'passwordResetToken',
      ];

      sensitiveFields.forEach(field => {
        delete plain[field];
      });
    }

    return plain;
  }
}

/**
 * Validation rules for common field types
 */
export class ValidationRules {
  /**
   * Email validation regex
   */
  public static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Username validation regex (alphanumeric, underscores, 3-30 chars)
   */
  public static readonly USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

  /**
   * Strong password validation regex
   * At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
   */
  public static readonly STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  /**
   * UUID validation regex
   */
  public static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Hostname/IP validation regex
   */
  public static readonly HOST_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  /**
   * Database name validation regex
   */
  public static readonly DATABASE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

  /**
   * Validate email format
   */
  public static isValidEmail(email: string): boolean {
    return this.EMAIL_REGEX.test(email);
  }

  /**
   * Validate username format
   */
  public static isValidUsername(username: string): boolean {
    return this.USERNAME_REGEX.test(username);
  }

  /**
   * Validate password strength
   */
  public static isValidPassword(password: string): boolean {
    return this.STRONG_PASSWORD_REGEX.test(password);
  }

  /**
   * Validate UUID format
   */
  public static isValidUUID(uuid: string): boolean {
    return this.UUID_REGEX.test(uuid);
  }

  /**
   * Validate hostname or IP address
   */
  public static isValidHost(host: string): boolean {
    // IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(host)) {
      const parts = host.split('.');
      return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }

    // Hostname validation
    return this.HOST_REGEX.test(host);
  }

  /**
   * Validate port number
   */
  public static isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  /**
   * Validate database name
   */
  public static isValidDatabaseName(name: string): boolean {
    return this.DATABASE_NAME_REGEX.test(name);
  }

  /**
   * Validate URL format
   */
  public static isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate JSON string
   */
  public static isValidJSON(json: string): boolean {
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate phone number (basic international format)
   */
  public static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s-]/g, ''));
  }

  /**
   * Validate string length
   */
  public static isValidLength(value: string, minLength: number, maxLength: number): boolean {
    return value.length >= minLength && value.length <= maxLength;
  }

  /**
   * Validate number range
   */
  public static isValidRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  /**
   * Validate array length
   */
  public static isValidArrayLength(array: any[], minLength: number, maxLength: number): boolean {
    return array.length >= minLength && array.length <= maxLength;
  }

  /**
   * Validate object keys
   */
  public static hasRequiredKeys(obj: Record<string, any>, requiredKeys: string[]): boolean {
    return requiredKeys.every(key => key in obj && obj[key] !== undefined && obj[key] !== null);
  }

  /**
   * Validate date range
   */
  public static isValidDateRange(startDate: Date, endDate: Date): boolean {
    return startDate < endDate;
  }

  /**
   * Validate future date
   */
  public static isFutureDate(date: Date): boolean {
    return date > new Date();
  }

  /**
   * Validate past date
   */
  public static isPastDate(date: Date): boolean {
    return date < new Date();
  }

  /**
   * Validate date is within specified days from now
   */
  public static isDateWithinDays(date: Date, days: number): boolean {
    const now = new Date();
    const diffInDays = Math.abs((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffInDays <= days;
  }

  /**
   * Validate enum value
   */
  public static isValidEnumValue(value: string, enumObject: Record<string, string>): boolean {
    return Object.values(enumObject).includes(value);
  }

  /**
   * Validate tag format (comma-separated, no duplicates)
   */
  public static isValidTags(tags: string): boolean {
    if (!tags.trim()) return true;

    const tagArray = tags.split(',').map(tag => tag.trim());
    const uniqueTags = new Set(tagArray);

    // Check for empty tags and duplicates
    return tagArray.length === uniqueTags.size && tagArray.every(tag => tag.length > 0);
  }

  /**
   * Validate file size (in bytes)
   */
  public static isValidFileSize(size: number, maxSizeInMB: number): boolean {
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    return size >= 0 && size <= maxSizeInBytes;
  }

  /**
   * Validate file extension
   */
  public static isValidFileExtension(filename: string, allowedExtensions: string[]): boolean {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? allowedExtensions.includes(extension) : false;
  }

  /**
   * Validate color hex code
   */
  public static isValidHexColor(color: string): boolean {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexColorRegex.test(color);
  }

  /**
   * Validate version string (semantic versioning)
   */
  public static isValidVersion(version: string): boolean {
    const versionRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/;
    return versionRegex.test(version);
  }
}

/**
 * Custom validation error class
 */
export class EntityValidationError extends Error {
  public errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = 'EntityValidationError';
    this.errors = errors;
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      errors: this.errors,
    };
  }
}

/**
 * Validation result type
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Async validation decorator
 */
export function ValidateAsync(validationFunction: (target: any, propertyKey: string, value: any) => Promise<string | null>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const [value] = args;
      const error = await validationFunction.call(this, target, propertyKey, value);

      if (error) {
        throw new EntityValidationError(`Validation failed for ${propertyKey}`, [error]);
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Sync validation decorator
 */
export function Validate(validationFunction: (value: any) => string | null) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const [value] = args;
      const error = validationFunction.call(this, value);

      if (error) {
        throw new EntityValidationError(`Validation failed for ${propertyKey}`, [error]);
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}