// packages/backend/src/routes/memberRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as memberController from '../controllers/memberController.js';
import type { MemberRole } from '@remotehub/shared';

// 注意：这些路由将作为子路由挂载到 /projects/:id/members
export const memberRoutes: RouterType = Router({ mergeParams: true });

memberRoutes.get('/', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), memberController.listMembers);
memberRoutes.post('/', authMiddleware, auditMiddleware({ action: 'MEMBER_ADD', resource: 'member' }), projectRoleMiddleware('owner' as MemberRole), memberController.addMember);
memberRoutes.patch('/:uid', authMiddleware, auditMiddleware({ action: 'MEMBER_UPDATE', resource: 'member' }), projectRoleMiddleware('owner' as MemberRole), memberController.updateRole);
memberRoutes.delete('/:uid', authMiddleware, auditMiddleware({ action: 'MEMBER_REMOVE', resource: 'member' }), projectRoleMiddleware('viewer' as MemberRole), memberController.removeMember);
