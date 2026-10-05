# FIX -- Tibo 午餐薯条助威文字

## Status: done
## Task: 110
## Related: 104
## Baseline Commit: 无 HEAD；本次修改前文件保存在 $TMPDIR/tibo-lunch-line-baseline/npc-effects.ts

## Problem
Tibo 薯条攻击需要弹出「我午餐吃了薯条。」。

## Root Cause
src/render/npc/npc-effects.ts:180 — 共享薯条攻击效果中的第一条文字仍是「先来根薯条。」。

## Fix Plan
- [x] 替换第一条助威文字，并适当加宽气泡，沿用原有出现时间、漂浮和淡出动画。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1527/1528 通过；同时存在三套全量测试时，worldgen 性能用例中位数 456.7ms 超过 250ms。待其他测试退出后，仅复查 node --test test/worldgen.test.ts，29/29 通过，包括性能用例；未改代码或断言。
- [x] npm run build — 通过，仅已有的 chunk 大小提示。
- [x] 浏览器检查攻击中的完整文字和控制台 — 文字完整显示，控制台 warn/error 为空，截图见 evidence/lunch-line.png。
- [x] diff-guard 检查本次差异 — 子代理确认生产代码仅一行文案与宽度调整，无问题。

文案与渲染调整不新增自动测试，浏览器验收显示效果。
