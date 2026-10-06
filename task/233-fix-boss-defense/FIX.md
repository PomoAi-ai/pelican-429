# FIX -- Boss 防御降低一半

## Status: done
## Task: 233
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
两种 Boss 的防御效果降低一半。

## Root Cause
src/config/boss-rules.ts:31、38 配置的是承伤倍率；src/combat/combat-system.ts:118 将其乘入伤害，不能将倍率直接减半，否则会加强防御。

## Fix Plan
- [x] 霸体减伤 50% → 25%，承伤倍率 .5 → .75。
- [x] 玩家大招减伤 60% → 30%，承伤倍率 .4 → .7。
- [x] 保留韧性、硬直免疫与既有乘法叠加规则；仅调整配置，不新增复述常量的测试。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1760 项通过，0 失败。
- [x] npm run build：通过，存在分块体积与插件耗时提示。
- [x] diff-guard 检查：生产代码只改两处减伤配置，无新增逻辑、校验或测试。

未进行浏览器人工验收；未提交、推送。
