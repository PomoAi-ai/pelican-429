# PLAN -- 玩家飞行装备合批（优化计划 P2）

## Status: done
## Task: 536
## Related: 531, 535
## Baseline Commit: a13fdd68（工作区含大量未提交改动）

## Goal
森林视角下玩家（player-forms）每帧 102 次主视图 + 92 次阴影绘制，主要来自飞行装备 GLB 的几十个小件。把相对父节点静止的同材质部件合成一个网格，减少绘制次数，外观与动画不变。

## Non-goals
- 不改角色本体、头发、武器（`KeyboardWeapon` 有动画通道）。
- 不改 GLB 资源本身。

## Acceptance Criteria
- player-forms 绘制次数明显下降；装备、推进舱、喷焰外观与挂点不变。
- typecheck、全量测试、build 通过。

## Constraints
- 与无人机（535）共用一个合并函数，不复制。

## Decisions
- 跳过 explorer/architect：改动沿用 535 已验证的合并方式，逐文件已明确。
- `mergeStaticParts` 从 `utility-drone.ts` 移到共享的 `src/render/merge-static-parts.ts`，无人机与 Grassy 共用。
- 合并范围：`FlightHarness`、`FlightPod_L/R`、`FlightCuff_L/R` 的直接子网格。GLB 动画通道只指向 `KeyboardWeapon`；带子节点的部件（推进舱挂喷焰）保持独立。
- 分组键为“材质 + 顶点属性名”：同一材质（Flight / graphite titanium）的部件有的带 uv、有的不带，只按材质分组时 `mergeGeometries` 失败；属性分量数等其他不一致仍抛错。
- 合并网格沿用首个部件的 castShadow / receiveShadow / renderOrder。
- 合并位置（任务 538 调整）：从每个 `createGrassyRig` 实例改到 `readAsset` 的共享模板上合并一次，主角实例与 NPC 背包克隆（`createGrassyFlightHarness`）共用合并几何，由 `disposeGrassyAssets` 随资源释放，实例不再单独释放。
- 结果（森林视角，同一浏览器）：player-forms 主视图 102 → 58、阴影 92 → 48，合计 194 → 106。
- 无停止条件，直接实现。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/merge-static-parts.ts（新建） | 共享合并函数，按材质 + 属性集分组 | — | ✓ |
| 2 | src/render/utility-drone.ts | 改用共享函数 | 1 | ✓ |
| 3 | src/render/grassy/grassy-rig.ts | 在共享资源模板上合并飞行装备子网格 | 1 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test`（2034/2034） | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：绘制计数、站立与飞行外观 | yes | ✓ |
