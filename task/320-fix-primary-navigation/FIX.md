# FIX -- 游戏入口提升为一级导航

## Status: done
## Task: 320
## Related: 318-unified-navigation
## Baseline Commit: 2a5455a964e5b71781c766c36abb5245c5f3e903

## Problem
重头开始、自由世界、继续游戏、手机操控应为一级菜单。

## Root Cause
共享导航将重头开始、自由世界、手机操控放在资源下拉菜单内。

## Fix Plan
- [x] 三个链接移至顶部，继续游戏保留一级入口；手机四项直接排列。
- [x] 目录页和游戏导航面板继续复用完整链接。

## Verification
- [x] npm run typecheck：通过
- [x] npm test：1808/1808通过（子代理执行）
- [x] npm run build：通过，仅既有大包提示
- [x] 浏览器桌面、390px中文和320px英文导航通过；资源菜单内不再重复三个一级入口。
- [x] diff-guard：不新增防御逻辑和UI自动测试。
