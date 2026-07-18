# RemoteHub V2 总览（文档索引 + 依赖链）

**最后更新**: 2026-07-17
**作用**: v2 所有设计/计划/审计文档的导航入口，避免顺序冲突与一致性漂移。

---

## 文档清单

| 文档 | 角色 | 状态 |
|------|------|------|
| `2026-04-23-remotehub-v2-refactor-design.md` | **一期重构设计**（历史权威） | ⚠️ DB 部分（§2.4/§9.2/§6）被 v2 收尾 spec 切 SQLite 覆盖；其余（认证/权限/CRUD/中间件/错误码/部署架构）仍有效 |
| `2026-04-23-remotehub-v2-phase2-design.md` | **phase2 功能设计**（审计/监控/安全/备份/WS/2FA 等 11 模块） | R3 审查完成（v2.1-draft），待 v2 收尾后实施；§0 前置依赖已声明 |
| `2026-04-30-remotehub-v2-phase2.md` | **phase2 实施 plan** | P0-BLOCKER 批次（前置）已加 + 修订说明 |
| `2026-06-24-remotehub-audit.md` | **项目审计报告**（含附录 A 代码审查 6 BLOCKER） | 完成，驱动一期全修 |
| `2026-07-17-v2-followup-design.md` | **v2 收尾设计**（持久化切换 + BLOCKER + 测试 + 前端迁移） | ✅ spec 定稿（两轮 grill：D1–D10 拍板 + F1–F6 订正 + 5 OQ 关闭/保留），待转 writing-plans |

---

## 依赖链（执行顺序）

```
【v2 收尾】(2026-07-17 spec, 5 项 — phase2 的硬前置)
  ① 持久化 MySQL → SQLite + WAL
  ② BLOCKER-1 migration（依赖 ①）
  ③ BLOCKER-2 CI
  ④ B-6 补核心 service 测试
  ⑤ 前端迁移（独立子项目，解锁 phase2 §19）
        ↓
【phase2 实施】(2026-04-23 design + 2026-04-30 plan)
  P0：审计日志 / 系统监控 / 安全增强
  P1：数据备份 / WebSocket / 密码重置
  P2：导入导出 / 项目增强 / 2FA / K8s 探针 / Swagger
```

**规则**：不完成 v2 收尾 5 项，不开 phase2。

> ⚠️ **前端迁移悬空（2026-07-18 meta-review）**：⑤ 前端迁移是"独立子项目"但**详细 spec/plan 未立项**（当前仅 `2026-07-17-v2-followup-design.md` §5 范围规划）。它是 phase2 §19 硬前置——**phase2 §19 启动前必须先立项前端迁移**（brainstorming → spec → plan）。在此之前，任何"留给前端迁移子项目"的引用视为未承接。

---

## 当前状态（2026-07-17）

| 板块 | 进度 |
|------|------|
| 一期全修 | ✅ commits `4af159e..e3a865b`（B-3/B-4 安全漏洞 + B-5 refresh 事务 + 13 HIGH/MEDIUM，145 测试始终绿） |
| 一期安全就绪度 | ~50% → ~80% |
| v2 收尾 spec | ✅ 定稿（两轮 grill review 完成，D1–D10 + F1–F6 + 5 OQ 关闭/保留），待转 writing-plans |
| phase2 | ❌ 0% 实施（待 v2 收尾） |
| 前端迁移 | ❌ 0%（独立子项目，未立项） |

---

## 关键决策（一致基线）

- **持久化**：SQLite + WAL（弃 MySQL）。理由：几百人 CRUD 写少，WAL 实测 200 并发用户够；去掉 db 容器运维。代码逻辑零改动（Prisma 抽象）。
- **schema**：移除所有 `@db.VarChar`（SQLite 无 native type）→ 应用层长度校验补全（归入 B-6）。
- **加密**：MVP 文件权限（连接密码已 AES-256-GCM）；SQLCipher 留 phase2 后续。
- **前端迁移**：phase2 硬前置，独立子项目（本次只规划分级）。
- **phase2 §19 前端**：blocked，直到前端迁移完成。

---

## 一致性约定

切 SQLite 后，所有文档的 DB 假设以 `2026-07-17-v2-followup-design.md` §1 为准：
- `mysql://...` → `file:./...db`
- `connection_limit=30` → 废弃（SQLite 无连接池）
- `mysqldump` → `VACUUM INTO`
- `db 容器` → 删除（SQLite 应用内嵌）
- `@db.VarChar(N)` → `String`（TEXT）

phase2 design 已据此更新（§1.1/§2/§7/§20.2/§21/§25.6）；refactor design 加了覆盖标注（DB 章节以收尾 spec 为准）。
