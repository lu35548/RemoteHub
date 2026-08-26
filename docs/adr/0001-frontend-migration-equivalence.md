# 0001 前端迁移采用等价迁移哲学，auth 契约以 v2 API 为准

v2 前端迁移（`RemoteHub/` v1 → `packages/frontend`）采用**等价迁移**：用户可见行为 1:1 照搬 v1 运行态（App.tsx 活性调用面），只把数据层从 localStorage 双模式换成 TanStack Query + v2 API client；一切改良（交互、视觉、结构）推迟到 phase2。**auth 是唯一例外**——契约以 v2 后端 API 为准（session token、bcrypt、seedAdmin 职责均已在后端），v1 的客户端 `hashPassword` 等行为作废。

## Considered Options

- **借机改良**（迁移同时重做交互/路由/UI）：拒绝——验收标准是移动靶，且 v2 收尾 spec 已有反 scope creep 立场（"前端迁移独立子项目，避免 scope creep"）。
- **53 文件全量迁移**：拒绝——v1 有 11 个 services 文件在运行态不可达（双模式遗产与死代码），处置经逐文件内容评审确定（详见前端迁移 spec 的 services 处置清单）。

## Consequences

- v1 的前端 hash 密码、`initialize` 默认 admin 等职责已归 v2 后端，前端不复刻。
- 在线状态（heartbeat / getOnlineUsers）在 v2 API 无对应端点 → 本项目 scope 含 backend 补 2 端点（heartbeat + online）。
- v1 设计了但未接线的高级连接功能（clone / tag 过滤 / 统计 / 最近访问，见 `remoteConnection.service`）不迁移，是 phase2 功能清单的来源。
- `RemoteHub/` 目录在迁移验收通过后整目录删除，本 ADR 是届时仍存的"为什么"。
