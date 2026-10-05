# FIX -- 鹈鹕走路时翅膀黑影

## Status: done
## Task: 087
## Related: N/A
## Baseline Commit: 无 HEAD；仓库文件全部未跟踪

## Problem
走路时对向翅膀出现过黑的阴影，羽毛层次不自然。

## Root Cause
`src/app/scene-wiring.ts` 把所有鹈鹕网格强制设为投射阴影，覆盖了模型对墨线等部件的逐项设置；摆动时对向翅膀的墨线参与投影。

## Fix Plan
- [x] 保留共享模型各部件原有的投影设置。

## Verification
- [x] `npm run typecheck`
- [x] `node --test test/pelican-view.test.ts`
- [x] `node --test --test-concurrency=4 "test/**/*.test.ts"`（1532 通过）
- [x] `npm run build`
- [x] 浏览器检查展示场走路时左右朝向翅膀
