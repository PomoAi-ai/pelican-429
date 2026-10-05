# FIX -- 游戏调试格子虚线

## Status: done
## Task: 037
## Related: N/A
## Baseline Commit: 无 HEAD；相关文件快照 $TMPDIR/pelican-grid-before

## Problem
游戏调试面板需要可开关的真实瓦片虚线网格。

## Root Cause
现有设置表包含性能面板和假人射击，游戏没有瓦片网格覆盖层。

## Fix Plan
- [x] 新增世界整数坐标虚线覆盖层，使用游戏镜头，关闭时不绘制并正确释放资源。
- [x] 设置表、运行时与持久化共用既有设置流程，默认关闭。
- [x] 同步现有设置测试夹具与切换保存用例。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 实际页面打开调试选项并确认虚线显示/隐藏。

## Results
- npm run typecheck、npm run build 通过；构建保留既有大 chunk 提示。
- npm test：1485/1485 通过，0 失败；设置相关21项通过。
- 浏览器实际验证打开/关闭、刷新保持开启；当前页面保留调试面板及网格效果。
- 子代理完成设置运行时和持久化接线，主代理核对diff和资源释放；未发现新增吞错或内部冗余校验。
- 截图：会话artifact目录 debug-tile-grid.png。
