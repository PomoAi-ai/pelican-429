# FIX -- 自由世界固定人形与 Tibo 向导

## Status: done
## Task: 150
## Related: 145
## Baseline Commit: e5fb3bf

## Problem
自由世界两位 NPC 只保留人形，取消随机变化与缩放动画；Tibo 作为帮助 NPC。

## Root Cause
src/entities/wanderer.ts 持有随机形态和变形计时；src/render/npc/wanderer-view.ts 在切换时缩小模型。Tibo 只有普通巡游与招呼，没有帮助行为。

## Fix Plan
- [x] 删除形态状态、随机切换和多模型缩放；仅加载人形。
- [x] Tibo 靠近玩家时停下、朝向玩家并显示探索提示；离开后恢复巡游。
- [x] 调整原确定性用例，补帮助状态行为测试。测试可捕捉删除帮助停留判断导致继续游走的回归。
- [x] Tibo 继续使用现有 Grassy 人形，本次不新增专属模型，不影响主线 Boss。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器核对固定人形与帮助提示
- [x] diff-guard 检查

## Results
- NPC behavior tests: 3/3 passed.
- Full suite (subagent): 1638/1638 passed.
- Final typecheck and build passed. Initial verification encountered concurrent unrelated UI edits; retried after those files were completed.
- Browser verified human-only models and Tibo guidance; screenshot: evidence/tibo-guide.jpg.
- Diff guard passed; no commits or pushes.
