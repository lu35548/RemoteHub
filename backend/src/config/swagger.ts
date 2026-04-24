import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './config';

// Swagger configuration
export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RemoteHub API',
      version: config.api.version,
      description: `
        RemoteHub backend API documentation
        
        ## Overview
        This API provides endpoints for managing remote connections and projects.
        
        ## Authentication
        Most endpoints require JWT authentication. Include the token in the Authorization header:
        \`Authorization: Bearer <your-jwt-token>\`
        
        ## Error Handling
        All errors follow a consistent format:
        \`\`\`json
        {
          "success": false,
          "error": {
            "code": "ERROR_CODE",
            "message": "Human readable error message",
            "details": { ... },
            "timestamp": "2023-01-01T00:00:00.000Z",
            "path": "/api/v1/example",
            "method": "GET"
          }
        }
        \`\`\`
        
        ## Rate Limiting
        API endpoints are rate-limited to prevent abuse. Check the \`X-Rate-Limit-Remaining\` header.
      `,
      contact: {
        name: 'RemoteHub Support',
        email: 'support@remotehub.com',
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}${config.api.prefix}`,
        description: 'Development server',
      },
      ...(config.env === 'production' ? [{
        url: `https://api.remotehub.com${config.api.prefix}`,
        description: 'Production server',
      }] : []),
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authentication token',
        },
      },
      schemas: {
        // Common response schemas
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              description: 'Response data (varies by endpoint)',
            },
            message: {
              type: 'string',
              description: 'Success message',
              example: 'Operation completed successfully',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
          },
        },
        
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'NOT_FOUND',
                },
                message: {
                  type: 'string',
                  example: 'Resource not found',
                },
                details: {
                  type: 'object',
                  description: 'Additional error details (development only)',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  example: '2023-01-01T00:00:00.000Z',
                },
                path: {
                  type: 'string',
                  example: '/api/v1/users',
                },
                method: {
                  type: 'string',
                  example: 'GET',
                },
                requestId: {
                  type: 'string',
                  format: 'uuid',
                  description: 'Unique request identifier for debugging',
                },
              },
            },
          },
        },
        
        // Entity schemas (will be expanded as we add actual entities)
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            username: {
              type: 'string',
              example: 'johndoe',
              description: 'Unique username',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            firstName: {
              type: 'string',
              example: 'John',
            },
            lastName: {
              type: 'string',
              example: 'Doe',
            },
            role: {
              type: 'string',
              enum: ['admin', 'user'],
              example: 'user',
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'suspended', 'pending'],
              example: 'active',
            },
            emailVerified: {
              type: 'boolean',
              example: true,
            },
            avatar: {
              type: 'string',
              format: 'uri',
              example: 'https://example.com/avatar.jpg',
            },
            bio: {
              type: 'string',
              example: 'Software developer passionate about remote work',
            },
            phone: {
              type: 'string',
              example: '+1234567890',
            },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
          },
        },

        TokenPair: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              description: 'JWT access token (15 minutes expiry)',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              description: 'JWT refresh token (7 days expiry)',
            },
          },
        },
        
        Project: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            name: {
              type: 'string',
              example: 'My Project',
            },
            description: {
              type: 'string',
              example: 'A sample project',
            },
            userId: {
              type: 'string',
              format: 'uuid',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
          },
        },
        
        Connection: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            name: {
              type: 'string',
              example: 'My Database Connection',
            },
            type: {
              type: 'string',
              enum: ['mysql', 'postgresql', 'mssql', 'mongodb'],
              example: 'mysql',
            },
            host: {
              type: 'string',
              example: 'localhost',
            },
            port: {
              type: 'integer',
              example: 3306,
            },
            database: {
              type: 'string',
              example: 'myapp',
            },
            projectId: {
              type: 'string',
              format: 'uuid',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-01T00:00:00.000Z',
            },
          },
        },
        
        // Request schemas
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'User password',
              example: 'password123',
            },
          },
        },
        
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'name'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'User password (min 8 characters, must contain uppercase, lowercase, and number)',
              example: 'Password123',
            },
            name: {
              type: 'string',
              description: 'User full name',
              example: 'John Doe',
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
              example: {
                success: false,
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'Invalid authentication token',
                  timestamp: '2023-01-01T00:00:00.000Z',
                  path: '/api/v1/users',
                  method: 'GET',
                },
              },
            },
          },
        },
        
        ForbiddenError: {
          description: 'Access denied',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
              example: {
                success: false,
                error: {
                  code: 'FORBIDDEN',
                  message: 'You do not have permission to access this resource',
                  timestamp: '2023-01-01T00:00:00.000Z',
                  path: '/api/v1/admin/users',
                  method: 'GET',
                },
              },
            },
          },
        },
        
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
              example: {
                success: false,
                error: {
                  code: 'NOT_FOUND',
                  message: 'User not found',
                  timestamp: '2023-01-01T00:00:00.000Z',
                  path: '/api/v1/users/123',
                  method: 'GET',
                },
              },
            },
          },
        },
        
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse',
              },
              example: {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Validation failed',
                  details: [
                    {
                      field: 'email',
                      message: 'Email is required',
                      value: null,
                    },
                  ],
                  timestamp: '2023-01-01T00:00:00.000Z',
                  path: '/api/v1/users',
                  method: 'POST',
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization',
      },
      {
        name: 'Users',
        description: 'User management operations',
      },
      {
        name: 'Projects',
        description: 'Project management operations',
      },
      {
        name: 'Connections',
        description: 'Database connection management',
      },
      {
        name: 'Health',
        description: 'Health check and system status',
      },
    ],
  },
  apis: [
    './src/routes/*.ts', // Path to route files with Swagger annotations
    './src/models/*.ts',  // Path to model files with Swagger annotations
  ],
};

// Generate Swagger specification
export const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Custom Swagger UI options
export const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6 }
    .swagger-ui .scheme-container { background: #f8fafc; padding: 15px; border-radius: 8px }
  `,
  customSiteTitle: 'RemoteHub API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
  },
};

export default swaggerSpec;