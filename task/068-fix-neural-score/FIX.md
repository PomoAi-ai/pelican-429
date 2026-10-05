# FIX -- 神经乐谱与粒子

## Status: done
## Task: 068
## Related: 065
## Baseline Commit: 无 HEAD

## Problem
乐谱需要成为神经网络的变形版本，并添加粒子效果。

## Root Cause
src/render/intro-finale.ts 的 lightRibbon 原先单独绘制谱线与流动音符，缺少节点、突触连线与变形连续性。

## Fix Plan
- [x] 神经空间中的五层节点连续展开为五条谱线，保留突触斜线与激活节点。
- [x] 音符从节点长出，粒子沿同一轨迹流动并漂散，亮度响应现有节奏。
- [x] 复用 Canvas 与现有几何函数，无新依赖、无逐帧累积状态。

## Verification
- [x] npm run typecheck 通过；npm test 1505/1505 通过。
- [x] npm run build 通过，保留大 chunk 警告。首次构建遇到并行改动中的 setTornado 缺失导出，发现该导出已补齐后重跑成功，本任务未修改相关文件。
- [x] 浏览器检查 4 秒网络展开和 15.2 秒三声部乐谱，粒子与节点沿同一轨迹；截图 $TMPDIR/neural-score-particles.jpg。
- [x] diff-guard：修改仅限 lightRibbon，未增加依赖、防御代码、累积状态或实现镜像测试。
