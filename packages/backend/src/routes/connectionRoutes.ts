// packages/backend/src/routes/connectionRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import * as connectionController from '../controllers/connectionController.js';
import type { MemberRole } from '@remotehub/shared';

export const connectionRoutes: RouterType = Router();

connectionRoutes.get('/', authMiddleware, connectionController.listConnections);
connectionRoutes.post('/', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.createConnection);
connectionRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), connectionController.getConnection);
connectionRoutes.patch('/:id', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.updateConnection);
connectionRoutes.delete('/:id', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.deleteConnection);
connectionRoutes.post('/:id/decrypt-password', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.decryptPassword);
