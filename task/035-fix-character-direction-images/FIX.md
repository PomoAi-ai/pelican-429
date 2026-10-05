# FIX -- 角色展示场多方向图片

## Status: done
## Task: 035
## Related: 030-grassy-static-models, 034-fix-model-rotation
## Baseline Commit: N/A（尚无HEAD；相关文件快照 $TMPDIR/grassy-views-baseline）

## Problem
用户在角色展示场看不到完整的多朝向图片。

## Root Cause
- src/ui/character-assets.ts 默认选中角色卡，收起时隐藏分类入口；三档演示还默认收起全部图片区。
- 四方向参考为水平滚动排列，窄卡无法同时看到四个方向。
- src/config/character-assets.ts 和已生成渲染仅列出三分之四、正面、右侧、背面，缺少三档左侧渲染。

## Fix Plan
- [x] 人形默认展开四方向参考，收起图片仍保留分类入口，点击分类自动展开。
- [x] 四方向参考采用四列，窄屏两列，确保四个方向都在布局中显示。
- [x] 用同一 Blender 三档源与摄影棚补左侧渲染，保持几何和GLB不变；资源目录补齐15张模型图。
- [x] 更新SOURCE来源说明。

## Verification
- [x] npm run typecheck — exit 0；$TMPDIR/grassy-views-typecheck.log
- [x] npm test — 1485/1485通过，303 suites，34.28秒；$TMPDIR/grassy-views-test.log
- [x] npm run build — exit 0，1.16秒；仅既有大chunk提醒；$TMPDIR/grassy-views-build.log
- [x] 浏览器四方向默认四列可见、折叠后分类仍可用、点击分类展开、原图弹窗/翻页正常；三档左侧原图均loaded=true、900×1035；控制台无error。
- [x] 渲染子代理逐张视觉检查，Blender及3份GLB渲染前后SHA256一致；独立core-review/diff-guard复核Approved，未发现明确新问题。

不新增复述资源常量或UI结构的自动测试。保留角色模型自由旋转功能，不重建模型。

## Result
Grassy默认显示正面、背面、左侧、右侧四张参考图；三档模型各5张真实渲染，图片资源总数20（角色卡1、四方向参考4、模型多视图15）。分类按钮在收起后仍保留，可一键切换并展开。未提交或推送。
