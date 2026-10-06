# PLAN -- Sam 飞行阶段与角色动作

## Status: done
## Task: 216
## Related: 208, 210, 211
## Baseline Commit: 8a8fe8c

## Goal
Sam 血量降至 80% 后进入真实飞行战斗阶段，改善追击、换位和攻击速度；Sam/Tibo 全身逐步变身，跑动和空中姿态参考主角。

## Non-goals
不改模型资产、不新增依赖、不调整无关敌人、不提交或推送。

## Acceptance Criteria
- 80% 阈值准确触发飞行，保持碰撞与可躲避的攻击。
- 普通攻击与技能动作/命中节奏一致，飞行时保持施法与移动。
- 变身全身逐步变化，无自下向上的扫描、无缩小；武器握持连续。
- 战后恢复友好人形 NPC，清理攻击，保留再次召唤和对话。

## Constraints
保留共享游戏/展示场资源、既有瞬移与防御规则、法杖只在大招时升空；不覆盖工作区其他改动。

## Decisions
- 既有探索已追踪 boss → sim → view 和变身调用方；两名子代理分别继续 AI、共享动画的探索/设计/实现，无需重复架构轮次。
- 飞行使用玩家 flight / airAccel 调参并经过统一物理碰撞；地面大招先降落再释放，保持攻击波与效果一致。
- 全身互补抖动淡变约 0.55 秒，保留两种模型尺寸；不强行对不同拓扑做顶点插值。
- 战后居民通过原战斗来源标记复用同一变身器，普通世界居民仍只加载人形。
- 本任务可回退且不涉及外部操作，无审批停止条件。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/entities/boss.ts; src/config/boss-rules.ts; test/boss.test.ts | 飞行 AI、快节奏、逻辑用例 | — | yes |
| 2 | src/render/npc/npc-transformation.ts; npc-pose.ts; npc-animator.ts; boss-view.ts | 渐进变身、跑步与飞行姿态 | 1 的字段契约 | yes |
| 3 | src/entities/wanderer.ts; src/sim/boss-arena.ts; src/render/npc/wanderer-view.ts | 战后共享渐进变身 | 2 的 API | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/boss.test.ts test/boss-arena.test.ts test/free-world-npcs.test.ts | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器手动检查渐进变身与战斗，无渲染自动测试 | yes | yes |

## Results
- Boss 定向用例 32/32，Boss 场与居民 7/7 通过；全量 npm test 1756/1756 通过，包括本轮 worldgen 性能用例。
- 最终 typecheck、build 通过；构建仅有大于 500 kB 的分块提示。
- 独立子代理审查通过，无阻塞问题；材质克隆释放、飞行状态与战后资源加载路径一致。
- 浏览器检查全身渐变中间帧、暂停/重播与持杖跑步。临时检视页面复用真实 stepSim/createBossView，将初始血量设为 80%，确认离地 2.60m、收腿握杖、控制台无错误；临时页面已移除，截图保存于 evidence/。
- 最后仅同步展示场双语描述，重跑 typecheck/build；未重复全量测试。
- 未提交、未推送。
