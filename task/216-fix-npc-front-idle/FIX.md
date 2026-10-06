# FIX -- NPC 正面站立

## Status: done
## Task: 216
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
NPC 待机站立时需要面向镜头。

## Root Cause
src/render/npc/npc-pose.ts 的 targetYaw — 原共享姿态模块对所有动作使用左右侧向角度，待机也始终侧身。

## Fix Plan
- [x] src/render/npc/npc-pose.ts — 待机目标角度改为正面，其余动作保留左右朝向，复用现有平滑转身。游戏、展示场及两种形态共用该逻辑。
- [x] 后续核对：地面待机保留正面朝向，飞行时保留左右朝向；居民、Boss 战后变身与展示场仍通过共享动画模块采样。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1755 个测试全部通过，约 97 秒；首次运行手动中断，完整重跑通过。
- [x] 后续复核当前代码：npm run typecheck、npm test（1756 个测试，约 39 秒）、npm run build 均通过。
- [x] npm run build — 通过，有构建分块体积提示。
- [x] node --test test/character-model.test.ts test/free-world-npcs.test.ts — 4 个测试通过。
- [x] 浏览器确认 Sam / Tibo 正面待机，Sam 人形行走仍侧向。
- [x] 按 core-dev / core-test 执行；渲染姿态调整不新增自动测试。
- [x] diff-guard 检查：仅修改目标朝向，无新增兜底、内部校验或测试。
