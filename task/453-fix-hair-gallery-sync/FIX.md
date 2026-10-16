# FIX -- 头发总览响应式与同步视角

## Status: verifying
## Task: 453
## Related: 446
## Baseline Commit: 64ef4a38

## Problem
用户要求宽屏最多五列、自适应排列，以及转动任意卡片时全部跟随。

## Root Cause
总览CSS固定三列，iframe各自拥有独立OrbitControls，没有跨卡片视角同步。

## Fix Plan
- [x] CSS根据窗口宽度切换1至5列。
- [x] 同源且已登记iframe之间转发相机状态；接收时禁止反向广播，避免循环。
- [x] 新加载卡片继承最近相机；切渲染保留相机，统一角度清除旧相机。
- [x] 保留原实验页非嵌入模式，不修改模型和材质。

## Verification
- [x] npm run typecheck
- [ ] npm test
- [x] npm run build
- [x] 浏览器五列、同步拖转缩放、滚动继承视角
- [x] core-review / diff-guard：Approved

## Results
1800px窗口实测5列，拖动首款后5款同步转侧面；滚轮同步缩放，滚至11至15款后新加载模型继承视角。恢复原窗口尺寸，页面保持可用。截图output/hair-gallery/five-column-synchronized.png。

全量测试1949项，1947通过、2失败，均为本次未修改的src/ui/resource-picker.ts架构检查：CSS导入扩展名、UI导入render/resource-thumbnail。未修改断言或无关代码，因此跟踪保留verifying，未宣称全仓通过。
