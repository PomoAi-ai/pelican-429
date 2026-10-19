# PLAN -- 跟随无人机 draw call 合并

## Status: done
## Task: 535
## Related: 531
## Baseline Commit: a13fdd68（工作区含未提交改动，快照 1236ae8d）

## Goal
原野每帧约 569 次 draw call 中，两架跟随无人机占 288（主视图 174 + 阴影 114）：每架由近百个小网格拼成且全部投影。降低其提交次数，外观不变。

## Non-goals
- 不改无人机造型、材质、动画与家园工作机逻辑。

## Acceptance Criteria
- 无人机 draw call 明显下降；截图外观一致；typecheck、全量测试、build 通过。

## Constraints
- 遵守 AGENTS.md；展示场与游戏共用同一模型模块，改动在共享模块完成。

## Decisions
- 同一刚体父节点（model / neck / head / gripper）下同材质的静态部件按局部矩阵烘焙后合并为一个网格（BufferGeometryUtils.mergeGeometries）；逐帧转动的光核保留独立，轮子、眼睛、眼睑所在的子组本身会动，不参与跨组合并。属性集不一致时直接抛错（加载期暴露），不静默跳过。合并出的几何随机体释放。
- 只有外壳、轮胎、金属件（pearl / navy / rubber / steel）投影；灯带、镜片、发光件贴在表面或藏在内部，影子不可见。
- 结果：原野森林视角每帧 draw call 569 → 405，其中无人机 288 → 124（主视图 92、阴影 32）；截图外观一致。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/utility-drone.ts | 静态部件按材质合并；只外壳类投影 | — | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test` | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：draw call 统计 + 截图 | yes | ✓ |
