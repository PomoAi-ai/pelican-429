# PLAN -- 游玩中着色器重编卡顿（点光源数波动）

## Status: done
## Task: 533
## Related: 531, 532
## Baseline Commit: a13fdd68（工作区含未提交改动，快照 322e6c5c）

## Goal
消除游玩中 100-780 ms 的长帧：剖析显示长帧里 25% 在同步取着色器链接结果，且每次长帧都伴随新程序编译。

## Non-goals
- 不改各点光源的拥有者（机房、无人机、NPC 技能特效、光球、Luma）与灯光效果。
- 不做光源池化或灯光数上限。

## Acceptance Criteria
- forest 基准采样期间新编译的程序数显著下降；画面灯光不变。
- typecheck、全量测试、build 通过。

## Constraints
- 遵守 AGENTS.md；渲染不写自动测试。

## Decisions
- 证据：同名程序（precip-rain-streaks、precip-veil、BackgroundMaterial 等）的程序键只在第 35 项（可见点光源数）不同：5 / 7 / 11。场景 25 个点光源中，机房 18 个随机房显隐、无人机与 NPC 技能特效也会显隐；three 的 getParameters 无条件把可见点光源数写进程序键，数目一变全部受影响材质当帧重编。
- 方案：Stage 维护零强度占位点光源，把可见点光源数补到历史最高值（只增不减），render / renderTexture 内调用；compileForStage 编译前也调用，预热时的程序键与真实渲染一致。占位灯强度为 0，light-texture 的动态光槽按 intensity>0 过滤，不受影响。
- 未采用：固定上限光源池（要改所有灯光拥有者）；预热时枚举所有可能灯数（程序数量成倍增长）。
- 代价：受光材质按历史最高灯数编译，每片元多循环几盏零强度灯；最高值来自实际出现过的数目，不会无限增长。
- 同任务追加：bench JSON 增加 `programsCompiledDuringSampling`，用来复查卡顿。
- 结果：forest 基准 25 秒内新增程序 19 → 1；同期帧耗时受用户同时打开的其他 3D 页面占用 GPU 影响，未作帧耗时结论。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/stage.ts | 占位点光源补齐到历史最高值；render/renderTexture 调用 | — | ✓ |
| 2 | src/render/warm-up.ts | compileForStage 编译前调用 padPointLights | 1 | ✓ |
| 3 | src/app/bench.ts | JSON 增加采样期新编译程序数 | — | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test`（2033/2033） | yes | ✓ |
| 浏览器：forest 基准 25 秒程序数监测 | yes | ✓ |
| `npm run build` | yes | ✓ |
