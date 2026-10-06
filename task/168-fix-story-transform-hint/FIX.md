# FIX -- 主线变身解锁提示

## Status: done
## Task: 168
## Related: 164
## Baseline Commit: 3a35077

## Problem
主线击败Tibo前，变身按钮需要显示锁定，点击明确提示解锁条件。

## Root Cause
sim-world丢弃未解锁transformPressed但不发反馈事件，weapon-hud也没有接收主线解锁状态。

## Fix Plan
- [x] 复用transformBlocked事件新增story原因，键盘与按钮统一反馈。
- [x] HUD接入已有mainlineTransformUnlocked，锁定时保留点击提示、解锁后恢复切换，支持中英文。
- [x] 沿用已有主线测试验证事件只随操作触发，不新增UI自动测试。

## Verification
- [x] npm run typecheck
- [x] npm test：1675/1676通过；唯一世界生成性能用例受并行运行影响超时，独立重跑1/1通过
- [x] npm run build
- [x] 浏览器点击锁定按钮提示，Tibo后切换，diff检查

- 修复前主线事件用例红灯，修复后`node --test test/mainline.test.ts test/weapons-render.test.ts test/player-transform.test.ts` 28/28通过。
- localhost隔离实测：锁定按钮置灰但能点击弹出解锁条件；countdown阶段按钮恢复正常，点击进入切换动画。临时存储已清理，未改用户127.0.0.1存档。
- Diff Guard：变更复用事件与解锁函数，无新增防御性检查或UI自动测试。
- 全量日志`/tmp/pelican-transform-test.log`；唯一失败为世界生成中位耗时617.7ms，未改断言，`node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts`独立复核通过。未重复全量。
