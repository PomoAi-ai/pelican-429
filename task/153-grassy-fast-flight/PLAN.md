# PLAN — Grassy 快速飞行

## Status: done
## Task: 153
## Related: 128, 133
## Baseline Commit: e5fb3bf

## Goal
保留已完成的前倾快跑，补充人形快速飞行的实际速度、独立骨骼动作和推进尾流；展示场和游戏复用同一实现。

## Non-goals
不修改现有键位、鹈鹕飞行、水下形态规则或其他角色。

## Acceptance Criteria
- 人形主动飞行复用 runHeld：普通 8 格/秒，快速 12 格/秒，平滑加减速。
- fly_fast 为独立 0.8 秒循环动作，明显前倾、后收双腿，三档正式资产都有该动作。
- 快速飞行仍可移动施法，推进粒子跟随人物；支持展示场独立查看。
- 地面快跑、转身、眨眼、人形落水和鹈鹕行为保持。

## Decisions
- 使用 dev / core-dev 与 Ponytail Full；同会话子代理分工物理、Blender 和推进效果。
- 已有控制器、骨骼叠加和粒子系统覆盖需求；沿用现有流程，不增加键位或新系统。
- 探索与设计合并在各负责模块的实际调用链检查中；需求可回退且无方案分歧，直接实施。
- 当前工作区存在其他任务改动，以任务开始时文件副本核对本次范围。
- 动画和 UI 通过浏览器验收，纯物理行为使用已有同主题测试。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/player-tuning.ts、src/entities/pelican-gear.ts、src/entities/pelican-controller.ts | 人形飞行速度与状态切换 | Yes |
| scripts/blender_grassy_rodin/extend_actions.py、三档模型资产 | 新增 fly_fast 动画 | Yes |
| src/config/grassy.ts、src/config/showcase.ts | 注册快飞与展示入口 | Yes |
| src/render/player-view.ts、src/render/grassy/grassy-animator.ts、src/render/grassy/grassy-effects.ts、src/render/grassy/grassy-motion-pose.ts | 按速度选动作及跟随尾流、施法 | Yes |
| src/app/showcase/human.ts、src/app/showcase/human-session.ts | 真实输入演示与取景 | Yes |

## Validation
| Command | Required | Done |
|---|---|---|
| 同主题定向行为测试 | yes | Yes |
| npm run typecheck | yes | Yes |
| npm test | yes | Yes |
| npm run build | yes | Yes |
| Blender 侧面及浏览器快飞/施法检查 | yes | Yes |

## Results
- 三档通过 Blender 正式导出，新增 0.8 秒 fly_fast；原 14 条动作采样和身体几何、UV、蒙皮保持一致。侧面及斜前图位于 assets/characters/grassy/model-equipped/evidence/fast-flight/。
- 同会话子代理完成物理与素材制作，独立审查发现的颈部补偿丢失和预览弹道随前倾向下的问题已修复；游戏真实弹道保持原有瞄准逻辑。
- 快飞组合目标移出折返通道，起手延迟至起飞结束后，避免撞停再施法；五种技能均有真实命中。
- 浏览器检查 4174 构建预览和 5174 开发页，确认快飞前倾、尾流、快飞 Codex 组合与正式入口。页面无 console error；最终保留快速飞行循环。截图 fast-flight-page.png、fast-codex-page.png。

## Validation Results
- node --test test/human-combat.test.ts test/pelican-walk-run.test.ts test/pelican-controller.test.ts test/swim.test.ts：82/82 通过，新速度回归用例先红后绿。
- npm run typecheck：通过；最后展示目标调整后再次通过。
- npm test：1642/1642 通过，耗时约49.5秒。
- 最后展示目标调整后 node --test test/showcase.test.ts：31/31 通过；未重复无关全量测试。
- npm run build：通过；最后展示调整后构建通过（约3.5秒）。现有大 chunk 提示未处理。
- git diff --check：本任务文件通过。未提交、未推送。
