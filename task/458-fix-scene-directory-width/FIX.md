# FIX -- 收窄场景导航

## Status: done
## Task: 458
## Related: N/A
## Baseline Commit: c292d188ad690a076f771a59ff5c1953155827f9

## Problem
左侧场景导航对六字以内名称预留了过多宽度，挤占资源面板和画布。

## Root Cause
src/ui/scene-workspace.css:1 — 桌面导航固定宽 220px，小屏断点仍为 164px / 128px。

## Fix Plan
- [x] 导航收窄到桌面 140px、小屏 120px，同时减少左右内边距，保留长名称自然换行。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器确认六字场景名称完整显示、画布获得额外空间。
- [x] diff-guard 检查本次改动。

## Results
桌面导航减少 80px；浏览器确认“植物空间组合”“同种树的变化”“山体算力堡垒”等六字标题单行显示。typecheck 通过，1958 项测试全部通过，build 通过（保留已有 chunk 体积提示）。纯 CSS 调整未新增自动测试；小屏未做实机验收。未提交或推送。
