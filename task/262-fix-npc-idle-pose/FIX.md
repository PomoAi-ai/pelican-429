# FIX -- NPC 吃薯条姿态与对白遮挡

## Status: done
## Task: 262
## Related: 259
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
Tibo 吃薯条时手臂/手腕扭曲；Sam 讲话字幕与标题重叠。追加需求：算力激涌与日常交互对话都加入“我又稳稳的接住了你!”。

## Root Cause
- src/render/npc/npc-idle.ts：IK 重建臂朝向后又强制世界手掌方向，令蒙皮腕部发生大幅反拧。
- src/render/npc/npc-effects.ts：自语字幕位于头顶中央，与游戏姓名标签共用区域。
- src/app/showcase/stage-actor.ts：角色标题固定高度，Sam 大招字幕超出该高度仍被标题覆盖。

## Fix Plan
- [x] npc-idle.ts — 保留局部骨架姿态，限幅抬臂屈肘，不强制手腕方向；重调薯条握点。
- [x] npc-effects.ts — 日常对白移到角色侧方，避开姓名与展示标题。
- [x] stage-actor.ts — 大招时标题锚点避开字幕高度。

## Verification
- [x] 浏览器检查：两形态吃薯条正侧面；实际展示场算力攻击台词与红字横幅，无标题遮挡
- [x] npm run typecheck — 通过
- [x] npm test — 1786 通过、0 失败；追加台词后 npc-dialogue 两项回归通过，纯视觉调整未重复全量
- [x] npm run build — 通过，仅 chunk 体积提示
- [x] diff-guard — 子代理审查与最终横幅增量检查通过

## Added Scope
- npc-dialogue.ts 与 npc-effects.ts 复用同一句角色台词；算力激涌释放时在角色侧方显示，对话池新增该台词。
- 攻击台词按最终要求使用浅色矩形横幅、红字红边，取消漫画气泡造型。
