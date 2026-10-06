# FIX -- Boss 受击血包与血量调整

## Status: done
## Task: 232
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
Boss 每次有效受击以 1/3 概率掉落血包，最大血量减半。

## Root Cause
src/sim/sim-world.ts 原先只在死亡清理时判定掉落；src/config/boss-rules.ts 的血量为 Tibo 7400、Sam 10500。

## Fix Plan
- [x] 血量调整为 Tibo 3700、Sam 5250。
- [x] 使用有效受击 tick 与确定性随机判定掉落，沿用 10～30 点回复量；Boss 不再额外进行死亡掉落判定。
- [x] 在已有血包测试中覆盖存活受击掉落、无新命中不重复掉落和种子复现。

## Verification
- [x] 修改前血包测试失败：存活受击不掉落，死亡仍额外掉落。
- [x] npm run typecheck：通过。
- [x] node --test test/health-pack.test.ts：5 项通过。
- [x] npm test：1760 项通过，0 失败。
- [x] npm run build：通过，存在分块体积与插件耗时提示。
- [x] diff-guard 检查：对比修改前文件快照，仅涉及本次需求；没有新增防御检查或实现细节测试。

未进行浏览器人工验收；未提交、推送。
