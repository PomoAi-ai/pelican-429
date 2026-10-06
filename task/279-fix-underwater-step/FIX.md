# FIX -- 陆地与水底双向自动踏上一格台阶

## Status: done
## Task: 279
## Related: 275
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
水底前进被一格高台阶挡住。要求陆地和水底按左右均可自动踏上一格，水底贴地使用行走状态。

## Root Cause
player.stepUp 与 Body 的抬升上限都为半格；共享碰撞据此把一格台阶判为墙。角色状态在判断着地前优先使用 swim，贴底仍显示游泳。

## Fix Plan
- [x] 玩家自动抬升高度与配置边界改为一格；向下吸附保持半格。
- [x] 复用现有双向踏阶、净空和墙体碰撞，不引入水底专用碰撞。
- [x] 着地优先使用 idle/run，离底仍使用游泳。
- [x] 行为用例覆盖双形态、陆地/水底、左右、一格台阶/两格墙/低天花板。
- [x] 原半格抬升能力测试显式使用半格配置；更新配置合法范围，删除直接断言默认 stepUp 字面值的旧断言。

## Verification
- [x] 回归用例修改前失败，调整后通过。
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] diff-guard
- [x] Bug is fixed

未提交或推送；浏览器手感待人工验收。

最终验证：npm run typecheck 通过，npm test 1791/1791 通过，npm run build 通过（仅 chunk 大小警告）。针对性检查 swim / physics-slopes / core / ride-probe 共 168/168 通过；diff-guard 无新增防御检查、无实现细节测试，git diff --check 通过。

子代理只读复核确认现有碰撞与净空检查可复用，并发现洞口生成骑行净空包络仍使用半格；已同步 CAVE_RULES.RIDE.stepUp=1，最终全量检查覆盖此修正。
