# FIX -- 缩小小地图

## Status: done
## Task: 142
## Related: 130
## Baseline Commit: e5fb3bf

## Problem
右上小地图占据过多画面。

## Root Cause
src/ui/minimap.ts 默认宽高使用视口25%。

## Fix Plan
- [x] 默认宽高缩为视口18%，保持相同比例和自适应画布。
- [x] 菜单位置随地图底边上移，既有尺寸断言同步。

## Verification
- [x] npm run typecheck通过；node --test test/minimap.test.ts 32/32通过
- [x] 浏览器1280×720下地图230.4×129.6，保持16:9；截图preview.png。此次仅复跑受影响检查，未重复上一轮全量测试及构建。
- [x] diff-guard：只有尺寸调整，无新增防御代码或测试。
