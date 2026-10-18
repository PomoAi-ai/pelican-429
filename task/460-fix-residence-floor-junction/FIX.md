# FIX -- 住宅二层门口混合格接头

## Status: done
## Task: 460
## Related: N/A
## Baseline Commit: c292d188ad690a076f771a59ff5c1953155827f9

## Problem
二层左右门口仍采用整砖，厚于相邻上半砖楼板，左侧出现突兀的整块蓝色凸出。

## Root Cause
src/sim/residence.ts:305 — 默认布局在楼板两端省略上半砖，另用整砖补齐门下位置，尚未应用已有的同格混合规则。

## Fix Plan
- [x] src/sim/residence.ts — 白色上半砖延至两侧门槛；左端下方使用深蓝合金右下四分之一砖，右端使用暖白岩板左下四分之一砖；保持普通深度与落脚高度。
- [x] 示例使用新布局，保存的玩家住宅不自动改写。

## Verification
- [x] npm run typecheck — 通过。
- [x] node --test test/residence.test.ts — 43 项通过；包含两侧自动穿门、外侧平台承托和门槛连续落脚。
- [x] npm test — 1958 项通过。
- [x] npm run build — 通过；保留现有大分包提示。
- [x] 浏览器检查左右接头与控制台 — 两侧楼板连续，外侧下四分之一留空；无 error 日志。左侧截图见 evidence/left-junction.png。
- [x] diff-guard 检查本次差异 — 仅修改默认布局及说明，未增加校验、兼容分支或镜像实现的测试；git diff --check 通过。
