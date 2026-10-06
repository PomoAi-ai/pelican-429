# PLAN -- 三位角色的发梢惯性

## Status: done
## Task: 302
## Related: N/A
## Baseline Commit: 072a48e

## Goal
主角、Sam、Tibo 的头发区分站立、走跑冲锋、上升、下落、落地及转身攻击；固定发根，局部发梢滞后与回弹，保留角色差异。

## Non-goals
不改模型资产、vendor、角色战斗逻辑或 CI，不提交推送。

## Acceptance Criteria
- 共享模型与动画驱动同时覆盖游戏、展示场。
- 待机安静，冲锋后拖，刹停回弹，下落上翘，落地回弹。
- Sam 较紧实、主角活泼、Tibo 较柔软；暂停不推进。

## Constraints
遵守仓库渲染人工验收规则，不新增网格细节自动测试。保留已有未提交改动。
- 头骨、脸和耳朵不能因头发运动变形；头发遮罩必须保守，仅发梢可动。

## Decisions
- explorer 子代理完成调用链探索及架构设计，沿用现有 morph，增加局部分区与共享欠阻尼弹簧，不添加依赖。
- NPC 当前忽略竖直速度和环境风，主角与 NPC 的 damp 均无回弹；共享驱动修复。
- 设计已由用户授权，未触发停止条件；直接实现。
- 独立审查发现 NPC 原整数组眨眼轨道会覆盖新增 morph，改为原槽位索引绑定；暂停仅停止积分，仍恢复头发缓存。

- 用户补充硬约束：头骨、发帽、脸与耳朵保持固定，只允许明确突出发尖变形；不修改任何骨骼缩放。
- 根据当前实际 GLB 网格与近景，固定冠层阈值收紧为主角 Y ≤ 3.02、Sam Y ≤ 2.64、Tibo Y ≤ 2.62。主角 game 主体 27,344 顶点中仅 140 个冠顶顶点超过阈值（最高 3.10）；Sam 怪物 20,820 顶点中 439、人形 20,609 中 647 超过阈值（最高 2.70）；Tibo 怪物 21,727 中 87、人形 20,242 中 103 超过阈值（最高 2.65）。这些是实际资产读数，不引用旧程序生成模型作为解剖证据。
- 主角后脑沿用 `scripts/blender_grassy_rodin/refine.py` 明确命名为 rear strands / descending tips 的局部椭球范围；冠顶权重再乘 0.55。Sam / Tibo 发尖幅度分别收紧至 0.30 / 0.22，避免短发尖过度拉伸；阈值以下冠层的全部发梢 morph 均为零。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/hair-sway.ts | 分区 morph 与共享惯性 | yes |
| src/render/grassy/grassy-rig.ts | 主角分区接入 | yes |
| src/render/grassy/grassy-animator.ts | 状态与预览输入 | yes |
| src/render/npc/npc-rig.ts | NPC 分区及角色差异 | yes |
| src/render/npc/npc-animator.ts | 风、速度及预览输入 | yes |
| src/render/npc/boss-view.ts | Boss 世界风 | yes |
| src/app/scene-wiring.ts | 共享风采样与预热接入 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器人工检查 | yes | yes |

## Results
- 最终类型检查与构建通过；全量测试 1806 项通过，零失败、零跳过。之后仅收紧视觉遮罩，未重复全量逻辑测试。构建保留既有大分块提示。
- 浏览器检查主角与两个 Boss 的近景待机、跑步、跳跃、暂停；最终遮罩三人加载与暂停正常，无明显脸部或耳朵拉伸。未单独完成强风实战逐帧录像验收。
- 子代理完成探索实现、独立审查与命令验证；审查发现的暂停 morph 覆盖已修复并复核通过。未新增渲染自动测试。
- 本任务仅涉及实现表中的七个源文件与本跟踪文件；保留其他任务的已有改动，未提交或推送。
