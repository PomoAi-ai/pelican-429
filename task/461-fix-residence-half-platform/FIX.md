# FIX -- 门口外侧半格使用平台

## Status: done
## Task: 461
## Related: 460
## Baseline Commit: c292d188ad690a076f771a59ff5c1953155827f9

## Problem
门口外侧半格应为平台，上一版使用上半砖和四分之一砖构成接头。

## Root Cause
src/sim/residence.ts:305 — 默认布局使用实体上半砖覆盖完整门槛格，内侧又用四分之一砖续接立柱。

## Fix Plan
- [x] 两端门槛改用原有半宽立柱与外侧半宽平台组合，移除接头的上半砖和四分之一砖，顶面保持 Y=8；右端镜像。

## Verification
- [x] npm run typecheck — 通过。
- [x] node --test test/residence.test.ts — 43 项通过，左右穿门和落脚高度均通过。
- [x] npm test — 1958 项通过。
- [x] npm run build — 通过，现有大分包提示仍在。
- [x] 浏览器核对平台与立柱接头 — 左外侧半宽平台连续接入原门外平台，内侧半宽柱体贯通，顶面齐平；无控制台 error。截图见 evidence/half-platform.png。
- [x] diff-guard 核对本次修改 — 仅改默认装配，不增加新规则、校验或重复测试；git diff --check 通过。
