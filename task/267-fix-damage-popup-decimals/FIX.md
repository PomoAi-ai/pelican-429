# FIX -- 伤害飘字浮点尾数

## Status: done
## Task: 267
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
Boss 战斗中的扣血数字出现 .999999 等浮点尾数。

## Root Cause
src/ui/hud.ts:283 — 血条已格式化为两位小数，但共享伤害飘字直接插值原始 damage，Boss 减伤倍率计算的浮点误差被展示出来。

## Fix Plan
- [x] 伤害飘字保留最多两位小数，整数不补零；不改变实际伤害与血量计算。
- [x] UI 格式化改动不新增自动测试。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 1787/1787 通过
- [x] npm run build — 通过，存在构建耗时及大 chunk 提示
- [x] diff-guard 检查本次改动 — 仅一行展示格式化，无新增防御逻辑或测试

未进行浏览器人工验收；子代理只读核对确认其他实战血条均已限制小数位。未提交或推送。
