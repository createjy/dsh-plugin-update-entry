# PRD：一键更新提速（并行检查 + 受限流水线 + 进度可预期）

- 作者 / 日期：createjy / 2026-11-19
- 状态：**已实现（v1.0.5）** —— P0-1 / P0-3 / P1 按本文件落地；P0-2 改为安装串行，理由见 §3 末尾「实现记录」
- 关联代码：`client.js` 的 `runBulk` / `bulkFootNodes` / `bulkItemNode` / `primeBulkVersions`

## 1. 背景与问题

用户反馈：一键更新多个插件太慢，询问能否并行。

实测数据（2026-11-19，DSH 0.2.2-rc.3，GUI 127.0.0.1:50777）：

| 阶段 | 实测 |
| --- | --- |
| `listVersions` 单发 | 1.4–3.1 s / 个 |
| `listVersions` 串行 16 个 | ≈ 33 s |
| `listVersions` 并发 16 个 | **5.6 s**（网关并发无锁，正常） |
| `updateBundle` 单次成功 | 3–6 分钟（pnpm 全量重解析 profile 315 包，remove+install 两次 pnpm 运行） |
| 本次实测一次更新（失败+恢复） | **> 8 分钟**（其中被无关的 GitHub tarball 依赖下载拖住 1–3 分钟） |

## 2. 可行性结论：更新阶段并行不可行，检查阶段并行可行

**为什么更新不能并行（宿主硬约束，有源码证据）**：

- `dsh-plugin-manager` 每次变更经 `withFileLock(profile/package.json)`（`@deepseek-ai/dsh-atomic-write`：`wx` 独占锁文件，等锁 `waitMs` 默认 120 s，超时抛 `atomic-write: timed out waiting for the writer lock`），且带 HMR 时再经 `hmr.runExclusive` 二次串行。
- `updateBundle` 内部 = remove（持锁 pnpm remove）+ install（持锁 pnpm add）+ 失败时 restore（再持锁）→ 每次更新至少两次串行 pnpm 全量重解析。
- 因此并发 `updateBundle` 的墙钟收益为 **0**（全部排队在锁上），且队列深度超过约 2 分钟后**直接失败**。并发还会放大网络抖动的互相影响。

**真正提速的唯一途径是宿主批量接口**（一次 pnpm 操作更新多个包），超出本插件范围 → 见 §5 记录为宿主需求。

## 3. 本 PRD 范围（插件侧可落地的全部收益）

### P0-1：runBulk 补读循环并行
现状：`runBulk` 先对「版本没读到 / 读取中」的行**串行** `await primeBulkVersions(item, true)`，失败场景 16 项串行重读 ≈ 33 s。
改法：`Promise.all` + 信号量并发上限 4，全部重读完成后进入更新循环。
收益：失败/慢场景省 10–30 s；正常场景无感知（本来就 0 项）。

### P0-2：受限流水线（in-flight ≤ 2）
现状：逐项 `await viaTiers('updateBundle', ...)`，下一项的 registry check（宿主内 `checkRegistryUpdate`，不占锁，1–3 s）被上一项的 pnpm 串行阻塞。
改法：维护 `inFlight` 计数（上限 2）；第 N 项完成后立即启动第 N+1 项；队列其余项等待。第 N+1 项的 check 与第 N 项的 pnpm 操作并行。
收益：每项省 1–3 s；锁队列深度 ≤ 1，远低于 120 s 超时线。
风险控制：并发 >2 一律不再增加（超过 2 只会排队且抬高超时风险，无收益）。

### P0-3：慢/锁/网络状态的可见性
- 新增错误映射：`atomic-write: timed out waiting for the writer lock` → 「上一次更新仍在进行，请稍后重试」；`operation-error` 附带诊断原文。
- 面板项内显示「第 N/M 个 · 已用时 Xs」；单项超过 90 s 追加提示「宿主正在安装，网络慢时会更久」。
- 完成汇总：每项附耗时。

### P1：预期时长提示
面板页脚给出「预计 N × 3–6 分钟（宿主逐个安装）」的提示，把"慢"变成可预期，减少"卡住"的观感。

### 实现记录（v1.0.5 落地时的偏离）

P0-2 的「in-flight ≤ 2」最终实现为 **安装串行（`BULK_UPDATE_LIMIT = 1`）**，因为：

1. `updateBundle` 的 pnpm 全程在 `withFileLock(profile/package.json)` 内，宿主 `lockWaitMs` 默认 `120e3`，而实测单次安装 3–6 分钟 > 120 s → 第二个请求不会并发，只会以锁超时失败。
2. 限 1 才能让「停止」语义成立：并发的第二个安装已经在飞，停止拦不住。
3. 版本读取已并发 4 路（P0-1），安装阶段的瓶颈在宿主锁与 pnpm，队列深度 1→2 的净收益接近 0。

抢锁超时被视为「请求没发出去」，在队列排空后自动重试一次（对应 §4 验收标准 3）。

### 不做
- 真并行 `updateBundle`（锁串行 + 120 s 超时风险，实测单次 3–6 分钟，不可行）。
- 修改宿主 pnpm 行为、网络层修复（环境问题，另行报告）。

## 4. 验收标准

1. 补读并行：新 harness 用可注入延迟模拟 4 个失败重读，断言总耗时 ≈ 最慢单次（重叠发生）而非累加。
2. 流水线：新 harness 断言第 N+1 个 `updateBundle` 在第 N 个完成前已发出、in-flight ≤ 2。
3. 文案：锁超时错误显示新文案；行内耗时与汇总耗时出现。
4. 回归：`node --test test/*.test.mjs` 全绿（现有 34 条 + 新增 ≥ 3 条）；真机一键更新跑通且逐项耗时可见。
5. 不回归：版本选择、悬停说明、取消、失败重试等既有行为不变。

## 5. 宿主需求（记录，不在本 PRD 实现）

`pluginManager` 新增批量接口（如 `updateBundles(entries[])`）：单次 pnpm 操作内完成多个包的 remove+install，避免 N 次全量重解析。本插件预留探测（方法存在即自动使用），宿主不支持时维持现状。
