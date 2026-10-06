# FIX -- 玩家踩踏无人机

## Status: verifying
## Task: 202
## Related: N/A
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
玩家从无人机顶部落下应造成伤害。

## Root Cause
src/entities/enemy.ts:58 — 无人机不参与实体推挤碰撞；模拟层现有命中源没有玩家脚底跨越无人机顶部的判定。

## Fix Plan
- [x] src/config/tuning.ts — 配置踩踏伤害 18，复用命中定义校验。
- [x] src/sim/sim-world.ts — 按相对运动交点识别顶部踩踏，优先最近接触，复用受击结算并让玩家反弹；反弹高度复用玩家跳高。
- [x] test/enemy.test.ts — 双形态踩踏、击杀、单次接触、侧碰及下方接触回归覆盖。修复前复现无人机血量未下降。

## Verification
- [x] node --test test/enemy.test.ts — 59/59 通过
- [x] npm run typecheck — 通过；修正新增测试的事件类型收窄后复查通过
- [ ] npm test — 1731/1732 通过；唯一失败为 test/worldgen.test.ts 的世界生成性能阈值，中位数 578.6ms > 250ms。单独复测同一用例仍失败（943.6ms）。本次未修改世界生成实现、配置或性能断言；完整验证因此仍未通过。
- [x] npm run build — 通过；存在 chunk 大小和插件耗时提示
- [x] diff-guard 审查本次增量 — 子代理只读审查通过，无需修改
- [x] Bug is fixed — 新增行为回归 2/2 通过，人形和鹈鹕均可踩伤/踩死无人机并反弹，侧碰和下方接触无伤害。

浏览器内手感尚未人工验收；未提交或推送。保留 verifying 状态以反映全量性能检查未通过。
