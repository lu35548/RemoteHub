import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth';
import { auditMiddleware } from '@/middleware/audit';
import { validateRequest, body, param, query } from '@/middleware/validation';
import {
  getConnections,
  getConnectionById,
  createConnection,
  updateConnection,
  deleteConnection,
  deleteConnections,
  recordAccess,
  getConnectionStats,
  getSupportedProtocols,
  getConnectionsByTag,
  getRecentlyAccessed,
  cloneConnection,
} from '@/controllers/remoteConnectionController';

const router = Router();

// 应用认证中间件
router.use(authenticateToken);

// 应用审计中间件（记录所有请求）
router.use(auditMiddleware({
  action: 'access' as any,
  entityType: 'api',
  description: 'Remote Connection API Access'
}));

// 验证规则
const createConnectionValidation = [
  body('name')
    .notEmpty()
    .withMessage('连接名称不能为空')
    .isLength({ max: 255 })
    .withMessage('连接名称长度不能超过255个字符'),
  body('protocol')
    .isIn(['rdp', 'ssh', 'vnc', 'http', 'https', 'todesk', 'sunlogin', 'teamviewer', 'anydesk', 'vpn'])
    .withMessage('无效的协议类型'),
  body('host')
    .notEmpty()
    .withMessage('主机地址不能为空')
    .isLength({ max: 255 })
    .withMessage('主机地址长度不能超过255个字符'),
  body('port')
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage('端口号必须在1-65535范围内'),
  body('username')
    .optional()
    .isLength({ max: 100 })
    .withMessage('用户名长度不能超过100个字符'),
  body('password')
    .optional()
    .isLength({ max: 500 })
    .withMessage('密码长度不能超过500个字符'),
  body('projectId')
    .optional()
    .isUUID()
    .withMessage('无效的项目ID'),
  body('vpnType')
    .optional()
    .isIn(['web', 'client', 'openvpn', 'l2tp', 'wireguard'])
    .withMessage('无效的VPN类型'),
  body('vpnLoginUrl')
    .optional()
    .isURL()
    .withMessage('无效的VPN登录URL'),
  body('requiredVpnId')
    .optional()
    .isLength({ max: 100 })
    .withMessage('所需VPN ID长度不能超过100个字符'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('备注长度不能超过1000个字符'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('标签必须是数组'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive必须是布尔值'),
];

const updateConnectionValidation = [
  param('id').isUUID().withMessage('无效的连接ID'),
  body('name')
    .optional()
    .notEmpty()
    .withMessage('连接名称不能为空')
    .isLength({ max: 255 })
    .withMessage('连接名称长度不能超过255个字符'),
  body('host')
    .optional()
    .notEmpty()
    .withMessage('主机地址不能为空')
    .isLength({ max: 255 })
    .withMessage('主机地址长度不能超过255个字符'),
  body('port')
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage('端口号必须在1-65535范围内'),
  body('username')
    .optional()
    .isLength({ max: 100 })
    .withMessage('用户名长度不能超过100个字符'),
  body('vpnType')
    .optional()
    .isIn(['web', 'client', 'openvpn', 'l2tp', 'wireguard'])
    .withMessage('无效的VPN类型'),
  body('vpnLoginUrl')
    .optional()
    .isURL()
    .withMessage('无效的VPN登录URL'),
  body('requiredVpnId')
    .optional()
    .isLength({ max: 100 })
    .withMessage('所需VPN ID长度不能超过100个字符'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('备注长度不能超过1000个字符'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('标签必须是数组'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive必须是布尔值'),
];

const deleteConnectionValidation = [
  param('id').isUUID().withMessage('无效的连接ID'),
];

const getConnectionValidation = [
  param('id').isUUID().withMessage('无效的连接ID'),
];

const queryValidation = [
  query('projectId').optional().isUUID().withMessage('无效的项目ID'),
  query('protocol')
    .optional()
    .isIn(['rdp', 'ssh', 'vnc', 'http', 'https', 'todesk', 'sunlogin', 'teamviewer', 'anydesk', 'vpn'])
    .withMessage('无效的协议类型'),
  query('query')
    .optional()
    .isLength({ max: 255 })
    .withMessage('搜索关键词长度不能超过255个字符'),
  query('tags')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        // 允许逗号分隔的标签字符串
        return true;
      }
      if (Array.isArray(value)) {
        return true;
      }
      return false;
    })
    .withMessage('标签格式不正确'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive必须是布尔值'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('页码必须是大于0的整数'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('每页数量必须是1-100之间的整数'),
];

const tagValidation = [
  param('tag')
    .notEmpty()
    .withMessage('标签不能为空')
    .isLength({ max: 50 })
    .withMessage('标签长度不能超过50个字符'),
];

const cloneConnectionValidation = [
  param('id').isUUID().withMessage('无效的连接ID'),
  body('name')
    .optional()
    .isLength({ max: 255 })
    .withMessage('连接名称长度不能超过255个字符'),
];

const bulkDeleteValidation = [
  body('connectionIds')
    .isArray({ min: 1 })
    .withMessage('连接ID列表不能为空'),
  body('connectionIds.*')
    .isUUID()
    .withMessage('连接ID格式不正确'),
];

// 路由定义

/**
 * @route GET /api/v1/remote-connections
 * @desc 获取用户的远程连接列表
 * @access Private
 */
router.get('/', validateRequest(queryValidation), getConnections);

/**
 * @route GET /api/v1/remote-connections/stats
 * @desc 获取用户的连接统计
 * @access Private
 */
router.get('/stats', getConnectionStats);

/**
 * @route GET /api/v1/remote-connections/protocols
 * @desc 获取支持的协议类型
 * @access Private
 */
router.get('/protocols', getSupportedProtocols);

/**
 * @route GET /api/v1/remote-connections/recent
 * @desc 获取最近访问的连接
 * @access Private
 */
router.get('/recent', getRecentlyAccessed);

/**
 * @route GET /api/v1/remote-connections/by-tag/:tag
 * @desc 根据标签查找连接
 * @access Private
 */
router.get('/by-tag/:tag', validateRequest(tagValidation), getConnectionsByTag);

/**
 * @route GET /api/v1/remote-connections/:id
 * @desc 根据ID获取远程连接
 * @access Private
 */
router.get('/:id', validateRequest(getConnectionValidation), getConnectionById);

/**
 * @route POST /api/v1/remote-connections
 * @desc 创建新的远程连接
 * @access Private
 */
router.post('/', validateRequest(createConnectionValidation), createConnection);

/**
 * @route PUT /api/v1/remote-connections/:id
 * @desc 更新远程连接
 * @access Private
 */
router.put('/:id', validateRequest(updateConnectionValidation), updateConnection);

/**
 * @route DELETE /api/v1/remote-connections/:id
 * @desc 删除远程连接
 * @access Private
 */
router.delete('/:id', validateRequest(deleteConnectionValidation), deleteConnection);

/**
 * @route POST /api/v1/remote-connections/bulk-delete
 * @desc 批量删除远程连接
 * @access Private
 */
router.post('/bulk-delete', validateRequest(bulkDeleteValidation), deleteConnections);

/**
 * @route POST /api/v1/remote-connections/:id/access
 * @desc 记录连接访问
 * @access Private
 */
router.post('/:id/access', validateRequest(getConnectionValidation), recordAccess);

/**
 * @route POST /api/v1/remote-connections/:id/clone
 * @desc 克隆连接
 * @access Private
 */
router.post('/:id/clone', validateRequest(cloneConnectionValidation), cloneConnection);

export default router;