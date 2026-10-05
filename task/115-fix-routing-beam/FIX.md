# FIX -- 路由攻击用动作表达模型降级

## Status: done
## Task: 115
## Related: 112
## Baseline Commit: 无 HEAD；本轮文件快照在 $TMPDIR/routing-beam-baseline

## Problem
用户要求头顶显示最高档模型、射出光线、被命中目标身上显示低档模型，上一版误把行为描述直接做成了「垃圾模型击中目标」字幕。

## Root Cause
src/render/npc/npc-targets.ts 的 createRoutingMissiles 创建了解说式 headline，并把命中型号放在目标上方；npc-effects.ts 同时把「牛逼模型」当作字牌，造成行为与标签含义不清。

## Fix Plan
- [x] 头顶仅突出 GPT-6 Astra 与金色聚能，不提前显示低档型号。
- [x] 弹体改为蓝金光线脉冲，复用已有固定弹道与可躲避碰撞。
- [x] 移除解说字幕；命中后仅在目标身体上显现对应的 GPT-5.6 Luna / GPT-4o mini 型号。两个型号分行显示，按命中靶位置取样，末尾同步淡出。
- [x] 同步技能说明。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1557/1557，300 suites，61.451s，无失败或跳过。
- [x] npm run build — 通过，6.34s，仅已有chunk大小提示。
- [x] 浏览器检查头顶模型、飞行光线、命中身体标签与躲避行为 — 完整应用预览验证通过，左右朝向一致，命中前无目标标签、结束无残留；console warn/error 为空。证据见 evidence/hit-and-dodge.png、before-hit.png、ended.png。
- [x] diff-guard / 子代理审查 — 通过，无遗留问题。

本轮是表现修正，复用已有弹道行为测试，不新增渲染、文案自动测试。
