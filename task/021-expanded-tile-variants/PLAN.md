# PLAN — 整格与半格的八样本展示

## Status: completed
## Task: 021
## Related: 019, 020
## Baseline Commit: 无 HEAD；快照 $TMPDIR/pelican-021-before/

## Goal
整格及半格展示更多真实变化；每张卡八个自然样本，保持全部形状、八卡上限和三维视角控制。

## Acceptance Criteria
- 每卡八个可比较的真实游戏瓦片，整格/现有半高度格前置，尺寸标注明确。
- 展示全部四形状的地面及悬空模式；顶部单形切换与恢复完整分组仍有效。
- 共用纹理覆盖八个不同相位，避免第二组四样本直接重复。
- 原模型、草皮、物理、镜头与生成器继续复用。

## Non-goals
未确认前不新增半宽度物理形状；不提交推送。

## Decisions
- 已询问半格是半高度或半宽度；先推进不依赖答案的八样本与已有半格可见性。
- 探索与设计由子代理完成；021 复用020的坐标/镜头/网格链路。
- 单列宽卡放八样本，其他六个演示保持原布局。
- 共享纹理周期扩到八，运行时保持512纹理尺寸（64px/格），避免八卡显存增至四倍。
- 属于仓库内可回退操作，无其它审批停止条件。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| config/resource-showcase、scene-demos | 八样本与整格/半格前置 | 是 |
| ui/lab-controls、resource-controls、showcase-panel、showcase.css | 数量/尺寸文案与单列宽卡 | 是 |
| render/tile-textures | 八格周期，保持每格细节密度 | 是 |
| test/showcase、render-textures、相关渲染测试 | 更新行为验证与旧周期采样夹具 | 是 |

## Validation
- [x] npm run typecheck：通过
- [x] npm test：1471 项通过；首次发现旧周期采样夹具，修正后全量复验通过，未放宽断言
- [x] npm run build：通过，保留已有大 bundle 提示
- [x] 浏览器：八样本、整格/半格、形状恢复、换组 9–16、三维镜头点击，控制台无错误
- [x] 独立审查及 diff-guard：Approved，无必须修复问题

## Outcome
- 半格按已有游戏的半高度形状（1 × 0.5）实现；未收到半宽度需求确认。
- 每卡八个样本、共八张卡，全部形状与原有选项保留；纹理变化直接同步游戏。
- 浏览器截图：full-half-eight-variants.jpg（当前会话可视化目录）。
- 未提交或推送。
