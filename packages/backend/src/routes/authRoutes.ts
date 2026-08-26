// packages/backend/src/routes/authRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as authController from '../controllers/authController.js';

export const authRoutes: RouterType = Router();

// 速率限制已在 server.ts 全局注册，此处不再重复

authRoutes.post('/login', authController.login);
authRoutes.post('/register', authMiddleware, roleMiddleware('admin'), authController.register);
authRoutes.post('/refresh', authController.refresh);
authRoutes.post('/logout', authMiddleware, authController.logout);
authRoutes.get('/me', authMiddleware, authController.me);
authRoutes.post('/change-password', authMiddleware, authController.changePassword);
authRoutes.patch('/profile', authMiddleware, authController.updateProfile);
authRoutes.post('/heartbeat', authMiddleware, authController.heartbeat);
authRoutes.get('/online', authMiddleware, authController.getOnlineUsers);
