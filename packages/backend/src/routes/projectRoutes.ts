// packages/backend/src/routes/projectRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as projectController from '../controllers/projectController.js';
import type { MemberRole } from '@remotehub/shared';

export const projectRoutes: RouterType = Router();

projectRoutes.get('/', authMiddleware, projectController.listProjects);
projectRoutes.post('/', authMiddleware, auditMiddleware({ action: 'PROJECT_CREATE', resource: 'project' }), projectController.createProject);
projectRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), projectController.getProject);
projectRoutes.patch('/:id', authMiddleware, auditMiddleware({ action: 'PROJECT_UPDATE', resource: 'project' }), projectRoleMiddleware('editor' as MemberRole), projectController.updateProject);
projectRoutes.delete('/:id', authMiddleware, auditMiddleware({ action: 'PROJECT_DELETE', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.deleteProject);
