// packages/backend/src/routes/connectionRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as connectionController from '../controllers/connectionController.js';
import type { MemberRole } from '@remotehub/shared';

export const connectionRoutes: RouterType = Router();

connectionRoutes.get('/', authMiddleware, connectionController.listConnections);
connectionRoutes.post('/', authMiddleware, auditMiddleware({ action: 'CONNECTION_CREATE', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), connectionController.createConnection);
connectionRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), connectionController.getConnection);
connectionRoutes.patch('/:id', authMiddleware, auditMiddleware({ action: 'CONNECTION_UPDATE', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), connectionController.updateConnection);
connectionRoutes.delete('/:id', authMiddleware, auditMiddleware({ action: 'CONNECTION_DELETE', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), connectionController.deleteConnection);
connectionRoutes.post('/:id/decrypt-password', authMiddleware, auditMiddleware({ action: 'CONNECTION_ACCESS', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), connectionController.decryptPassword);
// #45 直连三类分派（viewer 门——rdp/命令串/URL 全由 viewer 可见字段构成，不含密码；审计挂 CONNECTION_ACCESS 同 decrypt-password 先例）
connectionRoutes.get('/:id/launch', authMiddleware, auditMiddleware({ action: 'CONNECTION_ACCESS', resource: 'connection' }), projectRoleMiddleware('viewer' as MemberRole), connectionController.launchConnection);
