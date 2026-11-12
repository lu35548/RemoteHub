// packages/backend/src/routes/adminRoutes.ts
// 票 #50 数据导入导出路由(/api/v1/admin/export|import):admin 门禁。
// 审计不挂 auditMiddleware,由 controller 程序化落行(SYSTEM_BACKUP / SYSTEM_RESTORE,成败皆记)——
// export 响应体为全量导出 JSON,envelope 通道会把密文本体塞进审计 detail(见 adminDataService 注释)。
// 已知代价:401/403 权限拒绝不落审计行(读端点同口径;backupRoutes 的 403 留痕由 middleware 通道提供,
// 本端点因响应体形状放弃该通道,裁量已记录)。import 403 不留痕是已知代价(与 export 统一程序化
// 通道;backupRoutes POST 经 middleware 有留痕,同域行为不一致已知情——review F4 补记)。
// /import 的大 body 由 server.ts 在全局 parser 前预挂的 50mb 专属 parser 承接(body-parser 2.2.2
// 以 onFinished.isFinished(req) 判 body 流已消费而短路跳过,路由级后挂大 limit 永不生效;
// 「req._body」是 body-parser 1.x 机制,2.x 已移除——review F8 机制名修正,行为结论不变)。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as adminDataController from '../controllers/adminDataController.js';

export const adminRoutes: RouterType = Router();

/**
 * @swagger
 * /api/v1/admin/export:
 *   post:
 *     summary: 全量数据导出 JSON(admin,同 ENCRYPTION_KEY 迁移用)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 全量导出(projects/connections/members/users 不含密码哈希;含 encryptionKeyFingerprint;密文字段原样搬运)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
adminRoutes.post('/export', authMiddleware, roleMiddleware('admin'), adminDataController.exportData);
/**
 * @swagger
 * /api/v1/admin/import:
 *   post:
 *     summary: 全量数据导入(事务 upsert,admin)
 *     description: 需先校验导出文件 encryptionKeyFingerprint 与当前 ENCRYPTION_KEY 一致;专属 50mb parser,超限 413。
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: /export 响应体的全量数据(含 encryptionKeyFingerprint)
 *     responses:
 *       200:
 *         description: 导入完成(返回 upsert 统计)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       413:
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       422:
 *         description: 指纹不匹配/载荷非法(VAL_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRoutes.post('/import', authMiddleware, roleMiddleware('admin'), adminDataController.importData);
