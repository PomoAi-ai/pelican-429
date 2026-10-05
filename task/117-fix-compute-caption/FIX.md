# FIX -- 算力技能仅保留简短标签

## Status: done
## Task: 117
## Related: 115
## Baseline Commit: 无 HEAD；本轮快照 $TMPDIR/compute-caption-baseline/npc-effects.ts

## Problem
技能效果中不应出现「算力汇聚」解说文字，最多显示「算力」。

## Root Cause
src/render/npc/npc-effects.ts 的 createSurge 为 Sam 同时创建 COMPUTE SURGE 与「算力汇聚」两层文字。

## Fix Plan
- [x] Sam 技能特效只保留一个「算力」标签。
- [x] 保持动作、粒子、攻击逻辑和 Tibo 原有文字。

## Verification
- [x] npm run typecheck — 并发角色改动补齐后通过；未修改相关接口或翻译表。
- [x] npm test — 全量1555/1557通过，缺失的Grassy投射物文件与角色变身断言在并发修改期间失败；后续仅复查 architecture.test.ts 与 player-transform.test.ts，30/30通过，未改断言。
- [x] npm run build — 通过，5.00s，仅构建耗时与已有chunk大小提示。
- [x] 浏览器确认聚能与释放阶段只出现「算力」 — 先使用共享NPC入口验证，再在完整应用构建预览确认；console warn/error为空。截图 evidence/compute.png。
- [x] 子代理 diff-guard 审查 — Approved，Tibo文案与采样保持原值，无新增自动测试。

纯表现与文案修正，不新增自动测试。
