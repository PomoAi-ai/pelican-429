# PLAN -- 家具与人物空间对照

## Status: done
## Task: 356
## Related: N/A
## Baseline Commit: 975f136

## Goal
在已有透视工坊加入可选的家具站位对照，比较靠后半深床、满深床旁站立、床上站立、满深穿模、左右设施阻挡和家具淡化穿过。真实玩家保持3.1格，不修改正式玩法。

## Non-goals
不定稿半深规则、不改角色比例、不实现游戏碰撞或新增前后移动。

## Acceptance Criteria
- 六种情况均可在目录定位、旋转/正面/俯视、方格与线框观察。
- 复用共享家具与角色模型；半深参数从共享家具生成器提供。
- 有人物横向位置控制、同平面标尺与半格走道实际角色包络说明。
- 文档保留满深与半深方案状态，概念资料库可进入对照。

## Constraints
保留其他工作区改动；不提交推送；新增渲染/UI行为由浏览器验收，不写结构断言测试。

## Decisions
- 已读现有透视工坊、共享家具、角色尺寸与资源；继续同一场景分区机制。
- 展示六个候选案例，用户要求全做，不需先裁定其中一个。
- 使用可见蒙皮顶点采样说明半格是否能容纳人物；它是包络检查，不冒充精确碰撞。
- 淡化家具只用于独立案例，材质实例隔离。
- 探索与实现交由两个子代理独立处理共享家具和人物测量；主代理装配、UI、文档与浏览器检查。无架构分歧，合并设计阶段直接实施。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/definition-furniture.ts | 半深共享变体 | yes |
| src/app/definition-scene-layout.ts | 六个独立对照分区 | yes |
| src/app/furniture-player-inspection.ts | 可见包络和3.1标尺 | yes |
| src/app/room-scene-preview.ts | 对照定位、位置滑杆、测量反馈 | yes |
| src/ui/room-scene-preview.css | 紧凑对照面板 | yes |
| docs/furniture-definitions.md、public镜像、src/ui/site-pages.ts | 方案说明与入口 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器六案例、视图、线框、滑杆、测量、返回原分区 | yes | yes |

## Results
- 六个候选对照已在透视工坊可定位，半深共享变体不覆盖原满深图谱。
- 可见模型采样全身深约1.60、脚底上1格内包络约1.35；原始GLB独立复核吻合，不压薄角色。
- 子代理完成共享变体与可见顶点测量，审查发现全景未恢复淡化状态，已修复并浏览器核对。
- npm run typecheck通过；npm test 1842通过、0失败；npm run build通过（既有大块体积提示）。最后UI调整后重跑类型检查和构建通过。
- 浏览器逐一查看A—F，检查滑杆、床上Y=1.85、淡化离开恢复、全景/原房间隐藏比较面板、俯视、格子、线框；资料库新增章节复制成功。
- 工作区有同时进行的聚落/游戏控制等改动，保持其内容；家具候选分区仍为观察模式，不替用户定稿碰撞规则。
