# Change: Integrate Backend API and Database Support

## Why
The current RemoteHub frontend application uses localStorage for data persistence, which limits data sharing between users, lacks proper security, and cannot scale for team collaboration. Adding backend support will enable:

- Multi-user data sharing and collaboration
- Proper authentication and authorization
- Persistent data storage with MySQL/SQL Server
- Team-based project management
- Real-time user presence tracking
- Simplified architecture by removing AI assistant dependencies

## What Changes
### Frontend Changes
- **BREAKING**: Replace localStorage adapter with HTTP API adapter
- **BREAKING**: Modify authentication service to use JWT tokens
- **BREAKING**: Update storage interface to handle API errors and loading states
- **REMOVED**: AI Assistant component and @google/genai dependency
- **REMOVED**: GEMINI_API_KEY configuration and related code
- Add API configuration management (base URL, timeout, retry)
- Add loading states and error handling for all data operations
- Modify password hashing to server-side only
- **NEW**: Database configuration modal for admin users
- **NEW**: Connection testing interface
- **NEW**: Environment switching (dev/prod databases)

### Backend Changes
- Create REST API server with Node.js/Express + TypeScript
- Implement JWT-based authentication system
- Design database schema for users, projects, and connections
- Add audit logging and data validation
- Implement role-based access control (RBAC)
- Add API endpoints for all CRUD operations
- **NEW**: Admin-only database configuration management
- **NEW**: Dynamic database connection manager
- **NEW**: Encrypted configuration storage
- Support both MySQL and SQL Server databases

### Infrastructure Changes
- Database connection management
- Environment configuration for different deployment environments
- API documentation (OpenAPI/Swagger)
- Error handling and logging
- CORS configuration for frontend integration

## Impact
- Affected specs: `user-auth`, `data-storage`, `project-management`, `connection-management`, `database-config`
- Affected code: All service files, storage adapter, authentication components, and admin UI
- Migration path: Data migration from localStorage to database
- Breaking changes: Storage interface and authentication flow
- **NEW**: Admin-only database configuration capabilities
- **NEW**: Dynamic database connection management without service restart

## Database Choice Options
- **MySQL**: Open-source, widely supported, good performance
- **SQL Server**: Enterprise-grade, advanced features, Windows integration
- **Decision**: Will support both through database abstraction layer