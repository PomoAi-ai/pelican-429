# FIX -- 死亡后取消入场提示

## Status: verifying
## Task: 283
## Related: 278
## Baseline Commit: 8a8fe8c

## Problem
死亡复活后不再显示入场技能提示。

## Root Cause
入场提示等待首次落地时仅跳过复活等待帧，没有取消尚未触发的提示；首次落地前死亡会使提示延迟至复活落地。

## Fix Plan
- [x] 检测到死亡复活状态即取消待显示提示，正常首次落地提示保留。

## Verification
- [x] npm run typecheck
- [ ] npm test
- [x] npm run build
- [x] diff-guard：仅修改提示状态，不新增 UI 自动测试。

## Results
提示状态修改完成；仅改 src/ui/story-intro-hud.ts，死亡复活期间取消 pending，已显示过的提示原本也不会重开。
类型检查、构建、diff whitespace 检查通过。全量 1793 项中 1790 通过，3 项失败为 cave-ride、terrain-compositions、worldgen-compositions 的地形通行/骑乘断言；这些测试仅走逻辑层，不依赖本次 UI 模块，未改动相关代码和断言。因全量未通过保持 verifying。未新增 UI 自动测试，本次未重跑浏览器验收。
