# FIX -- 场景工具栏合行与地图性能面板恢复

## Status: done
## Task: 430
## Related: 427
## Baseline Commit: 64ef4a38a9a5f9b2a97c97ea573b69729aeea260

## Problem
- 完整场景演示缺少性能面板、地图入口。
- 场景标题与世界/天气、住宅操作分为两行，占用演示画面。
- 背景分层展开继承旧侧栏样式，未作为悬浮面板。

## Root Cause
- scene-workspace.ts 另建世界控制 header，住宅/其他演示各自仍有工具栏。
- residence-app.ts、scene-demo-stage.ts、facility-app.ts 未装配已有性能/地图组件。
- residence.css 的 .residence-demo .city-layer-controls > div 采用 position: static，与新横排工具栏不匹配。

## Fix Plan
- [x] 场景公共控制合入当前场景工具栏，宽屏一行，窄屏仍为单行可横向浏览。
- [x] 背景、世界、天气使用悬浮面板，不被单行工具栏裁切；点击外部、Esc 关闭，同级面板互斥。
- [x] 住宅、九组演示、四机房复用真实性能统计与地图组件；支持按钮、既有快捷键、正确释放。
- [x] 住宅地图覆盖左右大世界、跟随玩家，建造变化后刷新；大地图先以玩家居中，再通过“全图”查看完整世界。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1913/1913 通过。minimap/perf-panel 定向测试 39/39 通过。
- [x] npm run build：通过，保留已有大 chunk 提示。
- [x] 浏览器验证合并工具栏、背景悬浮、性能真实统计、小/大地图、切场释放、宽窄窗口：住宅、植物组合、基础机房、上半砖透视；1700 与 820 宽下工具栏均为 52px，窄屏横向浏览；浮层在视窗内；地图支持负坐标院区、全图与 Esc；切场无重复性能面板；浏览器无 error。
- [x] diff-guard 检查仅本轮差异，git diff --check 通过；无新增依赖、静默兜底或源码匹配测试。

## Boundaries
- 本轮恢复性能统计及地图、修复控制面板布局；未做渲染性能优化。大窗口住宅验收中可见帧率波动。
- 建造后的地图刷新已接入原有碰撞更新路径；本轮未做持久化存档写入验收。
