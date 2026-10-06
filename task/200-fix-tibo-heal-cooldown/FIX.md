# FIX -- Tibo 额度返场回血改为 50 秒间隔、随机回复量

## Status: verifying
## Task: 200
## Related: N/A
## Baseline Commit: 3a35077（工作区含用户未提交改动）

## Problem
Tibo 的“额度返场”整场只能回血一次，固定回复 12%。需求：回血可重复，间隔 50 秒；每次回复随机血量。

## Root Cause
src/entities/boss.ts — `healAvailable` 是一次性布尔值，开始施放时清掉且不再恢复；回血时固定加 `maxHp * .12`。

## Fix Plan
- [x] src/config/boss-rules.ts — 新增 `TIBO_HEAL`：冷却 3000 tick（50 秒），回复 8%–14% 最大生命，并加启动校验
- [x] src/entities/boss.ts — `healAvailable` 改为 `healCooldownTicks`：每 tick 递减；施放即进入完整冷却，被打断同样计入；首次可用条件仍为生命 <75%；回复量由 `hashU32` 确定性生成
- [x] src/sim/mainline-progress.ts — 存档字段 `healAvailable` 不变，含义改为“冷却就绪”；读档时若未就绪，按完整冷却重新计时（与闪现冷却不入档一致）
- [x] test/boss.test.ts、test/mainline-progress.test.ts — 跟随字段改名；回血用例改为断言：冷却期间不再回血，冷却结束后能再次回血

## Verification
- [x] npm run typecheck
- [ ] npm test — 1730 个用例中 1729 个通过；唯一失败的是 worldgen「生成耗时中位数 < 250ms」，单独重跑仍失败。最快一次采样 143ms，中位数 902ms；当时机器负载约 175。src/world 不依赖本次改动，待机器空闲时重跑确认
- [x] npm run build
- [x] Bug is fixed（test/boss.test.ts：受击打断仍消耗冷却；回复比例在 8%–14% 内；冷却期间不再回血，冷却结束后能再次回血）
