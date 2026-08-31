# Phase2 Backlog（前端迁移期悬置项收编）

**创建**: 2026-08-31（T12 收官后对 #1–#13 执行期遗留 OQ 的审计产物）
**作用**: 前端迁移（等价迁移纪律，ADR-0001）期间显式推迟的功能缺口/UI 怪癖/工程项的集中归档，**phase2 开工输入**。来源为 `implementation-notes.md` 各票 section（编年体散文，不再作权威载体）。
**粗粒度 4 类不在此重复**：members 管理 UI / 高级连接功能金矿（clone/tag 过滤/统计/最近访问/协议元数据）/ 分页 UI·移动端·国际化 / `backend/` 目录处置——见 `2026-08-25-frontend-migration.md` Out of Scope 与 phase2 design 对应章节。

## 开工前查证（P0 之前，半小时级）

- [x] ~~**JWT secret 持久性**（T10 观察）~~ ✅ 已查证**非 bug**（2026-08-31，diagnosing-bugs 流程）：refresh token 非 JWT（随机 token + hash 查 session 表，`authService.ts:34,143-144`），refresh 链路不经过 JWT_SECRET；两处 `.env` secret hash 一致且 `requireEnv` fail-fast 无随机 fallback；DB named volume 持久。动态判定：登录拿未消费 token → `--force-recreate` backend → health 恢复后 refresh **200**。T10 观察系双栈 cookie 串扰伪影（refresh 轮换撤销旧 token 被误记为重建失效，notes T10 上一行即串扰记录）。

## 按承接位置归类（13 项）

### §19 前端——用户可感知缺口
- [ ] 编辑换项目（跨项目移动连接）：需目标项目写权校验 + requiredVpnId 跨项目依赖处理（T5 Spec-S1，v1 可换 v2 锁定的 Deviation）
- [ ] 编辑密码清空交互：v1「删光密码提交=清空」能力，现留空=保持不变（T5 挂「T6/phase2」，T6 实做动作系统未做此项）
- [ ] 假重置按钮换真：toast 假文案无真 API，phase2 §6 密码重置落地时替换（T7）
- [ ] 用户列表超 100 静默截断：与分页 UI 一并解（T7，后端 MAX_PAGE_SIZE=100）
- [ ] 改密后 toast 加「请重新登录」预告（T11；强制登出本身是安全契约，不改）

### §19 前端——v1 等价保留的怪癖
- [ ] input name/autocomplete a11y issue（T3，v1 遗留）
- [ ] setup Modal「暂不配置」文案与行为不符（T6）
- [ ] copyTarget 魔法串重构（T6）
- [ ] favicon.ico 404：加 `public/favicon.ico` 即清零（T11）

### 部署/工程
- [ ] nginx index.html 显式 no-cache 头（T10：新版本入口可能被浏览器启发式缓存延迟）
- [ ] nginx `proxy_pass` DNS resolver 方案（T10：现仅启动时解析，backend 重建换 IP 需 restart frontend）
- [ ] CI actions v4 → v5 升级（T9：v4 强制跑 Node 24，「Node.js 20 is deprecated」告警）

## 处置纪律

- 完成一项划一项并注 commit；此后新悬置项入此清单，不再散落 notes。
- 归类是建议非承诺——phase2 立项时按实际模块边界重新归并。
