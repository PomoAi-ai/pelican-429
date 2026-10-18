# PLAN -- 科幻无人机游戏接入

## Status: done
## Task: 507
## Related: 499, 502, 503
## Baseline Commit: c292d188

## Goal
将 A 能量结构与 C 流线体结合的新无人机接入游戏：外置大轮、不锈钢、顶部能量、中央单喷口、斜坡行驶与灵动起降、避让玩家轮廓。
## Non-goals
不改变家园经济和作业规则，不提交推送，不做复杂全局寻路。
## Acceptance Criteria
共享模型覆盖游戏/展示场；坡面滚动、断崖起飞、着地关喷气；只有中央一股气体；玩家像素不被机体或特效遮挡。
## Constraints
保留庞大现有工作区改动；不改 vendor；不写渲染细节断言。
## Decisions
- 复用前序探索与已定资产契约，跳过重复架构派工；新增斜坡和遮挡独立探索。
- 用户未指定 A/B/C，采用上轮推荐 A+C，并在开工说明。
- 斜坡使用可测试纯运动模块；遮挡复用现有 stencil 玩家标记。
- 模型、跟随运动、遮挡并行；主代理负责能量与中央喷流、集成和浏览器验收。
## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | passed |
| npm test | yes | 1993/1993 passed |
| npm run build | yes | passed，已有大包体积提示 |
| 浏览器地面/斜坡/飞行/遮挡验收 | yes | passed，真实坡面/坡顶、起飞、重叠截图在 v11 目录 |

## Result
- 模型19关键节点通过校验；中心唯一喷口接实时体积噪声气流，顶部动态环/粒子随动。
- 斜坡运动新增4项实际行为测试；独立 core-review + diff-guard 通过。
- 玩家像素使用现有 stencil 合约保护，不关闭墙体深度测试。
- 新模型已进入共享加载链，家园砍树/挖掘/施工保留。
- 游戏实测截图：assets/concepts/follow-drone-modeling-v11/game-slope.png、game-flight.png、game-player-overlap.png。
- 实现与最终验证完成；未修改其他并行任务模块。
- 未提交、未推送；复杂断崖使用飞行跟随，不引入全局寻路。
