# 0002 SQLite 为开发与生产数据库（方言豁免）+ 部署栈 nginx 订正 + health 口径固化

`openspec/project.md` 原约定「MySQL 统一（开发 + 生产）」「Caddy 2 反向代理」，但 P0 起实际运行态是：v2 后端 SQLite（`file:` URL + WAL），首个 migration（`20260718074800_init`）即 SQLite 方言；部署栈为 nginx（`docker/nginx.conf` + Dockerfile.frontend 第二阶段 `nginx:alpine`）。本 ADR 承认现状为正式决策，豁免与 project.md 的偏离，并同步订正 project.md（四处 MySQL 表述 + 三处 Caddy 表述清零）。

## 决策

1. **数据库 = SQLite，开发与生产统一（WAL 模式）**。理由：一期单实例、写负载低（连接管理工具非高写业务），WAL 支持并发读 + 串行写已够用。扩容路径 = 迁移 MySQL/PostgreSQL，触发条件 = 高写场景遇瓶颈（design「plan-a-sqlite-switch」原口径）。
2. **description 净化误杀边界明示**（spec D6 钦定接受现状）：全局净化中间件（`packages/backend/src/middleware/sanitization.ts`）的注入拒绝规则中，`SQL_COMMENT_RE = /--/` 与 `CMDI_RE = /&&/` 对裸串即拒绝（422 VAL_001），而 `description` 不在排除字段清单（`SANITIZATION_EXCLUDED_FIELDS` 仅 password / encryptedPass / notes / oldPassword / newPassword）——**Project.description 自由文本含 `--` / `&&` 技术串将被 422 拒绝，属可接受误杀面**。不豁免的理由：排除清单按「字段级整树豁免」设计，为 description 单开白名单会让注入面整体放宽。
3. **部署栈 = nginx（非 Caddy）**：实际部署物为 `docker/nginx.conf`（SPA 托管 + /api 反代 + WS 三件套），HTTPS/TLS 由部署环境外层承担（compose 内仅 listen 80），无 Caddy 自动 HTTPS 语义。
4. **health 五字段口径固化**（以代码为单一真相源，`packages/shared/src/types.ts` SystemHealth + `packages/backend/src/services/monitoringService.ts`）：
   - `/api/v1/health` 单端点返回五字段 SystemHealth：`{ status: 'healthy' | 'degraded', database: boolean, diskUsage, memoryUsage, uptime }`，百分比字段一位小数。
   - degraded 矩阵：`!database || memoryUsage > 90 || diskUsage > 95`；**503 仅由 `database === false` 决定**（compose healthcheck 只看状态码，磁盘/内存越限只降级 body 的 status 字段，不改变状态码）。
   - `diskUsage = -1` 表示探测失败（statfs 失败），属「未知」而非越界，readiness 判定不阻断。
   - K8s 探针（票 #33）：`/healthz`（liveness，裸 200）、`/readyz`（readiness：`ready = database && diskUsage <= 95`，裸 200/503，diskUsage -1 不阻断）。

## Considered Options

- **回切 MySQL**：拒绝——一期单实例无高写需求，回切需重写全部 migration + 引入数据库服务容器，成本远大于收益；SQLite + WAL 在目标规模（几百人）下有实测余量。
- **为 description 单开净化白名单**：拒绝——排除清单是字段级整树豁免，为描述字段放宽全局注入拒绝会让真实注入载荷经 description 入库；误杀面（技术串 `--`/`&&` 出现在项目描述中）小且用户可通过措辞规避。
- **health 扩三探针端点（live/ready/startup 分端点）**：推迟——`/healthz` `/readyz` 已覆盖 live/ready；startup 探测物在 SQLite 场景无独立可探物（bootstrap 串行 WAL→seed→listen 已隐含保证），不建空端点。

## Consequences

- `openspec/project.md` 四处 MySQL 表述（Tech Stack / 数据库规范 / 技术约束 / 运行时）与三处 Caddy 表述（部署 / 部署形态 / 运行时）按本 ADR 订正，diff 即验收物。
- research `2026-09-24-p1-infra-cleanup.md` 未决疑问 #4（SQLite 场景 startup 探测物）与 #6（MySQL/Caddy 漂移随 P1 修）在本 ADR 闭环。
- 数据库规范中「保证 MySQL / SQL Server 兼容」的换库兼容性约束改写为面向 SQLite 的表述，约束本身（不用 JSON/Enum 数据库类型）保留。
- v1 `backend/` 目录（TypeORM + Express 4 时代）删除后，本 ADR 与 git 历史是「为什么是 SQLite」的存档；swagger 注解实践另见 `docs/superpowers/research/2026-11-05-v1-swagger-annotation-notes.md`（#51 消费物）。
