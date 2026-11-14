// packages/backend/src/routes/connectionRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { archivedProjectWriteGate } from '../middleware/archivedWriteGate.js';
import * as connectionController from '../controllers/connectionController.js';
import type { MemberRole } from '@remotehub/shared';

export const connectionRoutes: RouterType = Router();

// 批 13b 票 A1：归档项目连接域写禁制（四写端点挂 archivedProjectWriteGate，见 middleware/archivedWriteGate.ts；
// 拦截语义=目标项目 archived → 一律 409 CONN_007，读端点不拦。swagger ERROR_CODE_ENUM 动态生成自
// ERROR_CODES——CONN_007 已入表零枚举同步）

/**
 * @swagger
 * /api/v1/connections:
 *   get:
 *     summary: 连接列表(分页,支持项目/tag 过滤)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: projectId
 *         schema: { type: string }
 *       - in: query
 *         name: tag
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: 名称模糊搜索
 *     responses:
 *       200:
 *         description: 连接分页列表(不含密码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
connectionRoutes.get('/', authMiddleware, connectionController.listConnections);
/**
 * @swagger
 * /api/v1/connections:
 *   post:
 *     summary: 创建连接(editor)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, name, protocol]
 *             properties:
 *               projectId: { type: string, description: 所属项目 }
 *               name: { type: string, description: 项目内唯一名称 }
 *               protocol: { type: string, enum: [ssh, rdp, vnc, telnet, todesk] }
 *               host: { type: string }
 *               port: { type: integer }
 *               username: { type: string }
 *               password: { type: string, description: 明文入参,服务端 AES-256-GCM 加密落库 }
 *               vpnId: { type: string, description: 前置 VPN 连接(可空) }
 *               tags: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: 连接已创建(不含密码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: VPN 依赖循环(CONN_003)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 同项目连接名冲突(CONN_005)或项目已归档(CONN_007)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
connectionRoutes.post('/', authMiddleware, auditMiddleware({ action: 'CONNECTION_CREATE', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), archivedProjectWriteGate('create'), connectionController.createConnection);
/**
 * @swagger
 * /api/v1/connections/{id}:
 *   get:
 *     summary: 连接详情(viewer)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 连接详情(不含密码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 连接不存在(CONN_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
connectionRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), connectionController.getConnection);
/**
 * @swagger
 * /api/v1/connections/{id}:
 *   patch:
 *     summary: 更新连接(editor)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, description: 部分字段更新(名称/主机/端口/凭据/tags/vpnId 等) }
 *     responses:
 *       200:
 *         description: 更新后的连接(不含密码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: VPN 依赖循环(CONN_003)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 连接不存在(CONN_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 名称冲突(CONN_005)、VPN 仍被依赖(CONN_004)或项目已归档(CONN_007，含换项目目标侧与 requiredVpnId 依赖侧)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
connectionRoutes.patch('/:id', authMiddleware, auditMiddleware({ action: 'CONNECTION_UPDATE', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), archivedProjectWriteGate('update'), connectionController.updateConnection);
/**
 * @swagger
 * /api/v1/connections/{id}:
 *   delete:
 *     summary: 删除连接(editor)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 已删除
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 连接不存在(CONN_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: VPN 仍被其他连接依赖(CONN_004)或项目已归档(CONN_007)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
connectionRoutes.delete('/:id', authMiddleware, auditMiddleware({ action: 'CONNECTION_DELETE', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), archivedProjectWriteGate('delete'), connectionController.deleteConnection);
/**
 * @swagger
 * /api/v1/connections/{id}/decrypt-password:
 *   post:
 *     summary: 解密连接密码(editor,审计 CONNECTION_ACCESS)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 解密后的密码
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         password: { type: string }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 连接不存在(CONN_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
connectionRoutes.post('/:id/decrypt-password', authMiddleware, auditMiddleware({ action: 'CONNECTION_ACCESS', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), connectionController.decryptPassword);
// #45 直连三类分派（viewer 门——rdp/命令串/URL 全由 viewer 可见字段构成，不含密码；审计挂 CONNECTION_ACCESS 同 decrypt-password 先例）
/**
 * @swagger
 * /api/v1/connections/{id}/launch:
 *   get:
 *     summary: 一键直连(viewer,三类分派:rdp 指令/命令串/URL)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 直连载荷(协议注册表分派,viewer 可见字段构成,不含密码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 该协议不支持直连(CONN_006)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 连接不存在(CONN_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
connectionRoutes.get('/:id/launch', authMiddleware, auditMiddleware({ action: 'CONNECTION_ACCESS', resource: 'connection' }), projectRoleMiddleware('viewer' as MemberRole), connectionController.launchConnection);
// #43 克隆（写操作 → editor 门同 PATCH/DELETE，非 v1 的 owner-only——票面钦定目标项目写权；
// 审计 CONNECTION_CREATE——克隆即新建，resourceId 取响应体新 id（resolveResourceId 优先 envelope.data.id），
// detail.after 从响应体 clonedFrom 自动留痕）
/**
 * @swagger
 * /api/v1/connections/{id}/clone:
 *   post:
 *     summary: 克隆连接(editor)
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 源连接 ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, description: 新连接名称(默认"原名称 (副本)") }
 *     responses:
 *       201:
 *         description: 克隆成功(返回新连接,clonedFrom 留痕)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 连接不存在(CONN_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 同项目连接名冲突(CONN_005)或项目已归档(CONN_007)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
connectionRoutes.post('/:id/clone', authMiddleware, auditMiddleware({ action: 'CONNECTION_CREATE', resource: 'connection' }), projectRoleMiddleware('editor' as MemberRole), archivedProjectWriteGate('clone'), connectionController.cloneConnection);
