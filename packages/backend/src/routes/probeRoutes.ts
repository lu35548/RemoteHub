// packages/backend/src/routes/probeRoutes.ts
// K8s 探针（票 #33）：/healthz（liveness=进程活，恒 200）+ /readyz（readiness，200/503）。
// 探针惯例不走统一 {success} 响应壳——裸 JSON + 状态码；startup 探针复用 /readyz。
import { Router, type Router as RouterType } from 'express';
import { getReadiness } from '../services/monitoringService.js';

export const probeRoutes: RouterType = Router();

// liveness：能响应请求本身就是进程活的证明，不探测任何依赖——DB 挂了也不摘 liveness（防重启风暴）
/**
 * @swagger
 * /healthz:
 *   get:
 *     summary: K8s liveness 探针(恒 200,不探测依赖)
 *     tags: [Probe]
 *     responses:
 *       200:
 *         description: 进程存活(裸壳 {status:"ok"},非统一响应壳)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 */
probeRoutes.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// readiness：database 可用且磁盘低于阈值 → 200，否则 503（K8s 摘流量不重启；startup 探针复用本端点）
/**
 * @swagger
 * /readyz:
 *   get:
 *     summary: K8s readiness/startup 探针(database+磁盘,200/503)
 *     tags: [Probe]
 *     responses:
 *       200:
 *         description: 就绪(裸壳 {status:"ready",database,diskUsage})
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ready }
 *                 database: { type: boolean }
 *                 diskUsage: { type: number, description: 磁盘使用率(未知为 -1) }
 *       503:
 *         description: 未就绪({status:"unready"},K8s 摘流量不重启)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: unready }
 *                 database: { type: boolean }
 *                 diskUsage: { type: number }
 */
probeRoutes.get('/readyz', async (_req, res) => {
  const { ready, database, diskUsage } = await getReadiness();
  if (!ready) {
    res.status(503).json({ status: 'unready', database, diskUsage });
    return;
  }
  res.status(200).json({ status: 'ready', database, diskUsage });
});
