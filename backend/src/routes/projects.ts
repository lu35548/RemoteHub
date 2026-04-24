import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectStats,
  duplicateProject,
  archiveProject,
  activateProject,
  updateProjectSettings,
  getUserRoleInProject,
} from '../controllers/projectController';
import {
  getProjectMembers,
  inviteMember,
  batchInviteMembers,
  updateMemberRole,
  removeMember,
  updateMemberPermissions,
  getUserMembership,
  leaveProject,
  transferOwnership,
  getProjectMemberStats,
  searchUsersForInvitation,
  acceptInvitation,
  rejectInvitation,
} from '../controllers/projectMemberController';
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

// 所有项目路由都需要认证
router.use(authenticateToken);

/**
 * @swagger
 * /api/v1/projects:
 *   get:
 *     summary: 获取用户可访问的项目列表
 *     tags: [Projects]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, archived, completed]
 *         description: 项目状态
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [public, private]
 *         description: 项目可见性
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: 项目优先级
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: 标签（逗号分隔）
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, createdAt, updatedAt, status]
 *           default: updatedAt
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
 *         description: 成功返回项目列表
 *       401:
 *         description: 未认证
 */
router.get('/', getProjects);

/**
 * @swagger
 * /api/v1/projects/stats:
 *   get:
 *     summary: 获取用户项目统计信息
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回统计信息
 *       401:
 *         description: 未认证
 */
router.get('/stats', getProjectStats);

/**
 * @swagger
 * /api/v1/projects:
 *   post:
 *     summary: 创建新项目
 *     tags: [Projects]
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
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: 项目名称
 *               description:
 *                 type: string
 *                 description: 项目描述
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *                 default: private
 *                 description: 项目可见性
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *                 description: 项目优先级
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 项目标签
 *               settings:
 *                 type: object
 *                 description: 项目设置
 *               metadata:
 *                 type: object
 *                 description: 项目元数据
 *     responses:
 *       201:
 *         description: 创建成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未认证
 *       409:
 *         description: 项目名称已存在
 */
router.post('/', createProject);

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   get:
 *     summary: 获取项目详情
 *     tags: [Projects]
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
 *         description: 成功返回项目详情
 *       401:
 *         description: 未认证
 *       404:
 *         description: 项目不存在或无权限访问
 */
router.get('/:id', getProjectById);

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   put:
 *     summary: 更新项目信息
 *     tags: [Projects]
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
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               description:
 *                 type: string
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               status:
 *                 type: string
 *                 enum: [draft, active, archived, completed]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               settings:
 *                 type: object
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限编辑项目
 *       404:
 *         description: 项目不存在
 *       409:
 *         description: 项目名称已存在
 */
router.put('/:id', updateProject);

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   delete:
 *     summary: 删除项目
 *     tags: [Projects]
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
 *         description: 删除成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限删除项目
 *       404:
 *         description: 项目不存在
 */
router.delete('/:id', deleteProject);

/**
 * @swagger
 * /api/v1/projects/{id}/duplicate:
 *   post:
 *     summary: 复制项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 源项目ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 新项目名称（默认为"原项目名 (副本)"）
 *     responses:
 *       201:
 *         description: 复制成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限编辑项目
 *       404:
 *         description: 项目不存在
 */
router.post('/:id/duplicate', duplicateProject);

/**
 * @swagger
 * /api/v1/projects/{id}/archive:
 *   put:
 *     summary: 归档项目
 *     tags: [Projects]
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
 *         description: 归档成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限编辑项目
 *       404:
 *         description: 项目不存在
 */
router.put('/:id/archive', archiveProject);

/**
 * @swagger
 * /api/v1/projects/{id}/activate:
 *   put:
 *     summary: 激活项目
 *     tags: [Projects]
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
 *         description: 激活成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限编辑项目
 *       404:
 *         description: 项目不存在
 */
router.put('/:id/activate', activateProject);

/**
 * @swagger
 * /api/v1/projects/{id}/settings:
 *   put:
 *     summary: 更新项目设置
 *     tags: [Projects]
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
 *             properties:
 *               settings:
 *                 type: object
 *                 properties:
 *                   allowMemberInvitation:
 *                     type: boolean
 *                   requireApprovalForJoin:
 *                     type: boolean
 *                   maxMembers:
 *                     type: integer
 *                   defaultMemberRole:
 *                     type: string
 *                   features:
 *                     type: object
 *                   notifications:
 *                     type: object
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限编辑项目
 *       404:
 *         description: 项目不存在
 */
router.put('/:id/settings', updateProjectSettings);

// 项目成员路由
/**
 * @swagger
 * /api/v1/projects/{id}/members:
 *   get:
 *     summary: 获取项目成员列表
 *     tags: [Project Members]
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
 *         name: role
 *         schema:
 *           type: string
 *           enum: [owner, admin, editor, viewer]
 *         description: 成员角色
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, pending, inactive, banned]
 *         description: 成员状态
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, email, role, joinedAt, lastAccessAt]
 *           default: joinedAt
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
 *         description: 成功返回成员列表
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限访问项目
 */
router.get('/:id/members', getProjectMembers);

/**
 * @swagger
 * /api/v1/projects/{id}/members/stats:
 *   get:
 *     summary: 获取项目成员统计
 *     tags: [Project Members]
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
router.get('/:id/members/stats', getProjectMemberStats);

/**
 * @swagger
 * /api/v1/projects/{id}/members/search:
 *   get:
 *     summary: 搜索用户（用于邀请）
 *     tags: [Project Members]
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
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: 返回数量限制
 *     responses:
 *       200:
 *         description: 搜索成功
 *       400:
 *         description: 缺少搜索关键词
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限邀请成员
 *       404:
 *         description: 项目不存在
 */
router.get('/:id/members/search', searchUsersForInvitation);

/**
 * @swagger
 * /api/v1/projects/{id}/members:
 *   post:
 *     summary: 邀请成员加入项目
 *     tags: [Project Members]
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: 被邀请用户ID
 *               role:
 *                 type: string
 *                 enum: [owner, admin, editor, viewer]
 *                 default: viewer
 *                 description: 初始角色
 *               message:
 *                 type: string
 *                 description: 邀请消息
 *     responses:
 *       201:
 *         description: 邀请已发送
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限邀请成员
 *       404:
 *         description: 项目或用户不存在
 *       409:
 *         description: 用户已经是成员或已被邀请
 */
router.post('/:id/members', inviteMember);

/**
 * @swagger
 * /api/v1/projects/{id}/members/batch:
 *   post:
 *     summary: 批量邀请成员
 *     tags: [Project Members]
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
 *               - invitations
 *             properties:
 *               invitations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - userId
 *                   properties:
 *                     userId:
 *                       type: string
 *                       description: 用户ID
 *                     role:
 *                       type: string
 *                       enum: [owner, admin, editor, viewer]
 *                       default: viewer
 *                       description: 角色
 *                 maxItems: 50
 *                 description: 邀请列表
 *     responses:
 *       200:
 *         description: 批量邀请完成
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限邀请成员
 *       404:
 *         description: 项目不存在
 */
router.post('/:id/members/batch', batchInviteMembers);

/**
 * @swagger
 * /api/v1/projects/{id}/members/{memberId}:
 *   put:
 *     summary: 更新成员角色
 *     tags: [Project Members]
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
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: 成员ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [owner, admin, editor, viewer]
 *                 description: 新角色
 *     responses:
 *       200:
 *         description: 角色更新成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限修改成员角色
 *       404:
 *         description: 项目或成员不存在
 */
router.put('/:id/members/:memberId', updateMemberRole);

/**
 * @swagger
 * /api/v1/projects/{id}/members/{memberId}:
 *   delete:
 *     summary: 移除项目成员
 *     tags: [Project Members]
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
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: 成员ID
 *     responses:
 *       200:
 *         description: 成员已移除
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限移除成员
 *       404:
 *         description: 项目或成员不存在
 */
router.delete('/:id/members/:memberId', removeMember);

/**
 * @swagger
 * /api/v1/projects/{id}/members/{memberId}/permissions:
 *   put:
 *     summary: 更新成员权限
 *     tags: [Project Members]
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
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: 成员ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               canManageMembers:
 *                 type: boolean
 *                 description: 是否可以管理成员
 *               canManageConnections:
 *                 type: boolean
 *                 description: 是否可以管理连接
 *               canManageSettings:
 *                 type: boolean
 *                 description: 是否可以管理设置
 *               canInviteMembers:
 *                 type: boolean
 *                 description: 是否可以邀请成员
 *               customPermissions:
 *                 type: object
 *                 additionalProperties: true
 *                 description: 自定义权限
 *     responses:
 *       200:
 *         description: 权限更新成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限修改成员权限
 *       404:
 *         description: 项目或成员不存在
 */
router.put('/:id/members/:memberId/permissions', updateMemberPermissions);

/**
 * @swagger
 * /api/v1/projects/{id}/membership:
 *   get:
 *     summary: 获取用户在项目中的信息
 *     tags: [Project Members]
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
 *         description: 成功返回成员信息
 *       401:
 *         description: 未认证
 */
router.get('/:id/membership', getUserMembership);

/**
 * @swagger
 * /api/v1/projects/{id}/leave:
 *   post:
 *     summary: 离开项目
 *     tags: [Project Members]
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
 *         description: 已离开项目
 *       401:
 *         description: 未认证
 *       403:
 *         description: 项目所有者不能直接离开
 *       404:
 *         description: 项目不存在或不是成员
 */
router.post('/:id/leave', leaveProject);

/**
 * @swagger
 * /api/v1/projects/{id}/transfer-ownership:
 *   put:
 *     summary: 转让项目所有权
 *     tags: [Project Members]
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
 *               - newOwnerId
 *             properties:
 *               newOwnerId:
 *                 type: string
 *                 description: 新所有者用户ID
 *     responses:
 *       200:
 *         description: 所有权转让成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未认证
 *       403:
 *         description: 只有项目所有者可以转让所有权
 *       404:
 *         description: 项目或新所有者不存在
 *       409:
 *         description: 新所有者必须是项目成员
 */
router.put('/:id/transfer-ownership', transferOwnership);

/**
 * @swagger
 * /api/v1/projects/{id}/role:
 *   get:
 *     summary: 获取用户在项目中的角色
 *     tags: [Projects]
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
 *         description: 成功返回用户角色
 *       401:
 *         description: 未认证
 */
router.get('/:id/role', getUserRoleInProject);

// 项目连接路由
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

// 邀请相关路由（不需要项目ID前缀）
/**
 * @swagger
 * /api/v1/invitations/{token}/accept:
 *   post:
 *     summary: 接受项目邀请
 *     tags: [Project Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: 邀请令牌
 *     responses:
 *       200:
 *         description: 已成功加入项目
 *       401:
 *         description: 未认证
 *       404:
 *         description: 邀请不存在或已失效
 *       403:
 *         description: 邀请不适用于当前用户
 */
router.post('/invitations/:token/accept', acceptInvitation);

/**
 * @swagger
 * /api/v1/invitations/{token}/reject:
 *   post:
 *     summary: 拒绝项目邀请
 *     tags: [Project Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: 邀请令牌
 *     responses:
 *       200:
 *         description: 已拒绝邀请
 *       401:
 *         description: 未认证
 *       404:
 *         description: 邀请不存在或已失效
 *       403:
 *         description: 无权限操作此邀请
 */
router.post('/invitations/:token/reject', rejectInvitation);

// 连接项目关联的逆向查找
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