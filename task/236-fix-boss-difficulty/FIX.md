# FIX -- 降低 Boss 战斗难度

## Status: done
## Task: 236
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
普通攻击占 Boss 血量比例过小，战斗耗时过长。

## Root Cause
src/config/boss-rules.ts 中 Tibo 3700、Sam 5250 血量使普通命中只削去约 0.27%；存档边界按当前最大血量校验，直接降血会使旧存档无法读取。

## Fix Plan
- [x] Tibo 3700 → 740、Sam 5250 → 1050，保留已有减伤、受击血包与复活进度规则。
- [x] 新存档使用版本 3；读取版本 2 时按旧上限校验并按剩余血量比例转换，保存后不重复缩减。
- [x] 用既有存档测试覆盖比例转换与重复保存加载。

## Verification
- [x] 修改前迁移测试失败：1850 未转换为 370。
- [x] npm run typecheck：通过。
- [x] node --test test/story-save.test.ts test/boss.test.ts test/mainline-progress.test.ts：42 项通过。
- [x] npm test：通过。
- [x] npm run build：通过，存在分块体积与插件耗时提示。
- [x] diff-guard 检查：子代理复核通过，迁移不会重复缩减，不会因旧血量超过新上限拒绝合理存档。

未进行浏览器人工验收；未提交、推送。
