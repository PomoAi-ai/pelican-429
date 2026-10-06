# FIX -- NPC 巡逻多方向站姿

## Status: verifying
## Task: 256
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
NPC 巡逻停留朝向单调。

## Root Cause
src/entities/wanderer.ts 只选择正面和左右三个方向；共享姿态使用普通角度插值。

## Fix Plan
- [x] 扩展为八方向待机，沿最短角度平滑转身；保持行走及招呼朝向。
- [x] 游戏与展示场继续共用姿态模块。

## Verification
- [x] 新行为用例修改前失败，修改后 `node --test test/free-world-npcs.test.ts` 3/3 通过。
- [x] `npm run typecheck` 通过。
- [x] `npm run build` 通过（有 chunk 大小告警）。
- [x] 按 diff-guard 检查本次改动，无新增防御性检查或低价值测试。
- [ ] `npm test`：1775/1779 通过；4 项失败属于未修改的战斗命中、瓦片构建调度及场景 draw call 预算路径，不涉及本次 NPC 待机朝向。未修改这些用例或断言。
  - game-audio-cues：互击预期 [28,48]，实际 [48]。
  - render-integration：两项区块构建数量预期 4/9，实际 1/2。
  - render-world-views：draw call 198 超过预算 180。
- 渲染效果由用户在浏览器验收，不新增渲染自动测试。
