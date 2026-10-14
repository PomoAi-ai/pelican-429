# PLAN -- 岩层内沿外延各露出0.25格

## Status: done
## Task: 378
## Related: 366-rock-terrain-definitions
## Baseline Commit: 975f136

## Goal
岩层整体内沿、外延各加厚0.25，岩层Z=[−0.75,+0.75]、深1.5；泥土中央深1。同步基础定义、图示、透视。

## Non-goals
不新增局部半嵌石块、采矿玩法或修改自由世界生成。保持XY格子与2D碰撞归属；不提交推送。

## Decisions
- 用户明确选择整片岩层两侧各加厚0.25，并确认允许露出；覆盖先前深1岩层口径。
- 既有探索完整：config岩土数据、definition-terrain渲染、definition-kit格线、同源图和文档发布器。跳过重复探索与架构代理，按已明确文件实现。
- 石头含矿岩层与倒置坡深1.5，土深1；矿露头随真实石面移动0.25，矿皮仍最多0.03。
- 逻辑格域与2D碰撞不增加层数；格线保留中央1格参照，真实轮廓显示凸出0.25。
- 旧独立平底石块保持0.8×0.5×0.6；仅岩层整体加厚。相关旧图和文档同步，其他资料不扩写。
- 快照 /private/tmp/pelican-rock-depth-baseline；保留其他工作区改动。

## Implementation Map
| File | Intent | Done |
| --- | --- | --- |
| src/config/rock-terrain.ts, src/render/definition-terrain.ts, src/app/room-scene-preview.ts | 同源厚度、真实露头和场景提示 | yes |
| docs/natural-rock-definitions.md, docs/natural-ore-definitions.md, docs/natural-spatial-definitions.md, docs/depth-definitions.md | 统一已确认深度及墙体避让规则 | yes |
| assets/concepts/scene-depth-guide/draw_rock_combinations.py | 同源三组合与深度详图 | yes |
| assets/concepts/scene-depth-guide/draw_rock_wireframe.py, draw_natural_space.py | 修正旧岩层与矿层线框 | yes |
| public/concepts, src/ui/concept-natural-resources.ts, src/ui/site-pages.ts | 发布定义和页面表述 | yes |

## Validation
- 同源生成断言与图片检查。
- npm run typecheck、npm test、npm run build各一次（顺序运行降低性能测试干扰）。
- 浏览器检查两侧露岩、俯视深度和矿物仍外露。
- 独立审查。

## Results
- 同源ROCK_TERRAIN_DEPTH控制岩土表现与三组合/深度图；旧矿状态JSON和图同步，以免新旧资料冲突。
- 临时自检：三场景XY、形状、矿属性对比快照未变；主体包络±0.75，矿皮前沿−0.78。
- 审查Approved，无新增缺陷；已标明旧总览图深1口径被覆盖。
- npm run typecheck通过；npm test 1875/1875通过、301 suites；npm run build通过（文档发布后运行）。构建仍有大分块提示。
- 浏览器确认含矿岩层斜视和俯视、矿皮外露、深度图在基础概念页展示；error日志为空。四份公开文档与源码一致。
- 截图 output/rock-depth/concepts.png、ore-top.png；基础概念页标签保留。
- 未提交推送，未扩展主世界生成或采矿功能。
