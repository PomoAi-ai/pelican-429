# PLAN -- 变体图集迁移 BatchedMesh（优化计划 P2 · 变体图集分桶）

## Status: done
## Task: 540
## Related: 539
## Baseline Commit: a13fdd68（工作区含大量未提交改动）

## Goal
消除变体图集的顶点浪费（539 实测每帧约 180 万个退化三角形），同时不突破 draw call 预算测试。

## Non-goals
- 悬浮微粒（water-flora-motes）保持 InstancedMesh：依赖逐实例 `aFade` 属性，图集只有 17 个三角形。
- 不改 draw call 预算。

## Acceptance Criteria
- 地被、灌木、攀附、水草湖底/漂浮、空岛根须每个实例只画自己的变体；每个批次仍是 1 次绘制。
- 风摆、扰动、实例颜色、光照图、云影外观不变。
- typecheck、全量测试、build 通过。

## Decisions
- 选 BatchedMesh（multi-draw，逐实例视锥剔除），不放宽预算：仓库已有洞穴装饰、背景墙两处 BatchedMesh 先例，光照图与云影挂接已支持 `USE_BATCHING`，flora 风场材质也已支持。
- `variant-atlas.createVariantBatch(atlas, variants, material)`：图集格式与各 `create*Mesh` 签名不变；按 `aVar` 连续段把图集切回各变体子几何（每个图集 WeakMap 缓存一份，仅 CPU 数组），实例 id = 原下标，`setMatrixAt` / `setColorAt` 用法不变。`sortObjects = false`、`perObjectFrustumCulled = true`。
- 材质里的变体塌缩只在 `USE_INSTANCING` 下生效，批次下自然不起作用，材质不改；补 `USE_BATCHING` 分支的着色器：`tree-material` 叶片风场、`tree-wind` 枝干弯曲、`flora-shrubs` 草地扰动。
- 静态批次（区块、空岛）保留整体包围球剔除；水草漂浮逐帧移动，`frustumCulled = false`，可见性仍由“视野内有湖”控制。
- tile-view 区块新增 `batches`（自身持有几何与实例纹理，卸载时 dispose）；539 的根须形态分组撤回为单个批次。
- 测试：render-shrubs、render-smallflora 两个用例改为查找 BatchedMesh（意图“每区块 1 个网格”不变）；新增用例断言批次里每个实例的顶点数等于其变体本身、非法变体即抛。
- 结果（森林基准视野）：每帧三角形（批次按全部实例计的上限）2040k → 1168k，性能面板实测 916k；根须 464k → 42k、湖底 291k → 54k、漂浮 73k → 20k；draw 425（不变）。
- 浏览器验收：湖面睡莲/花、坡地灌木浆果色、泥土正面常春藤、香蒲外观正常，无报错。
- 无停止条件，直接实现。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/variant-atlas.ts | `createVariantBatch` 与图集切片 | — | ✓ |
| 2 | src/render/tree-material.ts, src/render/tree-wind.ts, src/render/flora-shrubs.ts | 着色器 `USE_BATCHING` 分支 | — | ✓ |
| 3 | src/render/flora-cover.ts, src/render/flora-shrubs.ts, src/render/face-climbers.ts | 网格工厂改用批次 | 1 | ✓ |
| 4 | src/render/water-flora-view.ts | 湖底/漂浮改用批次 | 1 | ✓ |
| 5 | src/render/sky-island-view.ts | 根须单批次；攀附按网格释放 | 1 | ✓ |
| 6 | src/render/tile-view.ts, src/render/plant-attachments.ts, src/app/definition-scene-layout.ts | 类型与释放适配 | 3 | ✓ |
| 7 | test/render-shrubs.test.ts, test/render-smallflora.test.ts | 用例改查批次；新增批次用例 | 1,3 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test`（2037/2037） | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：三角形/绘制计数与植被外观 | yes | ✓ |
