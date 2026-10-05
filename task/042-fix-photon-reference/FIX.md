# FIX -- 光子参考图造型

## Status: done
## Task: 042
## Related: 038-fix-photon-particles
## Baseline Commit: 无 HEAD；修改前副本 $TMPDIR/photon-reference-before

## Problem
粒子版本过于稀疏，缺少用户参考图里的圆润水滴轮廓、白色亮心、青蓝光晕和微笑表情。

## Root Cause
共享模型将可见独立光点作为主体效果，粒子密度不足、纵向过长，并删除了角色表情。

## Fix Plan
- [x] 保持粒子构成，密集叠出圆润白色水滴和青蓝边缘。
- [x] 用深青色粒子形成眼睛、眨眼和微笑；背面淡出表情，收敛逸散及动作形变。
- [x] 同步角色定义与真实截图，更新 portrait.jpg；输出 output/luma-preview/photon-reference.jpg 与 photon-reference-page.jpg。

## Verification
- [x] npm run typecheck 通过；npm test 1492 项通过、0 失败；npm run build 通过，仍有超过 500 kB 的产物体积提示。
- [x] 浏览器检查圆润水滴、青蓝外缘、白色亮心和微笑；五动作、明暗、正面/三分之四/背面、暂停重播通过。
- [x] diff-guard：对照修改前副本检查，无新增测试、防御兜底或错误吞没；修改范围为光子共享模型、动作参数、角色配置和文档、截图。
