# PLAN -- Sam 与 Tibo 武器与普通攻击

## Status: done
## Task: 193
## Related: 152
## Baseline Commit: 3a35077

## Goal

为 Sam 与 Tibo 制作已选定的路由核心与重置锤，加入真实普通攻击、双形态共享动作、展示靶场和命中效果。

## Non-goals

- 使用现有角色骨架与共享渲染层制作武器和普攻，不重新生成角色 GLB，不提交 Rodin 制作任务。
- 不重写现有三个技能，不为武器新增未决定的复杂机制。

## Acceptance Criteria

- 两角色配备已选武器，双形态共享尺寸和普通攻击动作。
- Sam 从头顶路由核心发射单枚定向脉冲；Tibo 近身锤击具有前摇、短有效窗和收招，同一挥击只伤害每个目标一次。
- 正式 Boss 战斗自然穿插普通攻击与原三技能；普攻可打断、可躲避。
- 展示场包含普攻、训练靶与真实相交后的受击效果，支持左右朝向、躲避、暂停和重播。
- 正常横版镜头检查武器轮廓、持握、跑跳离地与单武器变身，并通过相关检查。

## Constraints

- Sam 路由攻击仍从头顶模型核心发出。
- Tibo 保留薯条小技能和重置大师主题；沿用友善调侃的基调。
- 两形态共用同一武器尺寸，原地变身不缩放，不复制成两把。
- 武器在正式游戏与展示场共享，不只挂在展示页。

## Decisions

- 使用 dev/explorer 完成探索与武器选型，再由 core-dev 实现、core-review 独立审查和 core-test 验证。
- 两位子代理分别检查玩法链和16张实际四向渲染。现有四份GLB有同名手骨，但没有独立普攻动作和手指骨。
- Sam 两条路线：分叉指挥杖／悬浮路由核；Tibo 两条路线：重置印锤／薯条发射器。
- 武器用于补普通攻击并承接已有技能，用户已确认实施。
- 参考 Riot 游戏可读性与 Valve TF2 轮廓设计资料；具体武器方案为本项目原创设计判断。
- 推荐 Sam B「Router Core / 路由核心」与 Tibo A「Reset Mallet / 重置锤」：分别强化远程操控与近身重击。Sam A「Routing Scepter / 路由杖」保留为手持武器备选；Tibo B「Fries Blaster / 薯条发射器」更适合临时技能道具。
- Sam 核心待机低亮，普攻通过核心转向、节点闪光、发射单枚脉冲呈现；路由小技能继续头顶发射，Token 技能保留弹道弹，大招展开核心。普攻 0.72 秒，0.28 秒释放，速度 10 格/秒，起手锁定目标。
- Tibo 重置锤左手持握、右手保留薯条动作；普攻由预备、挥击、接触与收招组成，重置棘轮在收招时归位。重置小技能和大招延续现有重置主题，不新增删除进度等机制。
- 武器概念比较存于 weapon-concepts.png，生成与修订提示存于 weapon-concepts.prompt.txt。已修正锤的持握侧并缩小悬浮核；生成图仍未严格统一 Sam 两方案的展示尺寸，不能作为人物比例或建模尺寸依据。角色在游戏中的原有尺寸不变。
- Sam 核心采用有厚度的三节点框架与棱晶；Tibo 重置箭头采用实体棘轮。Tibo 普攻 0.84 秒，0.34 秒释放、0.12 秒有效；判定按真实臂长与锤头收在前方 0.55–1.85 格，AI 在 1.9 格内起手。
- 用户已确认按推荐组合继续开发并加入普通攻击；研究阶段的暂停条件已解除。复用已完成的探索与武器设计，玩法/渲染子代理各自细化其实现后并行开发。
- 使用现有 AttackInstance / ProjectileRequest 完成判定，实战与展示共享普攻配置、发射原点与时序；普通攻击可打断，技能继续保留。
- 工作区已有大量其他任务改动，仅检查并修改本次涉及文件；本次前状态快照保存在 /tmp/npc-weapons-baseline 用于分辨当前增量。
- 实景修正了 Tibo 低持时锤头被腿遮挡、跳跃蹲伏时锤底入地，以及 Sam 头顶控制条遮挡核心。双形态跳跃 120 段网格采样锤底最低分别为 +0.0544 / +0.1022 格，武器世界缩放始终为 1。
- 两份形态共享可见武器，变身时插值握点而不缩放、不叠加武器。展示与游戏复用同一武器生成器、动作、普攻参数与判定函数。
- Token 原有展示和实战发射点差异不属于本次普攻改动；没有扩大修改原技能弹道。

## Implementation Map

| File | Intent | Done |
|------|--------|------|
| src/config/npc.ts, src/config/boss-rules.ts, src/combat/npc-basic-attack.ts, src/entities/boss.ts | 普攻定义、真实投射/近战与决策 | Yes |
| src/render/npc/npc-weapons.ts, npc-attack-clip.ts, npc-rig.ts, npc-animator.ts, npc-pose.ts, npc-transformation.ts | 共享武器、骨架动作与单武器变身 | Yes |
| src/render/npc/npc-targets.ts, npc-basic-targets.ts, npc-effects.ts, src/render/projectile-views.ts, projectile-fx.ts | 展示弹道、受击粒子与实战弹体 | Yes |
| src/app/showcase/stage-actor.ts, src/app/boss-audio.ts, src/config/showcase.ts, src/ui/showcase-language.ts, showcase-panel.ts | 普攻展示入口、躲避开关与音效 | Yes |
| test/boss.test.ts | 起手释放、定向、取消与单次伤害行为验证 | Yes |

## Research Sources

- Riot Games, Clarity in League: https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/ — 轮廓、方向、视觉主次、特效与判定一致性。
- Valve, Illustrative Rendering in Team Fortress 2: https://cdn.steamstatic.com/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2.pdf — 距离下的角色与武器轮廓识别。

## Validation

| Item | Result |
|------|--------|
| 现有逻辑、发射点、骨架与模型四向只读检查 | 完成 |
| 候选武器概念对比 | 已生成并修订；用于选类别、色彩与气质，不作为尺寸定稿 |
| 子代理交叉检查 | 玩法建议核心＋锤；美术比较后同意该组合，要求横版侧视与持握验证 |
| 正式游戏代码与武器制作 | 完成；独立审查未发现新增问题 |
| node --test test/boss.test.ts | 24/24 通过，包含 5 项新行为用例和完整模拟扣血 |
| npm run typecheck | 通过，最终检查 exit 0 |
| npm test | 1728 项：1727 通过、世界生成耗时中位数 289.5ms 超过 250ms；无功能用例失败 |
| node --test test/worldgen.test.ts | 按原阈值单独复跑 29/29 通过，未更改测试或环境变量 |
| npm run build | 通过，463 模块；保留现有分块体积与插件耗时提示 |
| 浏览器双角色双形态、左右普攻、目标躲避、跑跳和变身 | 通过；稳定构建在本地 5196 验收，无新页面错误，结束回到开发入口 5174 |

## Delivery

- 开发预览：`http://127.0.0.1:5174/?mode=showcase&demo=npc-weapons`，两人已在浏览器开启循环普通攻击。
- 实景截图：`evidence/weapon-game-preview.png`；补充：`evidence/human-left-dodge.png`、`evidence/human-weapons-motion.png`、`evidence/transformation-with-weapons.png`。
- 验证日志：`/tmp/npc-weapons-tests.log`、`/tmp/npc-weapons-worldgen.log`、`/tmp/npc-weapons-typecheck.log`、`/tmp/npc-weapons-build.log`。
- 未提交、未推送；本次没有修改角色 GLB 或 vendor 资源。
