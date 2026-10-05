# FIX -- 恢复原版光子轮子

## Status: done
## Task: 108
## Related: 106
## Baseline Commit: 无（仓库尚无提交；回退前文件备份于 $TMPDIR/photon-wheel-sequence-reference.ts）

## Problem
用户认为序章黑胎车轮效果不如原版，要求继续使用之前的轮子。

## Root Cause
src/render/photon-projectile-view.ts 的序章参考改动将彩色发光轮子改为黑胎银圈，与用户最终偏好不符。

## Fix Plan
- [x] 恢复原版八辐条、双环、整体青蓝/紫/金发光材质与原版旋转幅度、速度。
- [x] 对照变更前备份，只撤销本会话上一轮对该文件的改动；游戏与展示场共用恢复后的模型。

## Verification
- [x] cmp src/render/photon-projectile-view.ts $TMPDIR/photon-wheel-view-before.ts — 完全一致。
- [x] diff-guard — 仅恢复原代码，无新增抽象、防御分支或测试。
- [x] npm run typecheck — 通过。
- [x] npm test — 1528/1528 通过。
- [x] npm run build — 通过，原有大分包提示。
- [x] 展示场已刷新并重播光子大招，6/6 目标受击，生命 375/600，浏览器无错误。轮子实现由备份逐字比对确认恢复。

完整恢复已验证的原版视觉实现，不新增渲染细节测试。
