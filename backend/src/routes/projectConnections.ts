import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getProjectConnections,
  addConnectionToProject,
  batchAddConnections,
  updateProjectConnection,
  removeConnectionFromProject,
  testProjectConnection,
  batchTestProjectConnections,
  updateConnectionPermissions,
  getConnectionProjects,
  getProjectConnectionStats,
  exportProjectConnections,
  getAvailableConnections,
} from '../controllers/projectConnectionController';

const router = Router();

// 所有项目连接路由都需要认证
router.use(authenticateToken);

/**
 * @swagger
 * /api/v1/projects/{id}/connections:
 *   get:
 *     summary: 获取项目连接列表
 *     tags: [Project Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 项目ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
*         description: 每页数量
*       - in: query
*         name: status
*         schema:
*           type: string
*           enum: [active, inactive]
*         description: 关联状态
*       - in: query
*         name: category
*         schema:
*           type: string
*         description: 连接类别
*       - in: query
*         name: search
*         schema:
*           type: string
*         description: 搜索关键词
*       - in: query
*         name: sortBy
*         schema:
*           type: string
*           enum: [name, type, addedAt, lastTestedAt, testStatus]
*           default: addedAt
*         description: 排序字段
*       - in: query
*         name: sortOrder
*         schema:
*           type: string
*           enum: [ASC, DESC]
*           default: DESC
*         description: 排序方向
*     responses:
*       200:
*         description: 成功返回连接列表
*       401:
*         description: 未认证
*       403:
*         description: 无权限访问项目
*/
router.get('/:id/connections', getProjectConnections);

/**
* @swagger
* /api/v1/projects/{id}/connections/stats:
*   get:
*     summary: 获取项目连接统计
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*     responses:
*       200:
*         description: 成功返回统计信息
*       401:
*         description: 未认证
*       403:
*         description: 无权限访问项目
*/
router.get('/:id/connections/stats', getProjectConnectionStats);

/**
* @swagger
* /api/v1/projects/{id}/connections/available:
*   get:
*     summary: 获取可添加到项目的连接列表
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*       - in: query
*         name: search
*         schema:
*           type: string
*         description: 搜索关键词
*       - in: query
*         name: type
*         schema:
*           type: string
*           enum: [mysql, postgresql, sqlite, sqlserver, oracle, mongodb, redis]
*         description: 连接类型
*       - in: query
*         name: limit
*         schema:
*           type: integer
*           default: 50
*         description: 返回数量限制
*     responses:
*       200:
*         description: 成功返回可添加的连接列表
*       401:
*         description: 未认证
*       403:
*         description: 无权限管理项目连接
*       404:
*         description: 项目不存在
*/
router.get('/:id/connections/available', getAvailableConnections);

/**
* @swagger
* /api/v1/projects/{id}/connections/export:
*   get:
*     summary: 导出项目连接列表
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*       - in: query
*         name: format
*         schema:
*           type: string
*           enum: [json, csv, excel]
*           default: json
*         description: 导出格式
*       - in: query
*         name: includeCredentials
*         schema:
*           type: string
*           enum: [true, false]
*           default: false
*         description: 是否包含凭证信息
*     responses:
*       200:
*         description: 导出成功
*       401:
*         description: 未认证
*       403:
*         description: 无权限导出项目连接
*/
router.get('/:id/connections/export', exportProjectConnections);

/**
* @swagger
* /api/v1/projects/{id}/connections:
*   post:
*     summary: 添加连接到项目
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*     requestBody:
*       required: true
*       content:
*         application/json:
*           schema:
*             type: object
*             required:
*               - connectionId
*             properties:
*               connectionId:
*                 type: string
*                 description: 连接ID
*               alias:
*                 type: string
*                 description: 连接别名
*               description:
*                 type: string
*                 description: 连接描述
*               category:
*                 type: string
*                 description: 连接类别
*               permissions:
*                 type: object
*                 properties:
*                   canView:
*                     type: boolean
*                   canEdit:
*                     type: boolean
*                   canDelete:
*                     type: boolean
*                   canTest:
*                     type: boolean
*                   canExport:
*                     type: boolean
*               tags:
*                 type: array
*                 items:
*                   type: string
*                 description: 连接标签
*     responses:
*       201:
*         description: 连接已添加到项目
*       400:
*         description: 请求参数错误
*       401:
*         description: 未认证
*       403:
*         description: 无权限添加连接
*       404:
*         description: 项目或连接不存在
*       409:
*         description: 连接已在项目中
*/
router.post('/:id/connections', addConnectionToProject);

/**
* @swagger
* /api/v1/projects/{id}/connections/batch:
*   post:
*     summary: 批量添加连接到项目
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*     requestBody:
*       required: true
*       content:
*         application/json:
*           schema:
*             type: object
*             required:
*               - connectionIds
*             properties:
*               connectionIds:
*                 type: array
*                 items:
*                   type: string
*                 description: 连接ID列表
*                 maxItems: 100
*               defaultSettings:
*                 type: object
*                 description: 默认设置
*     responses:
*       200:
*         description: 批量添加完成
*       400:
*         description: 请求参数错误
*       401:
*         description: 未认证
*       403:
*         description: 无权限添加连接
*       404:
*         description: 项目不存在
*/
router.post('/:id/connections/batch', batchAddConnections);

/**
* @swagger
* /api/v1/projects/{id}/connections/batch-test:
*   post:
*     summary: 批量测试项目连接
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*     requestBody:
*       required: true
*       content:
*         application/json:
*           schema:
*             type: object
*             required:
*               - connectionIds
*             properties:
*               connectionIds:
*                 type: array
*                 items:
*                   type: string
*                 description: 连接ID列表
*                 maxItems: 10
*               timeout:
*                 type: integer
*                 default: 30000
*                 description: 测试超时时间（毫秒）
*               retryCount:
*                 type: integer
*                 default: 1
*                 description: 重试次数
*     responses:
*       200:
*         description: 批量测试完成
*       400:
*         description: 请求参数错误
*       401:
*         description: 未认证
*       403:
*         description: 无权限测试连接
*       404:
*         description: 项目不存在
*/
router.post('/:id/connections/batch-test', batchTestProjectConnections);

/**
* @swagger
* /api/v1/projects/{id}/connections/{connectionId}:
*   put:
*     summary: 更新项目连接关联
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*       - in: path
*         name: connectionId
*         required: true
*         schema:
*           type: string
*         description: 连接ID
*     requestBody:
*       required: true
*       content:
*         application/json:
*           schema:
*             type: object
*             properties:
*               alias:
*                 type: string
*                 description: 连接别名
*               description:
*                 type: string
*                 description: 连接描述
*               category:
*                 type: string
*                 description: 连接类别
*               permissions:
*                 type: object
*               tags:
*                 type: array
*                 items:
*                   type: string
*     responses:
*       200:
*         description: 更新成功
*       400:
*         description: 请求参数错误
*       401:
*         description: 未认证
*       403:
*         description: 无权限修改连接关联
*       404:
*         description: 项目或连接关联不存在
*/
router.put('/:id/connections/:connectionId', updateProjectConnection);

/**
* @swagger
* /api/v1/projects/{id}/connections/{connectionId}:
*   delete:
*     summary: 从项目移除连接
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*       - in: path
*         name: connectionId
*         required: true
*         schema:
*           type: string
*         description: 连接ID
*     responses:
*       200:
*         description: 连接已从项目移除
*       401:
*         description: 未认证
*       403:
*         description: 无权限移除连接
*       404:
*         description: 项目或连接关联不存在
*/
router.delete('/:id/connections/:connectionId', removeConnectionFromProject);

/**
* @swagger
* /api/v1/projects/{id}/connections/{connectionId}/test:
*   post:
*     summary: 测试项目连接
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*       - in: path
*         name: connectionId
*         required: true
*         schema:
*           type: string
*         description: 连接ID
*     requestBody:
*       required: false
*       content:
*         application/json:
*           schema:
*             type: object
*             properties:
*               timeout:
*                 type: integer
*                 default: 30000
*                 description: 测试超时时间（毫秒）
*               retryCount:
*                 type: integer
*                 default: 1
*                 description: 重试次数
*     responses:
*       200:
*         description: 测试完成
*       401:
*         description: 未认证
*       403:
*         description: 无权限测试连接
*       404:
*         description: 项目或连接关联不存在
*/
router.post('/:id/connections/:connectionId/test', testProjectConnection);

/**
* @swagger
* /api/v1/projects/{id}/connections/{connectionId}/permissions:
*   put:
*     summary: 更新连接权限
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 项目ID
*       - in: path
*         name: connectionId
*         required: true
*         schema:
*           type: string
*         description: 连接ID
*     requestBody:
*       required: true
*       content:
*         application/json:
*           schema:
*             type: object
*             properties:
*               canView:
*                 type: boolean
*               canEdit:
*                 type: boolean
*               canDelete:
*                 type: boolean
*               canTest:
*                 type: boolean
*               canExport:
*                 type: boolean
*     responses:
*       200:
*         description: 权限更新成功
*       400:
*         description: 请求参数错误
*       401:
*         description: 未认证
*       403:
*         description: 无权限修改连接权限
*       404:
*         description: 项目或连接关联不存在
*/
router.put('/:id/connections/:connectionId/permissions', updateConnectionPermissions);

/**
* @swagger
* /api/v1/connections/{id}/projects:
*   get:
*     summary: 获取连接关联的项目列表
*     tags: [Project Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 连接ID
*     responses:
*       200:
*         description: 成功返回项目列表
*       401:
*         description: 未认证
*       404:
*         description: 连接不存在
*/
router.get('/connections/:id/projects', getConnectionProjects);

export default router;