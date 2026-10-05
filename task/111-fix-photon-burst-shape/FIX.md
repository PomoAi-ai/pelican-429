# FIX -- 光子爆裂形态

## Status: done
## Task: 111
## Related: 110
## Baseline Commit: 无；本次修改前 luma-ultimate.ts 保存于 $TMPDIR/luma-ultimate-before-plasma.ts。

## Problem
光子本体爆裂的细碎粒子和规整圆环观感不佳，缺少集中爆炸的形态。

## Root Cause
src/render/luma/luma-ultimate.ts：192 个圆点组成等距径向虚线，细圆环匀速扩散、颜色偏淡；能量核和冲击前沿没有明确层次。

## Fix Plan
- [x] 在共享渲染模块以连续白热尖角光核、断开的青蓝波前和拉长光芒替换本体点阵与细圆环；爆发约半秒消退。
- [x] 背景光点从 150 降至 48 并减弱亮度，保持原有轮子与 Bug 的模型、追击和伤害。

## Verification
- [x] 真实展示场浏览器检查蓄力、爆发、衰减，截图见 evidence/after.png；无控制台错误，临时检查页面已移除。
- [x] npm run typecheck：通过。
- [x] npm test：1528/1528 通过，0 失败、跳过或取消。
- [x] npm run build：通过；仍有既有大分块提示及输出目录准备耗时提示。
- [x] 子代理代码审查与 diff-guard：已修复审查发现的 GLSL 负底数 pow 问题，复核通过。最终白热核心调参与波前宽度已人工检查，无新增校验或自动渲染细节测试。
