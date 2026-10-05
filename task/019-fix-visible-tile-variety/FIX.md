# FIX — 单格地形自身的可见变化

## Status: done
## Task: 019
## Related: 017
## Baseline Commit: 无 HEAD；快照 $TMPDIR/pelican-019-before/

## Problem
四张草地单格主要区别在附着花草，泥土和草皮本身在实际卡片尺寸下过于接近。

## Root Cause
共享泥土纹理依赖低对比细颗粒和很小的卵石，缩小后被过滤；草边深度范围窄，圆角轮廓变化幅度小。

## Fix Plan
- [x] 在游戏共享纹理中增强泥土团块、可辨认的石粒与草皮厚薄起伏。
- [x] 最终选择只调整纹理；轮廓与碰撞偏差保持现有规则，避免仅为增加差异扩大几何偏差。
- [x] 结合 020 浏览器对比单格与连续地面；仅瓦片模式可看到草皮薄厚及泥土斑块区别。

## Verification
- [x] npm run typecheck：通过（与 020 合并验证）。
- [x] npm test：1471 项通过；已有 render-textures 9 项定向通过。
- [x] npm run build：通过，现有主包体积提示保留。
- [x] 浏览器画面与独立审查通过；渲染变化未新增自动测试。
