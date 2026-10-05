# FIX -- 光子攻击车轮对齐序章造型

## Status: done
## Task: 106
## Related: 098
## Baseline Commit: 无（仓库尚无提交；原文件备份于 $TMPDIR/photon-wheel-view-before.ts）

## Problem
光子攻击中的轮子需要参考序章动画，保留真实自行车轮的辨识度。

## Root Cause
src/render/photon-projectile-view.ts:26 — 轮胎、轮圈、八根放射辐条合并后整体使用高亮彩色材质，与 src/render/intro-story.ts:428 的黑胎、银圈、十根切向交叉辐条不同。

## Fix Plan
- [x] 在共享 createPhotonModelKit 内按序章的比例重建轮胎、轮圈、交叉辐条与小轮毂，彩光独立放在外沿。
- [x] 自转配合轻微侧倾，保持车轮辨识度；漫游群与真实攻击弹同步使用。
- [x] 保留攻击逻辑与现有粒子拖尾，统一释放新增几何与材质。

## Verification
- [x] 对照序章 drawWheel 的绘制参数，浏览器检查实际轮子与受击效果：完整循环 6/6 目标受击；复用真实模型与展示场 session 的固定帧截图见 evidence/after.png，截图时 4/6 目标受击、生命 531/600，浏览器无错误。
- [x] npm run typecheck — 通过。
- [x] npm test — 1528/1528 通过。
- [x] npm run build — 通过，保留原有大分包体积提示。
- [x] diff-guard 与子代理只读审查 — 通过，辐条连接、轮子尺寸与共享资源释放无问题。

纯渲染造型改动，不新增网格或材质细节断言测试。

## Final Decision
仅修改共享轮子模型及其旋转姿态，游戏、展示场、漫游群和真实追踪弹同步生效。临时验收页已删除，截图保留；未提交或推送。
