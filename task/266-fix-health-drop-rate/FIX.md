# FIX -- 普通敌人血包掉落率提高至 45%

## Status: done
## Task: 266
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
用户要求将普通敌人血包掉落率调整为 45%。

## Root Cause
src/sim/sim-world.ts:644 — 普通敌人死亡掉落判定阈值原为 0.3。

## Fix Plan
- [x] 普通敌人掉落阈值改为 0.45。
- [x] 更新已有概率行为用例，并拉开怪物间距，避免附近补给上限干扰概率统计；该用例可检出掉落率退回 30% 的回归。
- [x] Boss 掉落率、治疗量与附近补给限制保持原有规则。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1787 个测试全部通过。
- [x] npm run build — 默认输出目录清理遇到 dist/characters ENOTEMPTY；改用 npm run build -- --outDir /tmp/pelican-health-drop-build 验证通过，仅有构建性能与大 chunk 提示。
- [x] 按 diff-guard 检查本次改动，无新增防御性逻辑或低价值测试。
