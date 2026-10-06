# FIX -- Sam / Tibo 原地直接换形

## Status: done
## Task: 208
## Related: 204
## Baseline Commit: 9a4faca

## Problem
变身从脚到头扫过，用户要求整个形态原地直接变化，不缩放、不逐段替换。

## Root Cause
src/render/npc/npc-transformation.ts 的 onBeforeCompile 根据世界高度逐段裁切两种模型，并通过半秒 phase 推动扫描边界。

## Fix Plan
- [x] 共享变身模块移除高度裁切、过渡材质与半秒扫描；切换时只显示目标形态，武器采样目标握点。
- [x] 同步两种展示入口的调用，删除不再需要的过渡推进与变身中状态。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器验收两角色直接换形、原尺寸、武器跟手
- [x] diff-guard 检查本次增量

渲染效果按项目约定以浏览器验收，不新增网格或着色器实现细节测试。保留其他工作区修改，不提交或推送。

## Results
- 删除高度扫描着色器、半秒过渡、克隆材质与半身阴影切换。两种预览调用同步移除过渡推进，目标模型整体显示，武器直接采样对应握点。
- npm run typecheck、npm run build、git diff --check 通过。构建保留已有大 chunk / plugin timing 提示。
- npm test：1746/1747 通过；唯一失败 test/boss.test.ts:248 以严格相等比较浮点伤害（2.399999999999636 与 2.4000000000000004）。该纯逻辑测试不依赖本次三个渲染/展示模块；单独复测 1/1 已通过，未再复现全量运行时的浮点差异。本次未修改相关代码或断言。
- node --test test/showcase.test.ts：32/32 通过。
- 浏览器实测 Sam/Tibo 双向整身换形、原尺寸、武器握点与无控制台错误；evidence/direct-forms.png 保存当前真实画面。
- diff-guard：仅对应共享渲染与两个调用方修改；无新增测试、兜底或内部校验。未提交、推送。
