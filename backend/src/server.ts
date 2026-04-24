import 'reflect-metadata';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { config } from './config/config';
import { logger } from './utils/logger';
import { initializeApp } from './app-init';

async function startServer() {
  try {
    logger.info('Starting RemoteHub backend server...');

    // Initialize the application with all services
    const { app, services, server } = await initializeApp({
      port: config.port,
      databaseUrl: process.env.DATABASE_URL,
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN,
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    });

    logger.info(`Server is running on http://${config.host}:${config.port}`);
    logger.info(`API Documentation: http://${config.host}:${config.port}/api-docs`);
    logger.info(`Health Check: http://${config.host}:${config.port}/health`);
    logger.info(`Extended Health Check: http://${config.host}:${config.port}/health/extended`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();