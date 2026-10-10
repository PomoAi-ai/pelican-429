# FIX -- 太阳能板连续整排展示

## Status: done
## Task: 368
## Related: 361
## Baseline Commit: 975f136

## Problem
用户要求透视场景中的太阳能板放成一整排。

## Root Cause
src/app/definition-scene-layout.ts 中 solar 分区原本按六种安装组合间隔摆放，不是连续阵列。

## Fix Plan
- [x] src/app/definition-scene-layout.ts — 改成同高居中、每格一块的12块连续阵列，两端半砖供走跳；各板复用原受力和追光逻辑。
- [x] src/app/room-scene-preview.ts — 试玩提示适配连续整排。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 1861通过，0失败、0跳过
- [x] npm run build — 通过
- [x] 浏览器观察连续阵列与踩踏，保存截图 solar-row.jpg；人物从中部沿面板跑到右端，原踩踏板恢复太阳目标角度
- [x] diff-guard：仅布局和文案，无新增防御代码或实现细节测试
