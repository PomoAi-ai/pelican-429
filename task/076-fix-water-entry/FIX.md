# FIX -- 落水涟漪贴合与触发时序

## Status: done
## Task: 076
## Related: 075
## Baseline Commit: 无提交；修改前文件保存于 $TMPDIR/pelican-splash-before

## Problem
跳落水面时水波仍显得不自然。

## Root Cause
- water-ripples.ts 原 216–219 行：水面附近 ±1.4 格均被视为游动，角色尚在空中就提前发波。
- 原 244–245 行：只采样圆心波高，整片涟漪平移；两侧无法贴合起伏水面。
- 完整硬边圆环、快速减速扩散和偏大的球形水滴让效果过于机械。

## Fix Plan
- [x] 收紧尾迹接触范围，修复空中和深潜误触。
- [x] 水体和涟漪复用波面 GLSL，逐顶点贴波面。
- [x] 柔化环带边缘，打散环上亮度；延长扩散衰减，缩小水滴。

## Verification
- [x] 先执行接触范围复现测试，旧实现实际生成 2 道水波，用例失败。
- [x] npm run typecheck — 通过
- [x] npm test — 1521/1521 通过；对应 render-water-polish 测试 13/13 通过
- [x] npm run build — 通过（既有大 chunk 与构建插件耗时提示）
- [x] 浏览器独立调试页触发真实落水，捕获入水后 130ms 画面，随后水滴与涟漪归零；无新增着色器错误。确认服务返回本次 soft-wave-v2 模块，检查后关闭临时页。
- [x] diff-guard：没有新增防御性校验或视觉结构断言；子代理独立确认贴波、提前发波及水滴寿命问题。
