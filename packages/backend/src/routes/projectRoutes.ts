// packages/backend/src/routes/projectRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as projectController from '../controllers/projectController.js';
import * as connectionController from '../controllers/connectionController.js';
import type { MemberRole } from '@remotehub/shared';

export const projectRoutes: RouterType = Router();

projectRoutes.get('/', authMiddleware, projectController.listProjects);
projectRoutes.post('/', authMiddleware, auditMiddleware({ action: 'PROJECT_CREATE', resource: 'project' }), projectController.createProject);
projectRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), projectController.getProject);
// #41 连接金矿：项目连接统计（admin/项目成员含 viewer 可见）
projectRoutes.get('/:id/connections/stats', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), connectionController.getProjectConnectionStats);
projectRoutes.patch('/:id', authMiddleware, auditMiddleware({ action: 'PROJECT_UPDATE', resource: 'project' }), projectRoleMiddleware('editor' as MemberRole), projectController.updateProject);
projectRoutes.delete('/:id', authMiddleware, auditMiddleware({ action: 'PROJECT_DELETE', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.deleteProject);
