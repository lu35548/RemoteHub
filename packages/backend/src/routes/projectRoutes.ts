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
// ─── #47 项目管理增强 ───
// 归档/恢复/复制/转让权限门=owner（全局 admin 在 projectRoleMiddleware 直通）——design §17 权限矩阵
// （duplicate/archive/activate/batch/transfer = owner+admin）。「写权同门(editor)」口径被 §17 原文压过，报告注明。
// 批量归档不挂 auditMiddleware：逐项目审计行在 service 事务内程序化落行（envelope 单请求单行无法逐项目 resourceId）
projectRoutes.post('/batch-archive', authMiddleware, projectController.batchArchiveProjects);
projectRoutes.post('/:id/archive', authMiddleware, auditMiddleware({ action: 'PROJECT_ARCHIVE', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.archiveProject);
projectRoutes.post('/:id/restore', authMiddleware, auditMiddleware({ action: 'PROJECT_RESTORE', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.restoreProject);
projectRoutes.post('/:id/copy', authMiddleware, auditMiddleware({ action: 'PROJECT_COPY', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.copyProject);
projectRoutes.post('/:id/transfer-ownership', authMiddleware, auditMiddleware({ action: 'PROJECT_TRANSFER', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.transferProjectOwnership);
