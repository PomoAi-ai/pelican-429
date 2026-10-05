# PLAN -- Grassy 普通攻击：砸键盘

## Status: done
## Task: 090
## Related: 081, 085, 089
## Baseline Commit: 无 HEAD；本轮源码与资产对照基线保存于 $TMPDIR/grassy-smash-baseline 和 $TMPDIR/grassy-smash-audit

## Goal
增加普通近战动作“砸键盘”，在正式角色三档模型与角色展示场中可播放。

## Non-goals
不改变角色造型、蒙皮或原有动作；不新增主游戏的人形伤害、冷却与操控逻辑。

## Acceptance Criteria
- 真实 Blender 骨骼动作：取键盘、双手举起蓄力、向前下方砸击、回弹收回。
- 躯干与双腿配合动作，双手跟随键盘，不出现明显脱手或穿头、穿地。
- 三档 GLB 和可编辑 Blender 工程含新动作，原有 12 个动作、身体材质与修复后的蒙皮保持。
- 展示场“键盘战斗”包含“普通攻击 · 砸键盘”，可暂停、慢放、循环与旋转。
- 挥击/命中提示使用共享角色特效，动作结束和切换不残留。

## Constraints
- dev 工作流，Ponytail Full；模型视觉用真实预览验收，不新增网格或材质细节单元测试。
- 不修改 vendor，不提交或推送。

## Decisions
- 将“砸键盘”解释为挥舞键盘的普通近战攻击，而不是敲键施法。
- 动画子代理合并完成该既有管线的探索、设计和实现；资产审查子代理独立保存现有资产基线。
- 探索与设计完成，无审批停止条件。keyboard_smash 共 42 帧/1.4 秒，冲击在 23/42 进度；角色短臂的可达范围决定蓄力位置在面部前上方，键盘竖起，避免穿过大头或强行拉长手臂。
- 43 个烘焙采样帧的 standard 模型脚底最低 -1.13e-7 格、动作首尾点差 0，surfaceHash 保持。浏览器使用共享骨骼与少量命中粒子，新增单动作查看入口。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_grassy_rodin/extend_actions.py | 砸键盘姿态、烘焙与三档资源导出 | — | yes |
| 2 | src/config/grassy.ts | 新动作元数据与取景 | 1 | yes |
| 3 | src/config/showcase.ts | 战斗分组和预设入口 | 2 | yes |
| 4 | src/render/grassy/grassy-effects.ts | 轻量命中粒子 | 1 | yes |
| 5 | public/characters/human/SOURCE.md | 当前资源与动作说明 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 三档资源对照与实际浏览器动作验收 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1531 passed, 0 failed |
| npm run build | yes | yes — 既有大 chunk 与构建插件耗时提示 |

## Results
- 新动作烘焙进三档正式 GLB 与对应 Blender 工程，manifest 同步更新，均为 13 段动作。原 12 段动画采样、身体全部几何/蒙皮数据、骨架和贴图保持不变；独立资产审查与集成审查无阻塞问题。
- 实际浏览器检查了标准、轻量和精细三档的动作加载、蓄力/下砸、侧面姿态、暂停与 0.25× 慢放、动作切换；浏览器错误日志为空。
- 真实 Blender 渲染、接触对照、独立资产对照与页面截图保存在 assets/characters/grassy/model-equipped/evidence/keyboard-smash/，截图 browser-smash.jpg。
- 未新增自动视觉测试，未接入人形游戏伤害/操控；未提交或推送。
