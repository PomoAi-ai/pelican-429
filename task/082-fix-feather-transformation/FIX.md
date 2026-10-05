# FIX — 补回羽化变身画面

## Status: done
## Task: 082
## Related: 072, 077
## Baseline Commit: 无 HEAD

## Problem
变身缺少独立图像，需要遵循当前角色模型与设定，以羽毛变化表现，避免人脸与鸟嘴拼接。

## Root Cause
src/app/intro-app.ts 的 transformation 与 glitch 引用了同一张失控场景；揭示动画过早切入完整鹈鹕。

## Fix Plan
- [x] 内置 imagegen 参考当前人类模型渲染、角色卡与前场景，生成独立羽化中间态。
- [x] 独立资源接入，保持正常人脸，羽毛遮蔽轮廓后才揭示完整鸟形。
- [x] 保留贯穿音乐与神经乐谱。

## Verification
- [x] 类型检查、全量测试、构建。
- [x] 浏览器检查变身前、中、后，独立审查。

## Results
- 内置 imagegen 基于当前人类3D模型渲染、角色卡和失控前景生成独立羽化图；完整提示词保存在 assets/chapter-one/03-feather-transformation-v2-prompt.md。
- 中间态保持正常人脸，白羽从袖口与肩背生长；第三拍羽幕遮住轮廓后整幅切换鸟形，不再以局部遮罩拼接。
- npm run typecheck通过。npm test首次1498通过/3失败：共享工作区其他改动中的facility-minimap文件暂缺、facility-level路径用例失败；相关文件恢复后定向重跑architecture、minimap、facility-level全部通过。未改动这些模块或断言。
- npm run build首次同样因facility-minimap暂缺失败，文件恢复后重跑通过，保留既有大chunk提示。
- 浏览器检查36.4秒正常人脸羽化、37秒羽幕、38秒完整鹈鹕，持续乐谱可见，控制台无错误。截图 $TMPDIR/feather-transformation-preview.jpg。
- 独立审查通过：形态切换无混合面孔、时间驱动可重建、Canvas状态隔离，无新增防御性检查或低价值测试。
