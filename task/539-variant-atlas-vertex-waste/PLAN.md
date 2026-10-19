# PLAN -- 变体图集顶点浪费（优化计划 P2 · 变体图集分桶）

## Status: done
## Task: 539
## Related: 531
## Baseline Commit: a13fdd68（工作区含大量未提交改动）

## Goal
变体图集（`variant-atlas.ts`）让每个实例跑完整图集的顶点、在着色器里塌缩不属于自己的变体。图集的前提是“每变体几十个三角形”，实测有的图集远超这个规模。在 draw call 预算内减少白跑的顶点。

## Non-goals
- 不迁移 BatchedMesh（需逐个改写依赖 `instanceMatrix` / `USE_INSTANCING_COLOR` 的风场、叶片、瓦片材质，视觉风险大，且本机 GPU 被其他页面争用，无法测得收益）。
- 不改 draw call 预算测试。

## Acceptance Criteria
- 空岛根须每帧处理的三角形明显下降；`render-world-views` 的 draw call 预算（单屏 ≤ 180、洞穴/浮空岛新增 ≤ 10）仍通过。
- typecheck、全量测试、build 通过。

## Decisions
- 实测（森林基准视野，每帧处理 / 有效三角形）：sky-island-roots 464k / 42k，tiles-shrub 371k / 42k，tiles-climb 369k / 37k，sky-island-climbers 406k / 30k（不在森林视野），water-flora-bed 291k / 54k，water-flora-float 73k / 20k。全场景每帧约 204 万三角形，其中约 180 万是退化三角形。
- 先试“每变体一个 InstancedMesh”：根须降到 16k，但 draw call 预算测试失败（最差屏 188 > 180、洞穴/浮空岛 18 > 10）。预算是有意的设计约束，改用折中方案。
- 采用：根须按形态（苔团 / 叶丛 / 垂藤，各 4 个变体，`ROOT_HABIT_VARIANTS`）各建一个小图集，最多多 2 次绘制。结果：根须 464k → 164k，全场景 2040k → 1725k，总绘制 418（不变）。
- 未做：水草（测试明确约束“最多 3 次绘制”）、瓦片区块内的灌木/攀附/地被（按区块各一个图集，按变体或形态拆分会让每屏多出数十次绘制，超出预算）。要继续压，需要用户在“提高 draw call 预算”与“迁移 BatchedMesh”之间选择。
- GPU 收益无法在本机测量：A/B 隐藏图集网格的主场景 GPU 时间被其他 3D 页面的争用淹没（隐藏后反而更慢）；逐次绘制的 timer query 在 ANGLE/Metal 上主要测到拆分编码器的开销。只记录可靠的三角形数。
- 后续：任务 540 把全部图集批次（含本任务的根须）迁到 BatchedMesh，形态分组已撤回。
- 无停止条件，直接实现。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/sky-island-view.ts | 根须按形态分图集 | — | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `node --test test/render-world-views.test.ts`（draw call 预算） | yes | ✓ |
| `npm test`（2036/2036） | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：根须三角形与绘制计数 | yes | ✓ |
