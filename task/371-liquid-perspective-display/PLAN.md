# PLAN -- 液体透视展示

## Status: done
## Task: 371
## Related: N/A
## Baseline Commit: 975f136

## Goal
为现有单独透视场景和聚落大场景补充液体展示，复用游戏水体，显示不同水位、透明度、水面和前后深度。

## Non-goals
不新增熔岩、毒液，不实现游泳或新的流动规则，不更改游戏默认水体尺寸。

## Acceptance Criteria
- 两种场景都有液体目录入口，水面动态更新。
- 三池净宽4，示例水深约0.5/2/3，水体沿Z装配在1格实体深度内。
- 沿用格子、线框、视角和角色观察，背景墙完整格子厚0.2。
- 显式说明三色板均为水的表现，未接游泳/流动；资料库可复制。

## Decisions
- 已探索现有FluidMap、createWaterView、布局生命周期，复用它们，无需新增材质或修改默认水渲染。
- 子代理负责共享液体装配与临时自检，主代理接入两套布局、文档、浏览器验证。
- 方案明确且可逆，探索与设计合并，不新增结构测试。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/definition-liquid.ts | 共享三池装配与波动 | yes |
| src/app/definition-scene-layout.ts | 独立展示分区 | yes |
| src/app/definition-settlement-layout.ts | 聚落末端水池分区 | yes |
| docs/liquid-display-definitions.md、public镜像、src/ui/site-pages.ts | 定义资料和入口 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1869 passed, 0 failed |
| npm run build | yes | yes — 现有 chunk 大小警告 |
| 浏览器两入口、水体、俯视、线框、目录、复制 | yes | yes — 两入口可见，斜视/俯视可观察，复制按钮显示成功 |

## Result
- 共享三池使用游戏水量与水材质；水位固定，只更新表现波动。
- 子代理临时自检通过：水位、34个实体格、几何深度、碰撞偏移、初始化和释放。
- 审查发现嵌套 definition kit 会重复生成检查线框，已改为同级装配；修改后重新通过 typecheck 和 build。
- 未新增流动、游泳、浮力和入水水花；文档明确标注展示范围。
- 截图：/private/tmp/liquid-display-final.png。
