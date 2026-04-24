/**
 * Application Initialization
 *
 * This module handles the initialization of the application including:
 * - Service container setup
 * - Database connection
 * - Express app configuration
 * - Error handling setup
 */

import { initializeServices, IServiceContainer } from './services/container';
import { logger } from './utils/logger';
import app from './app';
import routes from './routes';
import authRoutes from './routes/auth';
// import { WebSocketService } from './services/websocketService';
// import { createOnlineStatusMiddleware } from './middleware/onlineStatus';

export interface AppInitializationOptions {
  port?: number;
  databaseUrl?: string;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  jwtRefreshExpiresIn?: string;
}

export class AppInitialization {
  private services: IServiceContainer | null = null;
  private server: any = null;
  // private wsService: WebSocketService | null = null;

  public async initialize(options: AppInitializationOptions = {}): Promise<{
    app: any;
    services: IServiceContainer;
    server: any;
    // wsService?: any;
  }> {
    try {
      logger.info('Starting application initialization...');

      // Step 1: Initialize services
      logger.info('Initializing services...');
      this.services = await initializeServices({
        databaseUrl: options.databaseUrl,
        jwtSecret: options.jwtSecret,
        jwtExpiresIn: options.jwtExpiresIn,
        jwtRefreshExpiresIn: options.jwtRefreshExpiresIn,
      });
      logger.info('Services initialized successfully');

      // Step 2: Test database connection
      logger.info('Testing database connection...');
      if (!this.services) {
        throw new Error('Services not initialized');
      }
      const dbHealth = await this.services.database.healthCheck();
      if (dbHealth.status !== 'connected') {
        throw new Error(`Database connection failed: ${dbHealth.details}`);
      }
      logger.info('Database connection successful');

      // Step 3: Configure Express app with services
      logger.info('Configuring Express application...');
      this.configureApp();

      // Step 4: Start HTTP server
      const port = options.port || parseInt(process.env.PORT || '3001');
      logger.info(`Starting HTTP server on port ${port}...`);

      this.server = app.listen(port, () => {
        logger.info(`HTTP server started successfully on port ${port}`);
      });

      // Step 5: Initialize WebSocket service after HTTP server starts (暂时禁用)
      // logger.info('Initializing WebSocket service...');
      // this.wsService = new WebSocketService(this.server);

      // Configure app with online status middleware (暂时禁用)
      // this.configureAppWithWebSocket();

      // logger.info('WebSocket service initialized successfully');

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${port} is already in use`);
        } else {
          logger.error('Server error:', error);
        }
        throw error;
      });

      logger.info('Application initialization completed successfully');

      return {
        app,
        services: this.services!, // Non-null assertion since we've initialized it
        server: this.server,
      };

    } catch (error) {
      logger.error('Application initialization failed:', error);
      await this.cleanup();
      throw error;
    }
  }

  private configureApp(): void {
    // Set services reference in app for middleware access
    (app as any).services = this.services;

    // Add API routes
    app.use('/api', routes);
    app.use('/api/auth', authRoutes);

    // Add health check endpoint that includes service status
    app.get('/health/extended', async (req, res) => {
      if (!this.services) {
        return res.status(503).json({
          status: 'error',
          message: 'Services not initialized'
        });
      }

      try {
        const [dbHealth] = await Promise.all([
          this.services.database.healthCheck(),
        ]);

        const healthData: any = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          services: {
            database: dbHealth,
          }
        };

        // WebSocket service temporarily disabled during architecture alignment
        healthData.services.websocket = {
          status: 'disabled',
          note: 'WebSocket service temporarily disabled during architecture alignment',
        };

        res.json(healthData);
      } catch (error: any) {
        res.status(503).json({
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private configureAppWithWebSocket(): void {
    // WebSocket functionality temporarily disabled during architecture alignment
    // TODO: Re-enable after creating RemoteConnection entity for frontend protocols
    logger.info('WebSocket functionality temporarily disabled - pending architecture alignment');

    // Placeholder for future WebSocket integration
    // This will be re-enabled after we solve the frontend/backend protocol mismatch
  }

  public async cleanup(): Promise<void> {
    try {
      logger.info('Starting application cleanup...');

      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server.close((err: any) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        logger.info('HTTP server closed');
      }

      // Shutdown services
      if (this.services) {
        await this.services.database.close();
        logger.info('Services shut down');
      }

      logger.info('Application cleanup completed');

    } catch (error) {
      logger.error('Error during application cleanup:', error);
      throw error;
    }
  }

  public getServices(): IServiceContainer {
    if (!this.services) {
      throw new Error('Services not initialized. Call initialize() first.');
    }
    return this.services;
  }
}

// Singleton instance
export const appInitialization = new AppInitialization();

// Convenience function for easy initialization
export async function initializeApp(options?: AppInitializationOptions) {
  return await appInitialization.initialize(options);
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, starting graceful shutdown...');
  try {
    await appInitialization.cleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, starting graceful shutdown...');
  try {
    await appInitialization.cleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  appInitialization.cleanup().finally(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  appInitialization.cleanup().finally(() => {
    process.exit(1);
  });
});