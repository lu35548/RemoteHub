import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getProjectMembers,
  inviteMember,
  batchInviteMembers,
  acceptInvitation,
  rejectInvitation,
  updateMemberRole,
  removeMember,
  updateMemberPermissions,
  getUserMembership,
  leaveProject,
  transferOwnership,
  getProjectMemberStats,
  searchUsersForInvitation,
} from '../controllers/projectMemberController';

const router = Router();

// 所有项目成员路由都需要认证
router.use(authenticateToken);

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

export default router;