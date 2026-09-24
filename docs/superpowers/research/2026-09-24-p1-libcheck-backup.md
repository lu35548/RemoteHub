# P1 库核验：SQLite 数据备份（VACUUM INTO / Prisma raw / cron / 下载端点）

- 日期：2026-09-24
- 核验范围：P1 spec（`docs/superpowers/specs/2026-09-24-phase2-p1-full-spec.md` §W2 模块 6「数据备份」）票面四项技术前提 + 一项对比选型
- 证据等级：联网官方文档（sqlite.org / expressjs.com / npm / GitHub）+ **本地实证探针**（better-sqlite3 11.10.0 与 Prisma 6.19.3 真链路，2026-09-24 运行）+ 项目源码（绝对路径行号）
- 环境：Windows 11 / node v22.22.1 / 项目实装 `better-sqlite3@11.10.0`、`@prisma/adapter-better-sqlite3@6.19.3`、`express@5.2.1`、`node-cron@3.0.3`（均从 `node_modules/.pnpm` 实装核对，非 package.json 声明）

---

## TL;DR：一项票面预期被实证反转

> **VACUUM INTO 的文件名可以绑定参数。** 票面预判「大概率不能绑定 → 须拼接 + 白名单」不成立：SQLite 官方文档明文 INTO 子句接受任意标量表达式，绑定参数合法；better-sqlite3 直连与 Prisma `$executeRaw`/`$queryRaw` 模板参数化三条链路均实测通过。**备份 SQL 直接写 `prisma.$executeRaw\`VACUUM INTO ${absPath}\``，SQL 注入面为零**（文件系统层校验仍要做，见 §4）。

其余结论与票面预期一致：最低版本满足、目标文件已存在必须先删、cron 照 auditCleaner 款、VACUUM INTO 维持钦定。

---

## 1. VACUUM INTO 基础语义

### 1.1 最低版本要求

**结论**：VACUUM INTO 于 SQLite 3.27.0（2019-02-07）引入，发布日志第 1 条即 "Added the VACUUM INTO command"。项目满足，余量充足。

| 层 | 版本 | 捆绑 SQLite | 是否 ≥ 3.27 |
|---|---|---|---|
| 项目实装 better-sqlite3@11.10.0 | 11.10.0 | **3.49.2**（实测 `SELECT sqlite_version()`） | ✅ |
| 上游最新 better-sqlite3（npm，2026-09-24 查） | 13.0.3 | 3.53.4（master 文档 compilation.md 快照） | ✅ |

> 捆绑版本实测语句：`db.prepare('select sqlite_version() as v').get().v` → `"3.49.2"`。CI/Docker 全新环境安装的是同一 11.10.0 pinned 版本，prebuild 二进制捆绑同一 SQLite，无需运行时探测。
>
> 升级提示（票外）：上游 better-sqlite3 已到 13.x、@prisma/adapter-better-sqlite3 已到 7.x（npm 2026-09-24），项目锁 6 线不动，备份功能不受影响。

**来源**：
- https://www.sqlite.org/releaselog/3_27_0.html （"Added the VACUUM INTO command"）
- https://www.sqlite.org/lang_vacuum.html
- https://github.com/WiseLibs/better-sqlite3/blob/master/docs/compilation.md#bundled-configuration

### 1.2 文件名参数化限制（关键反转，票面预期修正）

**结论**：INTO 后的文件名是**标量表达式**，绑定参数合法；无需拼接，无 SQL 注入面。

官方原文（lang_vacuum.html §2.1）：

> "The argument is a scalar expression, such as a text literal."
> "The filename in the INTO clause **can be an arbitrary SQL expression that evaluates to a string**."

本地实证（三条链路全过）：

```
[better-sqlite3 直连]
db.prepare('VACUUM INTO ?').run('x.db')            → OK（绑定参数成功执行）

[Prisma 6.19.3 + adapter-better-sqlite3 真链路]
prisma.$executeRaw`VACUUM INTO ${target}`           → 语句成功 prepare+执行，仅因目标已存在报业务错
prisma.$queryRaw`VACUUM INTO ${target}`             → OK，返回 []，目标文件创建成功
```

反面对照（拼接路径的脆弱性，实测）：路径含未转义单引号时 → `near ",": syntax error`（语句崩，说明拼接写法既危险又脆弱；即便转义单引号防了注入，反斜杠/控制字符仍可能产生非预期路径）。

**票面级实施注意**：
- 备份 SQL 定稿写法：`await prisma.$executeRaw\`VACUUM INTO ${absoluteTargetPath}\``——模板字符串参数化，官方推荐位（tagged template 优先于 `*Unsafe`，见 §2）。
- **SQL 参数化不豁免文件系统校验**：目标路径必须服务端生成（固定备份根目录 + 时间戳文件名如 `backup-20260924-020000.db`），不接任何用户输入；下载端点再做一层 root/前缀校验（见 §4）。
- 不用 `$executeRawUnsafe` 字符串拼接版本（实测可行但有注入面与转义坑，无收益）。

### 1.3 目标文件已存在时的行为

**结论**：报错拒绝，不覆盖。

官方原文：

> "The file named by the INTO clause must not previously exist, or **else it must be an empty file**, or the VACUUM INTO command will fail with an error."

本地实证：同一目标路径二次执行 → `SqliteError: output file already exists`。注意例外：**已存在但为 0 字节的空文件是合法目标**。

**票面级实施注意**：
- 覆盖策略 = 备份前先删：`fs.rmSync(target, { force: true })`。
- 更稳的定稿模式（推荐）：**临时文件名备份 + 成功后 rename**——既天然绕开「已存在」错误，又规避 §1.4 的中断损坏窗口（半成品文件不会顶掉上一次好备份）。
- retention 清理（保留 N 份）删旧文件与本条无关，按文件名时间戳排序即可。

### 1.4 一致性 / 中断 / WAL 共存语义

**结论**：VACUUM INTO 产出一致性快照，且**对源库只读**（备份不阻塞业务写、不被写锁阻塞，与项目已开 WAL 完全兼容）。

官方原文（lang_vacuum.html）：

> "The VACUUM INTO command is transactional in the sense that the generated output database is a consistent snapshot of the original database. However, if the VACUUM INTO command is interrupted by an unplanned shutdown or power loss, then the generated output database might be incomplete and **corrupt**."
> "VACUUM (but not VACUUM INTO) is a write operation and so if another database connection is holding a lock that prevents writes, then the VACUUM will fail."
> "if the PRAGMA synchronous setting of the original database is NORMAL or FULL, then SQLite invokes fsync() ... after it has been written."

项目相关：better-sqlite3 捆绑编译选项含 `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`（NORMAL），fsync-on-completion 语义适用，命令完成即落盘稳定；`SQLITE_USE_URI=0`，URI 文件名默认关闭（本功能用不到 URI，无影响）。

**票面级实施注意**：
- 中断可能留半成品损坏文件 → 用「临时名 + rename」（§1.3）后，损坏残留只占空间不冒充好备份；retention 可顺带清理 `*.tmp` 前缀残留。
- 02:00 备份窗口内业务写不受影响，无需停栈。

---

## 2. Prisma $queryRaw / $executeRaw 执行 VACUUM INTO

**结论**：Prisma 6 实测允许 raw API 跑 VACUUM INTO；`$executeRaw`（数据修改语句语义）是对口选择；模板字符串参数化可用且被官方推荐。

Prisma 官方口径（ORM 文档，Prisma 6/7 一致）：

> Run raw SQL queries returning rows using `prisma.$queryRaw` and data-modifying statements using `prisma.$executeRaw`.
> ```ts
> await prisma.$executeRaw`UPDATE "User" SET active = false WHERE id = ${id}`;
> ```

本地实证（Prisma 6.19.3 + `PrismaBetterSQLite3` adapter，真库）：

| API | 写法 | 结果 |
|---|---|---|
| `$executeRawUnsafe` | 字符串拼接路径 | ✅ OK（有注入面，不采用） |
| `$executeRaw` | 模板串参数化 | ✅ 语句执行成功（首次运行仅因目标已存在报 `output file already exists`——恰好证明参数化语句被完整 prepare+执行） |
| `$queryRaw` | 模板串参数化 | ✅ 执行成功，返回 `[]`，文件创建成功 |

**项目先例（server.ts:171）**：

```ts
// packages/backend/src/server.ts:170-174（bootstrap 第 1 步，WAL）
const [wal] = await prisma.$queryRaw<Array<{ journal_mode: string }>>`PRAGMA journal_mode = WAL`;
if (wal?.journal_mode !== 'wal') {
  throw new Error(`SQLite WAL 切换失败: ${JSON.stringify(wal)}`);
}
```

先例模式 = tagged template + 解构断言失败即抛。备份语句无结果集，不需要断言解构，`await prisma.$executeRaw\`VACUUM INTO ${p}\`` 即可；prisma 实例用 `packages/backend/src/utils/prisma.ts:8-13` 的单例（`PrismaBetterSQLite3` adapter）。

**票面级实施注意**：
- 备份函数放独立 service/cleaner 文件（如 `backupService.ts`），导出 `createBackup(): Promise<路径>` 供 cron 与 admin 手动触发端点复用——两处入口共用同一实现，通知管道（完成/失败）在调用侧接线。
- `bootstrap()` 的 `NODE_ENV !== 'test'` guard（server.ts:211-214）使 cleaner 不会被集成测试意外触发；备份的**手动触发端点**仍需 supertest 集成测试覆盖，测试中把备份目录指到临时目录（env 注入），避免污染真实卷。
- spec 测试决策「备份票补『相对 URL+变 CWD』回归」落点：备份目录 env 若是相对路径，参照 `utils/sqliteUrl.ts` 的 `resolveSqliteUrl` 先例锚定到确定基准（prisma/ 目录或显式绝对路径），并用回归测试锁死。
- VACUUM INTO 无法被 Prisma mock 验证（B-6 `createPrismaMock` 不覆盖 raw SQL 执行副作用），备份成功路径必须走真库集成测试（setupTestDb 先例）。

---

## 3. 项目 cron 现状与 node-cron 版本

**结论**：项目已有 node-cron@3.0.3 实装（非"尚无 cron 库"），备份 02:00 任务照 `auditCleaner` 同款模式即可，零新依赖。

项目现状（源码核对）：

| 任务 | 实现 | 表达式 | 启动即清？ | 位置 |
|---|---|---|---|---|
| session 清理 | `cron.schedule` | `'0 3 * * *'` | **是**（函数先调一次再 schedule） | `packages/backend/src/utils/sessionCleaner.ts:25-33` |
| 审计清理 | `cron.schedule` | `'30 3 * * *'` | **否**（仅 schedule） | `packages/backend/src/utils/auditCleaner.ts:24-30` |

两者均 `import cron from 'node-cron'`（默认导出），异常模式 `promise.catch(err => logger.error(...))`。挂载点在 `bootstrap()` 内 `startSessionCleaner()` → `startAuditCleaner()`（`packages/backend/src/server.ts:180-183`）。

P1 spec W2 裁决（full-spec.md:86）：

> "cleaner 模式裁决：通知清理与备份 cron 均**仅定时不启动即清**（对齐 auditCleaner 先例，sessionCleaner 启动即清是特例）"

即备份任务照 auditCleaner 款：`cron.schedule('0 2 * * *', () => { createBackup().catch(...) })`，函数体导出但不在启动时调用。02:00 与 03:00/03:30 天然错峰。

**node-cron 版本与 API**（npm 2026-09-24 查证）：
- 项目实装：`node-cron@3.0.3` + `@types/node-cron@3.0.11`；上游最新：**4.6.0**。
- v3→v4 有 breaking changes：月份字段索引 0-11 → 1-12、day-of-week 索引变化、调度性能改进。`'0 2 * * *'` 不含月/周特殊字段，3.x/4.x 语义一致；**项目锁 ^3.0.3 不动**，无升级必要。
- API（3.x，项目在用）：`cron.schedule(expression, fn)` → 返回 ScheduledTask；与两个 cleaner 先例完全同款，无新库引入。
- 时区：node-cron 按进程本地时区解释表达式（v4 文档建议 DST 敏感场景显式 `timezone: 'UTC'`）；备份与两个 cleaner 同进程同 TZ，错峰关系恒成立，无需额外配置。

**来源**：
- https://www.npmjs.com/package/node-cron （latest 4.6.0，2026-09-24）
- https://github.com/kelektiv/node-cron （README：v4 月份/星期索引变化）
- https://nodecron.com/ （Migration Guide: node-cron v3 to v4）

---

## 4. 备份文件下载端点（Express 5 res.download / res.sendFile）

**结论**：实装 express 5.2.1；`res.download`（attachment 语义）是对口 API；路径遍历防护的官方机制是 **`root` 选项**（Express 校验相对路径解析结果在 root 内），配合绝对路径 + 服务端生成文件名双保险。

官方 5x API 文档关键摘录：

> ### res.download(path [, filename] [, options] [, fn])
> Transfers the file at `path` as an "attachment". ... If `path` is relative, then it will be based on the **current working directory of the process** or the `root` option, if provided.
> "This API provides access to data on the running file system. Ensure that either (a) the way in which the path argument was constructed is secure if it contains user input or (b) **set the root option** to the absolute path of a directory to contain access within."

> ### res.sendFile(path [, options] [, fn])
> Unless the `root` option is set, `path` must be an **absolute path** to the file.
> "When the `root` option is provided, the `path` argument is allowed to be a relative path, **including containing `..`**. Express will validate that the relative path provided as `path` will resolve within the given `root` option."

**票面级实施注意**：
- 端点定稿写法（三重防护）：
  1. 文件名**服务端生成/白名单校验**：只接受 `backup-YYYYMMDD-HHmmss.db` 形态（正则锁死），拒绝 `..`、路径分隔符、点开头文件（`dotfiles: 'deny'` 选项兜底）；
  2. `path.resolve(BACKUP_DIR, name)` 后断言 `startsWith(备份根目录绝对路径)`，再传**绝对路径**给 `res.download`——同时化解 spec 测试决策「相对 URL+变 CWD」风险（res.download 相对路径吃 `process.cwd()`，服务端必须绝对路径）；
  3. `filename` 实参给下载展示名，`Content-Disposition` 自动带上（headers 选项可补自定义头，但注意会被 filename 实参覆盖 Content-Disposition）。
- callback 形态：`res.download(p, name, err => { if (err) next(err) })`——err 时响应可能已部分发送，文档明示检查 `res.headersSent`。
- Express 5 移除了 v4 的小写 `res.sendfile`（5x API 文档无此方法），只写 `res.sendFile`/`res.download`。

**来源**：https://expressjs.com/en/5x/api.html#res.download 、#res.sendFile （2026-09-24 抓取全文）

---

## 5. 在线备份双通道对比：better-sqlite3 `.backup()` vs VACUUM INTO

**结论**：两者互为官方承认的替代方案，均为在线一致性快照；本项目场景维持 VACUUM INTO 合理，`.backup()` 的增量能力是真实优势但边际价值低——如实报告，不改 spec 钦定。

SQLite 官方对比（lang_vacuum.html §2.1）：

> "The VACUUM command with an INTO clause is **an alternative to the backup API** for generating backup copies of a live database. The advantage of using VACUUM INTO is that the resulting backup database is **minimal in size** and hence the amount of filesystem I/O may be reduced. Also, all deleted content is purged from the backup, leaving behind no forensic traces. On the other hand, **the backup API uses fewer CPU cycles and can be executed incrementally**."

better-sqlite3 `.backup()` API 摘录（官方 api.md）：

> ### .backup(*destination*, [*options*]) -> *promise*
> Initiates a backup of the database, returning a promise... A backup file is just a regular SQLite database file.
> "You can continue to use the database normally while a backup is in progress. If the same database connection mutates the database while performing a backup, those mutations will be reflected in the backup automatically. However, if a **different connection mutates the database during a backup, the backup will be forcefully restarted**."
> progress 回调每 100 页/事件循环上报 `{totalPages, remainingPages}`，返回 0 可暂停、抛异常可取消；连接关闭自动中止 pending 备份。

实测：`typeof db.backup === 'function'`，异步 Promise，产物为常规 SQLite 文件。

### 对比表

| 维度 | VACUUM INTO | `.backup()` |
|---|---|---|
| 一致性 | 一致性快照（事务性） | 一致性快照（在线分页复制） |
| 对源库 | **只读**，不阻塞写 | 只读；但异连接写入会触发备份**强制重启** |
| 中断行为 | 产物可能损坏（须临时名+rename 兜底） | 备份中止，产物不完整（同样需完整性兜底） |
| 产物大小 | **最小化**（fully vacuumed、清 forensic 痕迹） | 原样页复制，含 free pages |
| CPU / I/O | CPU 多、I/O 少 | **CPU 少**、可**增量**续传 |
| 接入成本 | 一条 SQL（`$executeRaw` 参数化） | driver 层 API；**Prisma adapter 下拿不到连接句柄**（adapter 封装 better-sqlite3 实例，走 `$queryRaw` 无从调用 `.backup()`） |

### 推荐与理由（不改 spec 结论）

维持 **VACUUM INTO**：
1. **架构适配是决定性的一条**：项目经 Prisma driver adapter 访问 DB，业务层拿不到裸 `Database` 句柄，`.backup()` 要用得绕过 Prisma 另开连接（文件锁/WAL 多连接可行但引入第二连接管理）；VACUUM INTO 一条参数化 SQL 即达。
2. 每日一次 02:00 全量 + retention N 份的场景，增量与省 CPU 的收益对小库可忽略；产物 compacted（更小）反而利于下载端点与卷空间。
3. 「异连接写入强制重启」对 `.backup()` 是真实风险面——Prisma 连接与备份连接并发写入会白做；VACUUM INTO 无此语义。

`.backup()` 值得复核的时点：库大到备份窗口成问题、或需要低峰连续在线备份时，再评估增量分页方案。

**来源**：
- https://www.sqlite.org/lang_vacuum.html（§2.1 官方对比）
- https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backup

---

## 6. 落到票面的修订建议汇总（不改结论，仅修实现口径）

1. **备份 SQL 定稿**：`await prisma.$executeRaw\`VACUUM INTO ${absPath}\``——参数化，无拼接、无白名单转义逻辑（票面「白名单字符校验」降级为文件系统层路径校验）。
2. **备份流程**：临时名（如 `backup-<ts>.db.tmp`）→ `$executeRaw` → 成功后 `fs.renameSync` 为正式名 → 失败/中断残留由 retention 顺带清理。已存在目标不必先删（临时名天然唯一），若仍用正式名直写则必须 `fs.rmSync(target, { force: true })` 先删。
3. **cron**：`backupCleaner.ts` 照 `auditCleaner.ts` 逐行同款（`cron.schedule('0 2 * * *')` 仅定时 + catch 日志），`bootstrap()` 在 `startAuditCleaner()` 后挂载；零新依赖（node-cron@3.0.3 已在）。
4. **下载**：`res.download(绝对路径, 展示名, cb)` + 文件名正则白名单 + `path.resolve` 前缀校验；spec「相对 URL+变 CWD」回归测试锁绝对路径。
5. **测试**：真库集成（mock 验不了 VACUUM INTO）；覆盖三条用例——首次成功、目标已存在报 `output file already exists`、下载路径遍历拒绝。

## 7. 来源清单

| # | URL | 用途 |
|---|---|---|
| 1 | https://www.sqlite.org/lang_vacuum.html | VACUUM INTO 语义/参数化/已存在行为/与 backup API 对比 |
| 2 | https://www.sqlite.org/releaselog/3_27_0.html | 3.27.0 引入 VACUUM INTO |
| 3 | https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backup | .backup() 签名与并发语义 |
| 4 | https://github.com/WiseLibs/better-sqlite3/blob/master/docs/compilation.md#bundled-configuration | 捆绑 SQLite 3.53.4（13.x/master）与编译选项 |
| 5 | https://www.npmjs.com/package/better-sqlite3 | 上游最新 13.0.3 |
| 6 | https://www.npmjs.com/package/node-cron | 上游最新 4.6.0 |
| 7 | https://github.com/kelektiv/node-cron | v4 月份/星期索引 breaking changes |
| 8 | https://expressjs.com/en/5x/api.html#res.download 、#res.sendFile | Express 5 下载/发文件 API 与 root 防护 |
| 9 | Prisma ORM 文档（context7 /prisma/web，raw-sql 篇） | $queryRaw/$executeRaw 分工与模板参数化 |
| 10 | 本地实证探针（2026-09-24） | better-sqlite3 11.10.0 / Prisma 6.19.3 真链路六项行为坐实 |
