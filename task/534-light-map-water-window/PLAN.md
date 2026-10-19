# PLAN -- 光照图水深按列窗口重算

## Status: done
## Task: 534
## Related: 531
## Baseline Commit: a13fdd68（工作区含未提交改动，快照 fe81de56）

## Goal
水在流动时，光照纹理每 4 帧整图重算水下深度（中型图 3072×192 ≈ 59 万格，每次分配三个整图 Float32Array），平均每帧 7.3 ms、单次约 30 ms。只重算变化的列。

## Non-goals
- 不改水下深度的编码与着色器、不改光照传播算法。
- syncWater 的整图扫描（约 0.6 ms/帧）暂不改。

## Acceptance Criteria
- 窗口计算与整图计算在窗口内逐字节一致；画面水下染色不变。
- water 基准 light 段明显下降；typecheck、全量测试、build 通过。

## Constraints
- 遵守 AGENTS.md。

## Decisions
- computeWaterDepth 增加 [x0, x1] 列窗口：每列独立，岸壁只看左右紧邻列的水面，所以窗口两侧各多算一列即可与整图一致；临时数组按窗口宽分配。
- light-map.syncWater 改为返回介质变化的列范围（原为布尔）；light-texture 合并 syncWater 范围与瓦片变化列，只重算这些列。
- 尝试过按列窗口逐行分段上传纹理（addUpdateRange，每次约 384 段）：water 基准 render 段 CPU 5.2 → 33 ms（ANGLE 上大量小块 texSubImage2D 很慢），已撤回，保留整张上传并注释原因。
- 结果：Node 实测光照更新 8.04 → 0.86 ms/帧；water 基准 CPU 21.1 → 10.2 ms（light 6.0 → 0.7）；截图确认水下、湖床、岸壁染色正常。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/world/water-depth.ts | 列窗口计算 | — | ✓ |
| 2 | test/water-depth.test.ts | 窗口与整图逐字节一致用例 | 1 | ✓ |
| 3 | src/world/light-map.ts | syncWater 返回变化列范围 | — | ✓ |
| 4 | test/light-map.test.ts | 断言具体列范围 | 3 | ✓ |
| 5 | src/render/light-texture.ts | 只重算变化列；整张上传 | 1,3 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test` | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：water 基准 + 截图 | yes | ✓ |
