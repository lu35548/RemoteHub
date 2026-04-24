/**
 * Dependency Injection Container
 *
 * This container provides a centralized way to manage service dependencies
 * and ensures proper initialization order of services.
 */

import { DatabaseServiceClass } from '../config/database';
import { PasswordService } from './passwordService';
import { jwtService, JWTService } from './jwtService';
import { PasswordResetService } from './passwordResetService';
import { SessionService } from './sessionService';

export interface ServiceContainer {
  database: DatabaseServiceClass;
  passwordService: PasswordService;
  jwtService: JWTService;
  passwordResetService: PasswordResetService;
  sessionService: SessionService;
}

export interface ServiceContainerOptions {
  databaseUrl?: string;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  jwtRefreshExpiresIn?: string;
}

class ServiceContainerImpl {
  private static instance: ServiceContainerImpl;
  private container: ServiceContainer | null = null;
  private initialized = false;

  private constructor() {}

  public static getInstance(): ServiceContainerImpl {
    if (!ServiceContainerImpl.instance) {
      ServiceContainerImpl.instance = new ServiceContainerImpl();
    }
    return ServiceContainerImpl.instance;
  }

  public async initialize(options: ServiceContainerOptions = {}): Promise<ServiceContainer> {
    if (this.initialized && this.container) {
      return this.container;
    }

    try {
      // Initialize services in dependency order
      console.log('Initializing service container...');

      // 1. Database service (lowest level dependency)
      const database = DatabaseServiceClass.getInstance();
      await database.initialize();

      // 2. Password service (no dependencies)
      const passwordService = new PasswordService();

      // 3. JWT service (no dependencies) - using the singleton instance
      const jwtServiceInstance = jwtService;

      // 4. Password reset service (no dependencies)
      const passwordResetService = new PasswordResetService();

      // 5. Session service (no dependencies)
      const sessionService = new SessionService();

      this.container = {
        database,
        passwordService,
        jwtService: jwtServiceInstance,
        passwordResetService,
        sessionService,
      };

      // Initialize default admin user for mock database
      await this.initializeDefaultAdmin(this.container);

      this.initialized = true;
      console.log('Service container initialized successfully');

      return this.container;
    } catch (error) {
      console.error('Failed to initialize service container:', error);
      throw error;
    }
  }

  public getContainer(): ServiceContainer {
    if (!this.container || !this.initialized) {
      throw new Error('Service container not initialized. Call initialize() first.');
    }
    return this.container;
  }

  public isInitialized(): boolean {
    return this.initialized && this.container !== null;
  }

  public async shutdown(): Promise<void> {
    if (this.container) {
      try {
        // Close database connection
        await this.container.database.close();
        console.log('Service container shutdown successfully');
      } catch (error) {
        console.error('Error during service container shutdown:', error);
        throw error;
      } finally {
        this.container = null;
        this.initialized = false;
      }
    }
  }

  // Individual service getters for convenience
  public get database(): DatabaseServiceClass {
    return this.getContainer().database;
  }

  public get passwordService(): PasswordService {
    return this.getContainer().passwordService;
  }

  public get jwtService(): JWTService {
    return this.getContainer().jwtService;
  }

  public get passwordResetService(): PasswordResetService {
    return this.getContainer().passwordResetService;
  }

  public get sessionService(): SessionService {
    return this.getContainer().sessionService;
  }

  // Initialize default admin user for mock database
  private async initializeDefaultAdmin(container: ServiceContainer): Promise<void> {
    try {
      const { UserRepository } = await import('../repositories/UserRepository');
      const { User, UserRole, UserStatus } = await import('../models/User');

      // Check if we're using mock database
      const isMockMode = process.env.NODE_ENV === 'development' ||
                       !process.env.DATABASE_URL ||
                       process.env.DATABASE_URL.includes('sqlite');

      if (isMockMode) {
        const userRepository = new UserRepository(container.database.getDataSource());

        // Check if any users exist
        const existingUsers = await userRepository.findByEmailOrUsername('admin@example.com');
        if (!existingUsers) {
          // Create default admin user with proper password hashing
          const passwordService = container.passwordService;
          const hashedPassword = await passwordService.hashPassword('admin123');

          await userRepository.createUser({
            username: 'admin',
            email: 'admin@example.com',
            password: hashedPassword,
            firstName: 'System',
            lastName: 'Administrator',
            role: UserRole.ADMIN,
            emailVerified: true,  // Admin email is pre-verified
            status: UserStatus.ACTIVE  // Ensure admin is active
          });
          // Admin user is created in MockDatabase.initialize()
          console.log('Mock database initialized with default admin user');
        }
      }
    } catch (error) {
      console.error('Failed to initialize default admin user:', error);
      // Don't throw error, just log it
    }
  }
}

// Export singleton instance
export const ServiceContainerInstance = ServiceContainerImpl.getInstance();

// Export types and utilities
export type { ServiceContainer as IServiceContainer, ServiceContainerOptions as IServiceContainerOptions };

// Utility function to initialize services with proper error handling
export async function initializeServices(options?: ServiceContainerOptions): Promise<ServiceContainer> {
  try {
    return await ServiceContainerImpl.getInstance().initialize(options);
  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
}

// Utility function to get services (will throw if not initialized)
export function getServices(): ServiceContainer {
  return ServiceContainerImpl.getInstance().getContainer();
}

// Check if services are initialized
export function areServicesInitialized(): boolean {
  return ServiceContainerImpl.getInstance().isInitialized();
}

