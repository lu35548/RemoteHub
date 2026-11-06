// packages/backend/src/routes/adminRoutes.ts
// 票 #50 数据导入导出路由(/api/v1/admin/export|import):admin 门禁。
// 审计不挂 auditMiddleware,由 controller 程序化落行(SYSTEM_BACKUP / SYSTEM_RESTORE,成败皆记)——
// export 响应体为全量导出 JSON,envelope 通道会把密文本体塞进审计 detail(见 adminDataService 注释)。
// 已知代价:401/403 权限拒绝不落审计行(读端点同口径;backupRoutes 的 403 留痕由 middleware 通道提供,
// 本端点因响应体形状放弃该通道,裁量已记录)。/import 的大 body 由 server.ts 在全局 parser 前
// 预挂的 50mb 专属 parser 承接(body-parser 对已解析 body 短路,路由级后挂大 limit 永不生效)。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as adminDataController from '../controllers/adminDataController.js';

export const adminRoutes: RouterType = Router();

adminRoutes.post('/export', authMiddleware, roleMiddleware('admin'), adminDataController.exportData);
adminRoutes.post('/import', authMiddleware, roleMiddleware('admin'), adminDataController.importData);
