# 需求总表

本表把插件从第一版到现在的全部需求固化下来，每条给出「要什么 → 落在哪里 → 怎么验证 → 从哪个版本可用」。
新提需求请追加新行，不要改写后面已交付的行。

- 插件：`dsh-plugin-update-entry`（DSH Web 端 `/plugins` 页的更新入口）
- 覆盖版本：`1.0.0` → `1.0.5`
- 验证方式统一是 `node --test test/*.test.mjs`；标「真机」的条目另有 `.scratch/shot/` 下的浏览器探针记录

## 一、入口与展示

| # | 需求 | 实现位置 | 自动化验证 | 版本 |
| --- | --- | --- | --- | --- |
| R1 | 可更新插件的更新入口放在官方开关**之前**，不挤占官方 36px 进度区 | `client.js` `mountCard`：`end.insertBefore(slot, end.firstElementChild)` | `harness-real.mjs`（`beforeSwitch`、`order`）、`harness-served.mjs` | 1.0.0 |
| R2 | 只有真正「可更新」的卡片才挂按钮（按 8 种语言的徽标文案识别），其它卡片不出现入口 | `client.js` `isUpdatableCard` / `BADGE_TEXT` | `harness-real.mjs` | 1.0.0 |
| R3 | React 重建卡片节点后按钮自愈；卡片离开 DOM 即移除 | `MutationObserver` + rAF 合并扫描 + `mountCard` 重挂 | `harness-bulk`（重建段）、真机 | 1.0.0 |
| R4 | 工具栏常驻「一键更新」按钮：没有官方提示节点时也留在工具栏，而不是消失 | `client.js` `ensureBulkButton`（有 note → `note.after`；无 note → `toolbar.insertBefore`） | `harness-bulk-nonote.mjs` | 1.0.1 |

## 二、版本与更新说明

| # | 需求 | 实现位置 | 自动化验证 | 版本 |
| --- | --- | --- | --- | --- |
| R5 | 多版本时可像详情页一样选版本（含 prerelease 折叠） | `bulkVersionsNode` + `applyBulkList` | `harness-bulk.mjs`（`retarget`）、真机 | 1.0.0 |
| R6 | 每个版本悬停即看该版本的 GitHub Release 说明，离开即消失 | `notesBubble` + `matchRelease` / `repoFromUrl` | `harness-real`/`harness-bulk`（`hover`）、真机（读到真实正文 604–2973 字符） | 1.0.0 |
| R7 | 说明过长时渐隐而不是硬截断 | `markScrollable(bubble)` + `mask-image` | 真机 | 1.0.0 |

## 三、检查与列表

| # | 需求 | 实现位置 | 自动化验证 | 版本 |
| --- | --- | --- | --- | --- |
| R8 | 一键更新面板列出全部可更新插件，读取失败的行显示「重试」，且不阻断按钮 | `primeBulkVersions` / `bulkFootNodes` | `harness-bulk-filters.mjs` | 1.0.0 |
| R9 | 注册表没返回新版本的包**不占一行**（不再谎报「已是最新版本」），空答案不写缓存 | `bulkRows` + `primeBulkVersions` 的空答案判断 | `harness-bulk-filters.mjs`、`pure.test.mjs` | 1.0.0 |
| R10 | 适配宿主 0.2.2-rc.3 的字段改名：`updatable:true` 消失，改用 `update:'registry'` | `client.js` `updatableBundles`（双形状判断） | `harness-bulk.mjs` | 1.0.1 |
| R11 | 无可用 profile（`managementAvailable !== true`）时先拦：显示只读提示与「重新读取」，一个 `listBundles` 都不发 | `inventoryAvailable()` 门禁 | `harness-bulk-gate.mjs` | 1.0.2 |
| R12 | 适配 0.2.2-rc.2 / rc.5 的 CSS module 前缀与徽标类名变化（`w6M7KW_` / `X_2TxG_` / `_tag_brmue_4`） | `BADGE_SELECTOR`、`PUE_PREFIX`/`PUE_BADGE_CLASS` 注入 | `harness-real.mjs` + `dom.test.mjs` 两组前缀用例、`engines.test.mjs` | 1.0.0 / 1.0.3 |

## 四、执行与取消

| # | 需求 | 实现位置 | 自动化验证 | 版本 |
| --- | --- | --- | --- | --- |
| R13 | 可勾选想更新的插件（部分更新），支持全选/全不选；未勾选的显示删除线并在汇总里点名 | `bulkItemNode` 的 `.pue-bulk-check`、`bulkTargets`、`bulkFootNodes` | `harness-bulk-stop.mjs`、`pure.test.mjs`（`bulkTargets`） | 1.0.4 |
| R14 | 停止要看得见：显示「正在停止，等 X 装完就停」，停止按钮变灰；已停止/未勾选的行分别标注 | `bulkFootNodes` running 分支 + `runBulk` 的 `item.stopped` / `item.skip` | `harness-bulk-stop.mjs` | 1.0.4 |
| R15 | 跑完之后点一次工具栏按钮就能重新检查（不再需要点两次） | `restartBulk()` + 工具栏 `onclick` 的 `done` 分支、`bulkFootNodes` 的「重新读取」 | `harness-bulk-stop.mjs`（`7 restart`） | 1.0.4 |

## 五、速度与可预期（PRD `docs/PRD-parallel-update.md`）

| # | 需求 | 实现位置 | 自动化验证 | 版本 |
| --- | --- | --- | --- | --- |
| R16 | 运行前的版本补读并发 4 路，不再一个个往返 | `mapLimit(unread, BULK_READ_LIMIT, …)` | `harness-bulk-speed.mjs`（`1 peakReads 4`） | 1.0.5 |
| R17 | 安装过程可见：行内与页脚逐秒计时，超过 90 s 追加「宿主正在安装，网络慢时会更久」 | `tickBulkClock` / `syncBulkClock` / `data-elapsed` | `harness-bulk-speed.mjs`（`2 elapsed`、`2b foot`） | 1.0.5 |
| R18 | 完成汇总里每项带实际耗时（不足 1 s 不显示） | `bulkDoneNodes` 的 `.pue-bulk-took` | `harness-bulk-speed.mjs`（`3b took`） | 1.0.5 |
| R19 | 页脚给预期时长：有样本用中位数「约 N × Xs」，没样本说明首次之后才有 | `estimateEach()` / `noteDuration()` | `harness-bulk-speed.mjs`（`5 eta`） | 1.0.5 |
| R20 | 抢锁超时（`atomic-write: timed out waiting for the writer lock`）不当失败：提示「上一次更新仍在进行」，并在队列排空后自动重试一次 | `lostLock` 队列 + `userMessage` 的 `FALLBACK_LOCKED` | `harness-bulk-speed.mjs`（`4 locks`） | 1.0.5 |

### 与 PRD 的差异（有意为之）

PRD P0-2 原本设想「in-flight ≤ 2 的受限流水线」，实现时改为**安装串行（`BULK_UPDATE_LIMIT = 1`）**，理由有三条硬证据：

1. `updateBundle` 的 pnpm 全程在 `withFileLock(profile/package.json)` 内，而宿主 `lockWaitMs` 默认 `120e3`；实测单次安装 3–6 分钟 > 120 s，第二个请求不会并发、只会锁超时失败。
2. 限 1 才能让 R14 的「停止」成立：并发的第二个安装已经在飞，停止也拦不住。
3. 只要版本读取已经是 4 路并发（R16），安装阶段的墙钟瓶颈在宿主锁与 pnpm，把队列深度从 1 加到 2 的净收益接近 0。

## 六、分发

| # | 需求 | 状态 |
| --- | --- | --- |
| R21 | GitHub Release 每次带 `npm pack` 产物 + 固定名 `dsh-plugin-update-entry.tgz`（供市场浮动跟踪） | 已完成（v1.0.0–v1.0.5） |
| R22 | npm 通过 Trusted Publishing（OIDC，`release.yml`）发布，不需要手工 2FA | 已完成（1.0.2 起） |
| R23 | 目录条目里 `tarball` 用 `releases/latest/download/dsh-plugin-update-entry.tgz` 浮动写法 | 已推 fork 分支 `rename/createjy-update-entry`，上游 PR 待开 |
