// packages/backend/src/routes/userRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as userController from '../controllers/userController.js';

export const userRoutes: RouterType = Router();

userRoutes.get('/', authMiddleware, roleMiddleware('admin'), userController.listUsers);
userRoutes.get('/search', authMiddleware, userController.searchUsers);
userRoutes.get('/:id', authMiddleware, roleMiddleware('admin'), userController.getUser);
userRoutes.patch('/:id', authMiddleware, auditMiddleware({ action: 'USER_UPDATE', resource: 'user' }), roleMiddleware('admin'), userController.updateUser);
userRoutes.delete('/:id', authMiddleware, auditMiddleware({ action: 'USER_DELETE', resource: 'user' }), roleMiddleware('admin'), userController.deleteUser);
