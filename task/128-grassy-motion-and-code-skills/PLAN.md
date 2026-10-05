# PLAN -- Grassy 跑步、呼吸眨眼与主角技能

## Status: done
## Task: 128
## Related: 114, 122
## Baseline Commit: 仓库无 HEAD；动作源快照 $TMPDIR/grassy-motion-backup/

## Goal
改善主角跑步、放大并自然化呼吸、加入眨眼；Code 弹头与尾迹由代码组成；光子跟随人形并可释放技能。新增身体前倾的快跑动作，主角和鹈鹕共用平滑转身。

## Non-goals
不更换主角原画和身体造型，不修改服务器超载或 Bug 技能。

## Acceptance Criteria
- 跑步侧面有清晰蹬地、屈膝回收、交替摆臂，呼吸胸肩起伏更明显且脚底稳定。
- 呼吸时能看到自然闭合再张开的眼睛，眨眼不能压扁头部或露出旧眼球。
- Code 的实体弹头和尾迹均可辨认代码符号，游戏和展示场共享。
- 光子跟随人形主角，形态切换后保持连续，人形可发动光子技能。
- 独立 sprint 动作保留 run；主角加速后进入前倾快跑，转向时连续旋转。

## Constraints
保留三档正式模型、已有动作与材质；不写渲染网格细节自动测试；不提交推送。

## Decisions
- 使用 dev 流程统筹三个并行区域，沿共享资源修复，不复制展示场专属逻辑。
- 子代理分别负责 Code 视觉、光子逻辑和动作只读探索；root完成动作及视觉验收。探索设计与实现并行，方案由当前要求直接确定，无需设计审批。
- 先检查现有骨架/眼睛结构，再确定眨眼的最小可维护实现。必要时在 Blender 重烘焙，保留源模型拓扑和 UV。
- 快跑使用独立 0.6 秒 Blender 动作；运行时按现有实际速度在跑步与快跑之间选择，不增加移动档位或改变物理速度。转身直接复用鹈鹕已缓动的 yaw。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| scripts/blender_grassy_rodin/animate.py, extend_actions.py, face.py 与正式模型 | 跑步、快跑、呼吸及眨眼 | yes |
| src/render/grassy/grassy-projectiles.ts, grassy-projectile-view.ts | 代码实体弹和错开字符尾迹、资源释放 | yes |
| 光子共享逻辑与渲染调用、showcase 与 HUD | 人形跟随与技能、4/E 光子、3 超载 | yes |
| src/render/player-view.ts, src/app/showcase/human-session.ts | 共用鹈鹕转身，模型视角平滑旋转 | yes |
| src/config/grassy.ts, showcase.ts, src/app/showcase/human.ts, session.ts, src/app/scene-wiring.ts | 独立快跑预览及游戏实际速度选步态 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass |
| npm test | yes | pass · 1585/1585 |
| npm run build | yes | pass · 现有 chunk 大小警告 |
| node --test test/showcase.test.ts test/player-transform.test.ts test/pelican-animator.test.ts test/human-combat.test.ts | yes | pass · 最终预览步态修正后 67/67 |
| Blender 导出与浏览器动作、眨眼、代码弹、光子验收 | yes | pass |
| core-review / diff-guard | yes | pass · 修复独立跑步／快跑预览选择问题 |

## Evidence
- 三档正式 GLB 与 `.blend` 均含 14 动作，四眼睑 Blink 默认值为 0；身体位置、法线、UV 与蒙皮保持。
- 快跑脚底最低高度约 0.000000246 格，循环首尾差 0，保留其余 13 动作采样；报告与侧面图在 `assets/characters/grassy/model-equipped/evidence/sprint/`。
- 浏览器实际截图在 `assets/characters/grassy/model-equipped/evidence/motion-refined/`：闭眼、跑步、快跑、转向过渡、代码攻击、人形悬停光子。光子实际命中 4/4 假人；三档模型加载无错误。
- 初次全量测试有世界生成性能检查超时，单独复跑通过；新增快跑与转身后的最终全量 1585/1585 通过。最终预览步态修正后仅重跑相关 67 项、typecheck 与 build，均通过。
- 子代理交叉审查未发现剩余高置信缺陷；全程未提交或推送。
