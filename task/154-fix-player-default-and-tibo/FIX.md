# FIX -- 默认人形玩家与 Tibo 正式形象

## Status: done
## Task: 154
## Related: 150
## Baseline Commit: e5fb3bf

## Problem
自由世界玩家应默认人形，可变身鹈鹕；Tibo 必须使用自己的形象，不能复用主角。

## Root Cause
游戏装配沿用模拟默认鹈鹕；死亡重生也重新创建鹈鹕。NPC 视图把 Tibo 渲染成 Grassy 主角。

## Fix Plan
- [x] 游戏装配指定人形出生，同步身体高度与变身起始状态，重生沿用出生形态。
- [x] Tibo 恢复专属黑帽衫鼹鼠模型，固定形象并保留帮助行为；Sam 保持自身人形。
- [x] 用真实模拟验证人形出生、双向变身、重生回到人形；测试能捕捉遗漏出生/重生形态接线的回归。

## Verification
- [x] 定向行为测试 — 16/16 passed
- [x] npm run typecheck — passed
- [x] npm test — 1642/1642 passed (subagent)
- [x] npm run build — passed
- [x] 浏览器核对人形玩家与正式 Tibo 模型；按钮实测 human → pelican → human
- [x] diff-guard

## Decisions
- Game entry starts in human form; story progression retains its explicit phase rules.
- Simulation accepts a spawn form and reuses it on respawn; existing isolated pelican scenarios retain their explicit/default setup.
- Tibo uses characters/tibo/tibo.glb and its original animation, with no protagonist model or scaling.
- New behavioral test reproduced the previous human-spawn failure before the fix.

## Result
- Browser confirmed default human player, original Tibo model, and both transformation directions.
- Evidence: evidence/player-and-tibo.jpg.
- No commits or pushes.
