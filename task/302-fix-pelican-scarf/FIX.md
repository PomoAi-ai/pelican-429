# FIX -- 鹈鹕领巾动作与风场飘动

## Status: done
## Task: 302
## Related: N/A
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
领巾缺少布料飘动，不同动作与风没有影响。

## Root Cause
src/render/pelican/pelican-follow-rig.ts:151 只对整条领巾绕结点旋转；entity-views 未向领巾传入风场。

## Fix Plan
- [x] 在共享渲染模块实现领巾与描边同步形变，接入动作、相对风与平滑过渡。
- [x] 游戏与展示场沿现有天气采样接线；测试夹具显式使用无风。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器视觉检查
- [x] diff-guard

## Result
- 新增共享 pelican-scarf 渲染模块：根部固定的两条错相行波，描边及阴影同步；动作、升降、骑行、近战与吐射后坐、相对风向影响幅度与偏移，参数平滑过渡。
- 游戏和角色展示场共用 windAt，沿用 skyExposed 遮挡判断；无 vendor 修改。
- npm test：1806/1806 通过；最终改动后相关三个测试文件：44/44 通过。
- npm run typecheck：最终通过；验证期间工作区其他头发动画改动曾产生类型错误，最终已消失。
- npm run build：通过，保留大 chunk 提示。git diff --check / diff-guard：通过。
- 浏览器检查跑步连续帧与空中领巾形变，未发现新增着色器编译错误。采用视觉布料行波，不包含布料碰撞模拟。
- 工作区已有和期间出现的其他修改保持原样；scene-wiring 中并行产生的重复 windAt 声明合并为同一个采样函数。
