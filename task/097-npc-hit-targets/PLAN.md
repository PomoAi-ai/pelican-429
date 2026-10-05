# PLAN -- Sam 与 Tibo 技能受击目标

## Status: done
## Task: 097
## Related: 094
## Baseline Commit: 无 HEAD；改动前文件保存于 $TMPDIR/npc-hit-targets-baseline

## Goal
在 Sam 与 Tibo 的技能展示中加入游戏同款受击假人、明确的攻击抵达、命中粒子及受击反馈，让两个小技能和大招的作用对象可见。

## Non-goals
不扩展战斗 AI、伤害平衡或地图施法，不修改角色模型与蒙皮，不改其他角色展示，不提交推送。

## Acceptance Criteria
- 六种技能出现两只真实尺寸训练假人；基础动作保持单角色。
- 出手、弹道抵达、闪白/后仰/击退、粒子爆裂形成连贯节奏，大招有连续范围命中。
- 共用游戏训练假人生成函数与现有命中粒子生成函数；受击动画处于共享 render 模块。
- 暂停、重播、切换、结束没有残留；旋转时目标与攻击空间一致，取景完整。
- 浏览器视觉验收及 typecheck/test/build 通过，不新增渲染/UI自动测试。

## Constraints
遵循项目分层与 Ponytail Full，只用现有 three 依赖。保持固定粒子容量和绝对时间采样。

## Decisions
- 同一探索子代理完成现有路径分析与最小架构建议，设计复用 createDummyEntity/createDummyViewFactory 和 createImpacts；方案已充分确定，合并探索与设计阶段，无需另开架构阶段。
- 两只假人位于左右 ±2.9，复用真实尺寸，使用父组采样受击位移；视图本身负责同款材质闪白。
- NPC 既有技能释放时刻统一来自 npcAction，不在展示场复制技能节拍。攻击飞行后触发命中。
- session 只装配目标、同步播放与转向、扩展地面和取景；基础动作切换时隐藏。
- 非破坏性本地实现没有需要用户裁决的分歧，直接继续。
- 浏览器首轮发现近端底座裁切及粒子在靶体内遮挡；最终为旋转取景补足纵深，把命中点按假人倾斜旋转到外表面，并加大爆散半径。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/grassy/grassy-projectiles.ts | 导出现有命中粒子生成函数 | - | yes |
| 2 | src/render/npc/npc-targets.ts | 共享训练假人、弹道、绝对时间受击与粒子 | 1 | yes |
| 3 | src/app/showcase/npc-session.ts | 生命周期、采样、转向、取景和地面 | 2 | yes |
| 4 | src/config/npc.ts 与 src/ui/showcase-language.ts | 技能说明反映受击目标 | 2 | yes |

## Validation
| Command / Check | Required | Done |
|-----------------|----------|------|
| npm run typecheck | yes | 最新复跑通过 |
| npm test | yes | 1538/1538通过，305 suites，64.804秒 |
| npm run build | yes | 最终通过，2.46秒；仅既有大chunk提示 |
| 浏览器六技能/目标命中/暂停重播/旋转/结束切换 | yes | 通过；截图见 evidence；控制台warn/error为空 |
| core-review 局部审查 | yes | 独立子代理通过，无高置信度待修问题 |

## Delivery evidence
- `evidence/skill1.png`：正面连续射击、闪白、倾斜和文字助威。
- `evidence/skill2.png`：最终三分之四视角，训练靶底座完整，外表面爆散粒子可见。
- `evidence/ultimate.png`：最终双大招，多轮范围命中，靶子后仰/轻微弹起与青蓝/金色爆散。
- `evidence/ended.png`：结束进度为1，靶子恢复直立，技能粒子和闪白清除。
- `evidence/idle.png`：切换基础动作后目标与命中效果隐藏，恢复单角色取景。
- 检查过程中遇到其他模块并行编辑导致的临时类型错误（lethalCoolant/WeaponState），未修改相关文件；最终 typecheck 已通过。
- 全量测试后仅调整命中坐标和镜头纵深；按项目规则复跑typecheck/build并做视觉复验，未重复全量测试或新增渲染自动测试。
- 未修改模型、绑定、外部资源、CI；未提交或推送。
