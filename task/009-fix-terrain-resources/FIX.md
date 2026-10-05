# FIX -- 补齐地形瓦片与自然花草

## Status: done
## Task: 009
## Related: 006
## Baseline Commit: 仓库无 HEAD；仅修改此次遗漏涉及的展示场文件。

## Problem
资源目录遗漏泥土、草地等基础瓦片，默认纯资源模式隐藏地形，花草只显示单独摆放的模型。

## Root Cause
- src/render/resource-catalog.ts：目录没有地形瓦片，自然地被也没有入口。
- src/ui/showcase-model.ts：默认 context=false 隐藏地面。
- src/app/showcase/resource-scenario.ts：沿用角色夹具的纯泥土顶层，未使用 TILE_GRASS，无法触发正式 tile-view 中的草皮/花草规划。

## Fix Plan
- [x] 目录加入地形瓦片和自然花草，默认展示连片草地；保留已有单件检查。
- [x] 场景地表使用游戏草地瓦片，地形材质使用正式瓦片 ID，直接由 createWorldViews → createTileView → planFlora/planCover 生成。
- [x] 默认场景模式，连片预览保留必要地面，增加可选瓦片网格。
- [x] 更新真实缩略图和使用说明。

## Verification
- [x] 缺陷回归：默认地表草地、泥土变体、地下不擅自长地表花草。
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器确认真实泥土、草皮、小花小草、网格及原资源。

## Results
- 缺陷回归先失败于默认 context=false，修复后同主题 10 项测试通过。
- `npm run typecheck` 通过。
- `npm test`：1461 项通过，0 失败、0 跳过。
- `npm run build` 通过，保留已有大包体提示；本次另有构建插件耗时提示。
- 浏览器：草地附着花草、裸泥土网格、自然花草与雏菊切换、地下不生成地表花草、缩略图加载均已检查，未出现控制台错误。
- 没有新增渲染/UI 自动测试；未改动游戏瓦片、植被工厂或 vendor。已有单件模型检查继续可用。
- 2026-10-04 完成；未提交或推送。
