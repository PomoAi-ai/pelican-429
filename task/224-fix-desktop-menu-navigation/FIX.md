# FIX -- PC 菜单按钮展开顶部导航

## Status: done
## Task: 224
## Related: 217, 222
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
PC 游戏菜单按钮只展开操作面板，顶部导航仍需另一处把手操作。

## Root Cause
src/ui/control-surface.ts — 菜单与 game-navigation 使用独立的展开状态。

## Fix Plan
- [x] PC 菜单与顶部导航联动，单击展开；再次单击或回到画面后一起收起。
- [x] PC 隐藏重复的中央把手，移动布局保留把手；聚焦菜单释放游戏按键。
- [x] 主线、自由世界及测试关卡复用同一顶部导航，主线语言选择器随导航收起，序章不显示把手。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1758 个测试通过，0 失败。
- [x] npm run build — 通过，保留现有大 chunk 提示。
- [x] 浏览器验证 PC 菜单展开、关闭及回到游戏收起；自由世界、主线和移动布局把手均通过。
- [x] diff-guard 复核本次增量，git diff --check 通过；子代理复核发现的序章语言入口问题已修复并复核通过。

UI 交互按仓库约定不新增自动测试；未提交或推送。
