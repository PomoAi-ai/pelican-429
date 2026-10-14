# PLAN -- 深度定义改为格子深2 + 格外前沿/后沿

## Status: done
## Task: 384
## Related: 383
## Baseline Commit: d2d72f4

## Goal
全仓统一到新深度定义，后续均以此为准（+Z 朝镜头）：
- 格子（实体）深2，Z=[−1,+1]；人物走 Z=0。
- 前沿 +1～+1.5、后沿 −1.5～−1，均在格子之外各0.5；前沿放花草、突出岩，后沿放墙、灌木、大岩。
- 墙厚0.2，位于后沿 Z=[−1.2,−1]，与格子零交集；总带宽3。
- 平台深度至少1。
- 透视场景：人物平时走中线，过家具时向镜头侧让出，家具顶面可站立。

## Non-goals
- 正式游戏渲染（tile-geometry 的 BLOCK_FRONT_Z/BLOCK_BACK_Z 及其派生装饰层、渔屋、水面、家园 homestead-view）不改，另开任务；描述游戏现状的文档段落保持原样。

## Acceptance Criteria
- 文档、概念页说明与概念图使用新定义，旧口径标记废止或删除。
- 定义构件与透视/定义场景的实体、墙、平台、家具按新定义摆放。
- typecheck、相关测试与 build 通过。

## Constraints
- AGENTS.md：展示场复用共享构件；fail-fast；不写防御检查与“不写”清单测试。
- 未经要求不提交。

## Decisions
- 子代理（explorer）三次均被网关 403 拒绝，探索由主会话直接完成；后续阶段同样直接执行。
- 范围：用户选择「先改定义与预览」，正式游戏另开任务。
- 深度常量集中到 config/definition-kit.ts 的 DEFINITION_DEPTH（格子2、墙0.2、前后沿各0.5）；定义坐标 +Z 朝后沿，格子 [−1,+1]，墙 [+1,+1.2]。
- 平台深度类型改为 1 | 2（深度至少1）；原 .75/.5 调用统一改为1，平台全集展示 2 与 1。
- 家具模块坐标不动（家园仍用游戏地块）；定义场景摆放时贴格子背面（定义 z=+0.5，世界 [−1,0]），人物站 Z=0，过家具让出到家具前沿+0.3。
- 岩层：格子已深2，墙紧贴格子背面，不再保留两侧各露出0.25；泥土与岩层同为深2（定义场景取 DEFINITION_DEPTH.tile）。突出效果由前沿突出岩、后沿大岩表现。
- 家具候选对比 A–G 与「深度提案」分区针对旧深1问题，删除；改为一个「深度定义 · 家具让位」分区。随之删除候选滑杆、furniture-player-inspection.ts 与家具 occlude 参数。
- 让位与家具顶面站立推广到所有带落地家具的定义分区（吊灯、太阳能除外；盆栽不作落脚面）。
- 定义液体按格子深2装配水体包络。
- 接手另一会话的树木/灌木定义任务：整株后置到人物身体区之后（树 Z=[−1,−0.3]、灌木 [−0.9,−0.3]），落在深2宿主格内，取消根土台；文档、JSON、脚本、图与 build_natural_resource_documents.py 产物同步。
- 聚落家具深0.5为 Z=[−1,−0.5]；图集索引 8/10 不变。
- 不重绘：draw_tiles_walls_doors、draw_room_perspective/wireframe、draw_plants_perspective（核对现行运行时的图）与 terrain-tile-guide（仅 XY）。孤立墙目录只改文字、几何不变。
- 太阳能 grid 图输出同步复制到 public/concepts；docs 与 public/concepts 同名 .md 全部逐字节一致（public 副本仅含已作废的中间口径，直接覆盖）。
- 无停止条件，未暂停等待批准。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/definition-kit.ts, src/config/rock-terrain.ts | 深度常量、平台深度 1/2、岩层深2 | - | Done |
| 2 | src/render/definition-kit.ts, definition-terrain.ts, definition-liquid.ts, definition-furniture.ts | 构件按格子深2、墙贴背面 | 1 | Done |
| 3 | src/app/definition-scene-layout.ts | 删候选与提案分区，新增家具让位分区，通用让位/站立 | 2 | Done |
| 4 | src/app/room-scene-preview.ts, perspective-controls.ts, furniture-player-inspection.ts, src/ui/room-scene-preview.css | 删除候选机制，尺寸说明更新 | 3 | Done |
| 5 | src/app/definition-settlement-layout.ts, definition-depth-layout.ts, depth-scenery.ts | 平台深1、家具贴背面、包围盒 | 2 | Done |
| 6 | docs/*.md（定义类） | 新深度口径 | - | Done |
| 7 | src/ui/site-pages.ts 等概念页文字 | 同步定义类段落 | 6 | Done |
| 8 | assets/concepts/**.py → public/concepts/*.png | 深度相关概念图重绘 | 6 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done |
| npm run build | yes | Done |
