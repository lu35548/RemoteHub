// packages/backend/src/routes/projectRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import * as projectController from '../controllers/projectController.js';
import type { MemberRole } from '@remotehub/shared';

export const projectRoutes: RouterType = Router();

projectRoutes.get('/', authMiddleware, projectController.listProjects);
projectRoutes.post('/', authMiddleware, projectController.createProject);
projectRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), projectController.getProject);
projectRoutes.patch('/:id', authMiddleware, projectRoleMiddleware('editor' as MemberRole), projectController.updateProject);
projectRoutes.delete('/:id', authMiddleware, projectRoleMiddleware('owner' as MemberRole), projectController.deleteProject);
