# FIX -- NPC 跑步节奏恢复

## Status: done
## Task: 227
## Related: 216, 221
## Baseline Commit: 8a8fe8c

## Problem
Sam/Tibo 跑步姿态在提速后显得不自然。

## Root Cause
npc-animator 对已有脚掌接地 IK 跑步循环额外施加 1.5 倍速，行走也加速到 1.15 倍；npc-pose 还在已烘焙前倾上叠加前倾，并将移动切换过渡压到 0.12 秒。

## Fix Plan
- [x] 去掉额外步频倍率，展示场循环长度与共享采样一致。
- [x] 保留原动画身体前倾，移动姿态衔接恢复为 0.2 秒。
- [x] 保留快速战斗、飞行阶段和装备。

## Verification
- [x] 浏览器检查 Sam/Tibo 人形与怪物跑步循环、交替支撑帧、站立切换与持武器姿态，控制台无错误，截图见 evidence/。
- [x] npm run typecheck 通过；npm test 1759/1759 通过；npm run build 通过（原有分块体积提示）。
- [x] 增量 diff-guard：仅撤销额外步频/前倾及调整过渡时长，无新增防御逻辑、依赖或渲染自动测试。

临时检视文件已移除；未提交或推送。
