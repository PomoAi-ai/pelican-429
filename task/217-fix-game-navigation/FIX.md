# FIX -- 游戏顶部自动收起与紧凑设置入口

## Status: done
## Task: 217
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
游戏中顶部导航与自由世界工具条占用画面；右上设置按钮过大。

## Root Cause
- src/main.ts — 游戏入口始终展示开发导航，没有收起入口。
- src/ui/free-world.css — 顶部及 HUD 占位写死为 100px。
- index.html:157 — 设置按钮视觉尺寸为 44px。

## Fix Plan
- [x] 使用原生 details/summary 收纳原有导航和世界工具条，默认关闭；点击或聚焦游戏画布后收起。
- [x] 收起时同步释放顶部占位，保留居中的悬浮导航把手。
- [x] 设置按钮缩至 28px，保留 44px 点击区域。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1756 通过、0 失败。
- [x] npm run build — 通过，保留既有大 chunk 提示。
- [x] 浏览器验证默认收起、展开、返回游戏收起、空格操作和设置入口。
- [x] diff-guard 检查本次增量；子代理发现的按键释放问题已修复，复核通过。

UI 改动按项目约定不新增自动测试。保留工作区已有改动，不提交或推送。
