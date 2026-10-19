# PLAN -- NPC 绘制合批（优化计划 P2）

## Status: done
## Task: 538
## Related: 536
## Baseline Commit: a13fdd68（工作区含大量未提交改动）

## Goal
game-app 森林基准每帧约 531 次绘制，其中约 430 次来自角色；Sam 主视图 + 阴影约 150 次、Tibo 约 70 次。来源是 NPC 飞行背包（克隆主角背包但未合并）和程序化武器的小件。

## Non-goals
- 不动 NPC 身体、头发、骨骼动画。
- 无人机（每架 38 个网格，剩下的都是不同材质或会动的部件）与玩家本体不再继续压。

## Acceptance Criteria
- Sam、Tibo 绘制次数明显下降，背包、推进器、武器外观与动作不变。
- typecheck、全量测试、build 通过。

## Decisions
- 跳过 explorer/architect：浏览器按对象统计已定位来源，改动沿用 535/536 的 `mergeStaticParts`。
- 背包：把 536 的逐实例合并移到 `grassy-rig.ts` 的 `readAsset`，在共享模板上合并一次；`createGrassyFlightHarness` 克隆的就是合并后的背包，NPC 无需改动。推进器挂点 `fx_pack_L/R` 是 Object3D，不受合并影响。
- 武器（`npc-weapons.ts`）：只在父组内合并相对父组静止的小件。Sam 合并杖身（root）与三个卫星组内部；水晶、内核、连桥逐帧变换，挂在 head 下不动。Tibo 合并 root、head 与两个棘轮组内部；棘轮组整体旋转，组内小件随组。合并放在所有构造期变换（旋转、缩放）设置之后。合并几何由武器自身 `dispose` 遍历释放。
- 结果（森林基准，同一浏览器）：总绘制 531 → 414；Sam 150 → 71.5、Tibo 70 → 28，玩家 106 不变。
- 无停止条件，直接实现。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/grassy/grassy-rig.ts | 背包合并移到共享资源模板 | — | ✓ |
| 2 | src/render/npc/npc-weapons.ts | 法杖与重置锤静态小件合并 | — | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test`（2036/2036） | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：绘制计数与 NPC 外观 | yes | ✓ |
