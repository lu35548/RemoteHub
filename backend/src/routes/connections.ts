import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getConnections,
  createConnection,
  getConnectionById,
  updateConnection,
  deleteConnection,
  testConnection,
  cloneConnection,
  testMultipleConnections,
  getConnectionStats,
  getConnectionProjects,
  exportConnection,
  getConnectionTypes,
  getConnectionCategories,
} from '../controllers/connectionController';

const router = Router();

// 所有连接路由都需要认证
router.use(authenticateToken);

/**
 * @swagger
 * /api/v1/connections:
 *   get:
 *     summary: 获取用户可访问的连接列表
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [mysql, postgresql, sqlite, sqlserver, oracle, mongodb, redis]
 *         description: 连接类型
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, error]
 *         description: 连接状态
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [development, staging, production, testing, backup]
 *         description: 连接类别
 *       - in: query
 *         name: securityLevel
 *         schema:
 *           type: string
 *           enum: [none, ssl, ssh, vpn]
 *         description: 安全级别
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: 标签（逗号分隔）
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: 项目ID（获取项目关联的连接）
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, type, status, createdAt, updatedAt, lastTestedAt]
 *           default: updatedAt
 *         description: 排序字段
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: 排序方向
 *       - in: query
 *         name: includeTests
 *         schema:
 *           type: boolean
 *           default: false
 *         description: 是否包含测试详细信息
 *     responses:
 *       200:
 *         description: 成功返回连接列表
 *       401:
 *         description: 未认证
 */
router.get('/', getConnections);

/**
 * @swagger
 * /api/v1/connections/stats:
 *   get:
 *     summary: 获取连接统计信息
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回统计信息
 *       401:
 *         description: 未认证
 */
router.get('/stats', getConnectionStats);

/**
 * @swagger
 * /api/v1/connections/types:
 *   get:
 *     summary: 获取支持的连接类型列表
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回连接类型列表
 *       401:
 *         description: 未认证
 */
router.get('/types', getConnectionTypes);

/**
 * @swagger
 * /api/v1/connections/categories:
 *   get:
 *     summary: 获取连接类别列表
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回连接类别列表
 *       401:
 *         description: 未认证
 */
router.get('/categories', getConnectionCategories);

/**
 * @swagger
 * /api/v1/connections/test/batch:
 *   post:
 *     summary: 批量测试连接
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeout
 *         schema:
 *           type: integer
 *           default: 30000
 *         description: 测试超时时间（毫秒）
 *       - in: query
 *         name: retryCount
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 重试次数
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 连接ID列表
 *                 maxItems: 10
 *     responses:
 *       200:
 *         description: 测试完成
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未认证
 */
router.post('/test/batch', testMultipleConnections);

/**
 * @swagger
 * /api/v1/connections:
 *   post:
 *     summary: 创建新连接
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: 连接名称
 *               description:
 *                 type: string
 *                 description: 连接描述
 *               type:
 *                 type: string
 *                 enum: [mysql, postgresql, sqlite, sqlserver, oracle, mongodb, redis]
 *                 description: 连接类型
 *               category:
 *                 type: string
 *                 enum: [development, staging, production, testing, backup]
 *                 default: development
 *                 description: 连接类别
 *               host:
 *                 type: string
 *                 description: 主机地址
 *               port:
 *                 type: integer
 *                 description: 端口号
 *               database:
 *                 type: string
 *                 description: 数据库名
 *               username:
 *                 type: string
 *                 description: 用户名
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 密码
 *               connectionString:
 *                 type: string
 *                 description: 完整连接字符串
 *               sslConfig:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   ca:
 *                     type: string
 *                   cert:
 *                     type: string
 *                   key:
 *                     type: string
*                   rejectUnauthorized:
*                     type: boolean
*                   checkServerIdentity:
*                     type: boolean
*               sshConfig:
*                 type: object
*                 properties:
*                   enabled:
*                     type: boolean
*                   host:
*                     type: string
*                   port:
*                     type: integer
*                   username:
*                     type: string
*                   password:
*                     type: string
*                     format: password
*                   privateKey:
*                     type: string
*                     format: password
*                   passphrase:
*                     type: string
*                     format: password
*               connectionParams:
*                 type: object
*                 description: 额外的连接参数
*               tags:
*                 type: array
*                 items:
*                   type: string
*                 description: 连接标签
*               metadata:
*                 type: object
*                 description: 连接元数据
*     responses:
*       201:
*         description: 创建成功
*       400:
*         description: 请求参数错误
*       401:
*         description: 未认证
*       409:
*         description: 连接名称已存在
*/
router.post('/', createConnection);

/**
* @swagger
* /api/v1/connections/{id}:
*   get:
*     summary: 获取连接详情
*     tags: [Connections]
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
*         description: 成功返回连接详情
*       401:
*         description: 未认证
*       404:
*         description: 连接不存在或无权限访问
*/
router.get('/:id', getConnectionById);

/**
* @swagger
* /api/v1/connections/{id}:
*   put:
*     summary: 更新连接
*     tags: [Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
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
*               name:
*                 type: string
*                 minLength: 1
*                 maxLength: 255
*               description:
*                 type: string
*               category:
*                 type: string
*                 enum: [development, staging, production, testing, backup]
*               host:
*                 type: string
*               port:
*                 type: integer
*               database:
*                 type: string
*               username:
*                 type: string
*               password:
*                 type: string
*                 format: password
*               connectionString:
*                 type: string
*               sslConfig:
*                 type: object
*               sshConfig:
*                 type: object
*               connectionParams:
*                 type: object
*               tags:
*                 type: array
*                 items:
*                   type: string
*               metadata:
*                 type: object
*     responses:
*       200:
*         description: 更新成功
*       401:
*         description: 未认证
*       403:
*         description: 无权限修改连接
*       404:
*         description: 连接不存在
*       409:
*         description: 连接名称已存在
*/
router.put('/:id', updateConnection);

/**
* @swagger
* /api/v1/connections/{id}:
*   delete:
*     summary: 删除连接
*     tags: [Connections]
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
*         description: 删除成功
*       401:
*         description: 未认证
*       403:
*         description: 无权限删除连接
*       404:
*         description: 连接不存在
*/
router.delete('/:id', deleteConnection);

/**
* @swagger
* /api/v1/connections/{id}/test:
*   post:
*     summary: 测试连接
*     tags: [Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
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
*         description: 连接不存在
*/
router.post('/:id/test', testConnection);

/**
* @swagger
* /api/v1/connections/{id}/clone:
*   post:
*     summary: 克隆连接
*     tags: [Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 源连接ID
*     requestBody:
*       required: false
*       content:
*         application/json:
*           schema:
*             type: object
*             properties:
*               name:
*                 type: string
*                 description: 新连接名称（默认为"原连接名 (副本)"）
*     responses:
*       201:
*         description: 克隆成功
*       401:
*         description: 未认证
*       403:
*         description: 无权限克隆连接
*       404:
*         description: 连接不存在
*/
router.post('/:id/clone', cloneConnection);

/**
* @swagger
* /api/v1/connections/{id}/export:
*   get:
*     summary: 导出连接配置
*     tags: [Connections]
*     security:
*       - bearerAuth: []
*     parameters:
*       - in: path
*         name: id
*         required: true
*         schema:
*           type: string
*         description: 连接ID
*       - in: query
*         name: format
*         schema:
*           type: string
*           enum: [json, yaml, xml]
*           default: json
*         description: 导出格式
*     responses:
*       200:
*         description: 导出成功
*       401:
*         description: 未认证
*       403:
*         description: 无权限导出连接
*       404:
*         description: 连接不存在
*/
router.get('/:id/export', exportConnection);

/**
* @swagger
* /api/v1/connections/{id}/projects:
*   get:
*     summary: 获取连接关联的项目列表
*     tags: [Connections]
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
router.get('/:id/projects', getConnectionProjects);

export default router;