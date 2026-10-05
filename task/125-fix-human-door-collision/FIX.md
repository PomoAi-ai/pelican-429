# FIX -- 主角通过房间门洞

## Status: verifying
## Task: 125
## Related: N/A
## Baseline Commit: 无提交

## Problem
人形无法进入三格门洞的房间。

## Root Cause
src/sim/player-transform.ts 使用包含发梢的 3.1 格模型高度作为碰撞高度，超过三格门洞。

## Fix Plan
- [x] 人形碰撞高度独立为 2.8 格，模型维持原尺寸。
- [x] 变身检查与正式角色展示场统一使用相同碰撞配置。
- [x] 新用例复现失败：人形无法穿过三格门洞；覆盖双向通行、传送及门内变身。
- [x] 原空间不足用例改用真正不足的2.5 格净高，保留阻挡验证。

## Verification
- [x] node --test test/player-transform.test.ts test/human-combat.test.ts：16 项通过。
- [x] 旧高度对照：3.1 格时移动 150 tick 仍卡在门外 x=10.6，新高度同场景可双向通过。
- [x] npm run typecheck：通过。
- [x] npm run build：通过，有包体大小提示。
- [ ] npm test：90 秒未完成，已终止；未取得全量结果，终止前未输出失败项。
- [x] diff-guard：无新增防御检查、静默兜底；新增测试直接验证正式模拟行为。
- [ ] 浏览器视觉验收未执行。
