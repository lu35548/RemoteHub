# 根目录 backend/ — 废弃的旧 TypeORM 实现（历史参考）

> ⚠️ **本文档原描述已失效。** 原内容把本目录描述为"功能完整的企业级后端"，那是 v2 refactor 前的状态。本目录已于 2026-04 v2 refactor 中被 `packages/backend/`（Express 5 + Prisma 6 + MySQL）完全取代，现仅作历史参考。

## 状态
- **非活代码**，不参与构建、测试、部署
- 不在 pnpm workspace（`pnpm-workspace.yaml` 只认 `packages/*`）
- 保留作为 **phase2 移植参考**（audit / backup / monitoring / websocket / export / security 等功能的旧实现）

## 不可用于生产
- 基于 TypeORM（已弃用，现用 Prisma）
- 大量 mock（Redis / WebSocket 为内存 Mock，见 `config/database-mock*.ts`、`mocks/`）
- 迁移文件已禁用（`migrations-disabled/`）

## 当前活代码
所有后端开发在 `packages/backend/`，权威文档：
- `docs/superpowers/specs/2026-04-23-remotehub-v2-refactor-design.md`（一期设计）
- `docs/superpowers/specs/2026-04-23-remotehub-v2-phase2-design.md`（phase2 设计）
- `docs/superpowers/specs/2026-06-24-remotehub-audit.md`（审计报告，含本目录处置建议 §7）

## phase2 移植注意
移植本目录的旧实现时需重写为 Prisma + 真实实现（去 mock），业务逻辑可参考但不可直接复用代码。

## 清理计划
phase2 相关功能实现并验证后，本目录整体删除。参见审计报告 §7。
