// packages/backend/src/routes/probeRoutes.ts
// K8s 探针（票 #33）：/healthz（liveness=进程活，恒 200）+ /readyz（readiness，200/503）。
// 探针惯例不走统一 {success} 响应壳——裸 JSON + 状态码；startup 探针复用 /readyz。
import { Router, type Router as RouterType } from 'express';
import { getReadiness } from '../services/monitoringService.js';

export const probeRoutes: RouterType = Router();

// liveness：能响应请求本身就是进程活的证明，不探测任何依赖——DB 挂了也不摘 liveness（防重启风暴）
probeRoutes.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// readiness：database 可用且磁盘低于阈值 → 200，否则 503（K8s 摘流量不重启；startup 探针复用本端点）
probeRoutes.get('/readyz', async (_req, res) => {
  const { ready, database, diskUsage } = await getReadiness();
  if (!ready) {
    res.status(503).json({ status: 'unready', database, diskUsage });
    return;
  }
  res.status(200).json({ status: 'ready', database, diskUsage });
});
