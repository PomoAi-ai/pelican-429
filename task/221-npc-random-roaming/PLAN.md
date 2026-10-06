# PLAN -- NPC 随机站立与走动

## Status: done
## Task: 221
## Related: 216
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Goal
NPC 自然地随机正面站立、朝左或朝右停留，并穿插短距离走动。

## Non-goals
不调整战斗 AI、模型资源或新增依赖；不提交、不推送。

## Acceptance Criteria
- 同一个 NPC 随时间出现正面、朝左、朝右站姿与实际走动，动作之间有停顿和平滑转向。
- 两名 NPC 决策独立，同种子可重现。
- 保留断崖、水池、墙壁和巡游范围限制，以及靠近玩家的招呼。

## Constraints
逻辑层使用现有 seeded RNG；复用共享动画和姿态；不新增渲染自动测试。

## Decisions
- 现有 wanderer 已有随机走动和地形安全判断，直接扩展其待机决策，不新增 AI 调度器。
- 由 explorer 子代理核对朝向传递设计；当前范围可逆，不需要设计审批。
- 已完成主代理调用链探索，不重复派探索代理；设计代理同时复核实现入口。
- 设计结论：居民状态保存 idleFacing（正/左/右），共享动画显式接收；默认正面用于展示场选定动作、Boss 和画质对比，随机数不进入姿态采样。
- 行走和待机各一半概率，沿用 90–240 tick 决策区间及地形限制；无未决设计问题，直接实现。
- 当前按游戏 NPC 范围完成；展示场保留用户选定动作，不自动更改选择。
- 子代理按 core-review 与 diff-guard 审查通过，普通居民及 Boss 转居民路径完整，随机状态不进入绝对时间动画采样。
- 全量唯一失败为无关的世界生成性能预算（374.3ms > 250ms）；按用例自身的并行负载敏感说明，单独复核整个 worldgen.test.ts，29/29 通过。未调整阈值或跳过用例。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/entities/wanderer.ts | 随机待机朝向和站走选择 | — | yes |
| 2 | src/render/npc/npc-pose.ts | 地面待机采样指定朝向 | 1 | yes |
| 3 | src/render/npc/npc-animator.ts | 透传待机朝向 | 2 | yes |
| 4 | src/render/npc/npc-transformation.ts | 两种形态共享待机朝向 | 3 | yes |
| 5 | src/render/npc/wanderer-view.ts | 将居民状态接入普通/变身视图 | 4 | yes |
| 6 | test/free-world-npcs.test.ts | 随机动作行为及种子确定性 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/free-world-npcs.test.ts | yes | yes，3/3 通过；新增行为用例先确认旧实现失败 |
| npm run typecheck | yes | yes；首次因非本任务的 test/character-model.test.ts:59 缺少构造参数失败，该处被工作区后续改动修正后仅重跑类型检查，通过 |
| npm test | yes | yes，1757/1758 通过；唯一世界生成性能失败经单文件复核通过，保留首次失败记录 |
| node --test test/worldgen.test.ts | yes | yes，29/29 通过，含此前性能失败用例 |
| npm run build | yes | yes，存在分块大于 500kB 提示 |
| 浏览器观察待机转向与走动 | yes | yes，自由世界 seed=429，观察到 Sam 实际走动及 Sam/Tibo 左右朝向变化 |
