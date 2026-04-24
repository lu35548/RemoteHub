import { CorsOptions } from 'cors';
import { config } from './config';

// CORS configuration for different environments
export const corsConfig: CorsOptions = {
  // Allowed origins
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow all origins
    if (config.env === 'development') {
      return callback(null, true);
    }

    // In production, check against allowed origins
    const allowedOrigins = config.cors.origin.split(',').map(o => o.trim());
    
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },

  // Allow credentials (cookies, authorization headers, etc.)
  credentials: config.cors.credentials,

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Allowed headers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-API-Key',
    'X-Request-ID',
  ],

  // Exposed headers (headers that the browser can access)
  exposedHeaders: [
    'X-Total-Count',
    'X-Request-ID',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
  ],

  // Cache preflight requests for 1 hour
  maxAge: 3600 * 1000,

  // Pass preflight to next handler (for custom preflight responses)
  preflightContinue: false,

  // Options passthrough
  optionsSuccessStatus: 204,
};

// Environment-specific CORS configurations
export const getCorsConfig = (environment?: string): CorsOptions => {
  const env = environment || config.env;
  
  switch (env) {
    case 'development':
      return {
        ...corsConfig,
        origin: true, // Allow all origins in development
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: '*', // Allow all headers in development
      };
    
    case 'test':
      return {
        ...corsConfig,
        origin: false, // Disable CORS in testing
      };
    
    case 'production':
      return {
        ...corsConfig,
        origin: config.cors.origin.split(',').map(o => o.trim()),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        maxAge: 24 * 60 * 60 * 1000, // Cache for 24 hours in production
      };
    
    default:
      return corsConfig;
  }
};

// CORS middleware with additional logging
export const corsMiddleware = (req: any, res: any, next: any) => {
  const origin = req.headers.origin;
  
  // Log CORS requests for debugging
  if (origin) {
    console.log(`CORS request from origin: ${origin} to ${req.path}`);
  }
  
  // Apply CORS configuration
  const cors = require('cors')(getCorsConfig());
  cors(req, res, next);
};

export default corsConfig;