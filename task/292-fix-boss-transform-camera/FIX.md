# FIX -- 第一 Boss 击败后先拉近镜头再变身

## Status: done
## Task: 292
## Related: N/A
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
第一 Boss 击败后应先用 3 秒拉近镜头，再播放玩家变身。

## Root Cause
src/sim/mainline.ts 的阶段推进直接恢复人形；帧循环只有普通跟随镜头。

## Fix Plan
- [x] 复用玩家变身动画，增加短暂拉近、变身、拉回时序，暂停战斗与倒计时。
- [x] 演出存档恢复为完成后的人形，不重复播放。

## Verification
- [x] 时序回归用例
- [x] npm run typecheck
- [x] npm test：镜头拉近调整为 3 秒后全量 1800 项通过。
- [x] npm run build：通过，保留产物分块超过 500 kB 的提示。
- [x] diff-guard：本次新增改动无问题；git diff --check 通过。
- 镜头及动画效果待浏览器人工验收。
