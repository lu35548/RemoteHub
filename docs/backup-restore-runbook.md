# 备份与恢复 Runbook（#38，W2-6）

备份机制：SQLite `VACUUM INTO` 在线一致性快照（对源库只读、与 WAL 共存、产物 compacted）。
触发通道：cron 每日 02:00（仅定时，与 session 03:00 / 审计 03:30 / 通知清理 04:00 错峰）+
admin 手动触发 `POST /api/v1/admin/backups`。retention 默认保留最新 30 份（`BACKUP_RETENTION_COUNT` 可配，下界 1）。

> 时区语义：cron 时刻（02:00 及错峰序列）与备份文件名时间戳均按**容器本地时区**解释——
> compose 已为 backend 显式设置 `TZ=Asia/Shanghai`；若未设置，容器默认 UTC，定时语义会整体偏移 8 小时。

## 备份存储位置

| 环境 | 目录 | 说明 |
|---|---|---|
| Docker（compose） | 容器内 `/data/backups`（独立卷 `backup-data`） | 与 `sqlite-data` 卷生命周期**解耦**：删库卷不连带备份卷；反之亦然 |
| dev | `packages/backend/backups/`（相对路径锚定 backend 根，不随 CWD 漂移） | `BACKUP_DIR` 可覆盖 |

- 文件名：`backup-YYYYMMDD-HHmmss.db`（本地时区，与 cron 02:00 本地时区语义一致）
- 元数据（大小/时长）在手动触发响应体返回；列表 `GET /api/v1/admin/backups` 实时扫描目录
- 下载：`GET /api/v1/admin/backups/:filename/download`（文件名白名单 + 前缀校验，admin 门禁）
- 同秒重复触发为同名覆盖语义（秒级时间戳文件名）；备份中断只留 `.tmp` 残留，下次轮转顺带清理

## 恢复流程（停栈 → 替换 db 文件 → 起栈，**不做在线恢复**）

> 恢复 = 用备份文件替换生产库文件。VACUUM INTO 是单向快照，不能反向恢复；
> 在线替换运行中的库文件有 WAL/句柄风险，因此恢复窗口要求停栈。

### 1. 停栈（backend 必须完全停止写）

```bash
docker compose stop backend
# frontend 可留可停；backend 停止后 API 不可用，建议整栈停：
docker compose down
```

### 2. 定位并校验备份文件

```bash
# 备份卷内找目标（宿主机卷路径可用 docker 卷检查，或起临时容器挂载）：
docker run --rm -v remotehub_backup-data:/backups -v "$(pwd):/work" alpine \
  sh -c "ls -la /backups && cp /backups/backup-XXXXXXXX-XXXXXX.db /work/restore.db"
```

校验备份可用性（SQLite 打开验证表数，7 张业务表齐全才算有效）：

```bash
docker run --rm -v "$(pwd):/work" alpine sh -c \
  "apk add --no-cache sqlite >/dev/null && sqlite3 /work/restore.db \
   \"SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations';\""
# 期望输出 ≥ 7
```

### 3. 替换 db 文件（跨卷写：backup-data → sqlite-data）

```bash
# 起临时容器把校验过的备份写入库卷（覆盖 prod.db；建议先留原库副本）
docker run --rm -v "$(pwd):/work" -v remotehub_sqlite-data:/data alpine \
  sh -c "cp /data/prod.db /data/prod.db.pre-restore && cp /work/restore.db /data/prod.db && rm -f /data/prod.db-wal /data/prod.db-shm"
```

> `prod.db.pre-restore` 是恢复前快照——恢复出错可二次替换回来。确认稳定后可手动删除。

### 4. 起栈并验证

```bash
docker compose up -d
# 健康检查 + 管理台登录 + 关键数据抽査（项目数/连接数与备份时点一致）
curl -f http://localhost:8080/api/v1/health
```

backend 启动时 `migrate deploy` 会自动把旧 schema 备份升到当前版本（只前进不回退：
若备份 schema 比代码新——跨版本回滚——migrate deploy 不会执行降级，需人工评估差异）。

## 常见问题

- **备份失败**：admin 会收到 `BACKUP_FAILED` 通知（WS 即时 + NotificationQueue 离线可达），
  logger 同步落 `Backup failed`。排查源库路径（`DATABASE_URL` 相对路径已锚定）与卷空间。
- **恢复后无法登录/数据异常**：检查是否误用 `.tmp` 半成品（残留文件不在列表端点内，
  人工恢复时以 `backup-*.db` 正式名为准）或跨 `ENCRYPTION_KEY` 的备份（连接密文不可解，
  密钥指纹不匹配属预期——密文与密钥同生命周期）。
- **手动触发 500（BACKUP_003）**：看 backend 日志 `Backup failed` 行——多半是 `/data/backups`
  卷空间不足或权限问题。
