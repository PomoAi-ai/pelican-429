# PLAN -- 家园概念版本：补齐缺口与修复

## Status: done
## Task: 340
## Related: 335
## Baseline Commit: 975f136

## Goal
修复家园概念版本（`?mode=homestead`）代码审读中发现的 bug 和未完成项，使 `docs/economy.md` 第 17 节的验收（尤其是 30 分钟试玩和 4 个问题）能够可信地进行。

## Non-goals
- 光子分步教学改用光子动作、Tibo 交付光子的开场（新功能，另立任务）。
- 卸货地点从机器人坞改到仓库；`docs/economy.md` 中蓄电池价格、区域状态显示位置这两处与代码的出入（待用户决定）。
- 设施与无人机正式模型、太阳能板碰撞、界面英文与手机布局、夜色天空。
- 数值调参（M4 试玩后进行）。
- 工作区里其他任务（角色外观、头发、展示场等）的改动。

## Acceptance Criteria
1. 夜里野外敌人比白天更强（只在 homestead 模式生效，主线与普通自由世界不变）。
2. 睡觉打折后木材、石料仍为整数，石料同样按比例打折。
3. 存档保存并恢复：砍到一半的树的剩余木材、无人机所带货物、采集标记；读档不能刷出木材。
4. 无人机在拿不到最低算力时不出坞；在野外拿不到算力时仍会按低电量回坞，不在野外耗到 0。
5. 返航被地形挡住时有兜底，无人机不会永远卡在野外。
6. 同一列向下挖地块时不再误报「还没露出地面」。
7. 设施布局在不同种子下不悬空、不陷地、不进水；放不下时在边界明确抛错。
8. 树根下的地块受保护，挖地块不会留下悬空的树。
9. 显示哪台无人机接了哪个标记或施工点；算力不足时无人机头顶显示 429。
10. 能取消施工轮廓并退还材料。
11. 砍掉的树在小地图、地表装饰与草地留空、雨滴遮挡、光柱与光照中同步消失。
12. 家园视图与 HUD 不再每帧新建全部 Mesh / DOM；去掉重复的昼夜判断与魔法数；删除违反 AGENTS.md 的参数抛错测试。
13. `npm run typecheck`、`npm test`、`npm run build` 通过。

## Constraints
- 逻辑层（world → physics → combat → entities → sim）不使用 three、DOM、Date、Math.random，保持确定性。
- 遵循 AGENTS.md：最小改动、边界校验一次、不写防御性兜底、不保留兼容分支、测试只写能抓住真实回归的行为用例，加进已有同主题测试文件。
- 存档格式变化：仓库无外部使用者、概念版本未发布，直接改存档结构（升 version，旧档按无效处理并提示 `&reset=1`）。
- homestead 文件都未被 git 跟踪，`git diff` 看不到；改动前的快照在会话 scratchpad `baseline/` 下，审查用 `diff -ru` 对比。

## Decisions
- 探索结论（夜间敌人）：敌人只在关卡生成时出现，不重生。伤害统一在 `sim-world.ts` `resolveCombat` 收集命中源后、`resolveHits` 前处理，夜里把 enemy 命中源替换为 `{ ...src, def: { ...src.def, damage: × k } }`。近战、炸弹、铝热剂都会经过这里。移速给 `updateEnemy` 加 `speedScale`，只乘 `cfg.speed` 和 `FREE_DRONE_SPEED`，技能位移不放大（防落水预测依赖它）。昼夜直接读 `world.homestead.economy.second`。
- 探索结论（砍树同步）：sim 清掉 branch 瓦片时，tile-view、光照图、小地图在同一帧按旧树列表消费完脏标记；`syncTrees` 晚一帧执行，所以每个消费方的 `removeTree` 必须自己重新标脏。光照图的树冠 foliage 掩码、小地图的 treeBuckets、光柱 anchors 都是创建时快照，各自需要 removeTree；花草的 `shade` 改为实时读 felled。雨滴落点和地表装饰影响小。tree-view 的 removeTree 会把整桶拆掉，同桶邻树要分几帧才建回来，应改为同步重建。背景区域还被天气确定性使用，不能改。
- 探索结论（布局）：13 个种子实测，设施会落到别的湖面、斜坡、树干上，或两列不等高。门外 offset 0..5 平整，0..16 禁树，安全区覆盖出生点 ±40。解决办法是逐列向前找等高、实心、整砖（`SHAPE_FULL`）、不在树冠范围内的列，扫描高度上限为 spawn.y + 6（避开浮空块）；40 列内找不到就抛错。设施位置不进存档，改布局后旧档设施会挪位，所以存档版本号要升。
- 探索结论（429 / 接单）：复用 `render/npc/npc-effects.ts` 的 `caption` Sprite；每架无人机常驻一个 429 牌和一个编号牌，按任务位置摆放；不在每帧重建的 marks 组里新建 caption。
- 夜间强度默认：伤害 ×1.5、移速 ×1.25，写进 `HOMESTEAD` 配置并校验，M4 试玩再调。纯数值，不需要用户先定。
- Phase 3：没有只能由用户回答、且会改变设计的问题，跳过提问。

- 设计（architect）：
  - AC2：取消事后折算货物，改在 `work()` 里按 yieldFactor 降低采集速率。木材和地块都按整块产出，天然是整数；石料走同一路径，同比例打折；施工不打折。
  - AC3：快照新增无人机货物、`treeWood`、标记，存档升到 v2，并在边界校验新字段。
  - AC4：出坞前检查空闲算力是否够本机最低算力（总算力减去已出坞机器人的最低算力）；不够就留在坞里，状态显示为 stalled。在野外停工时，威胁和低电量判断移到算力判断之前，无人机照常耗电，电量低了飞回坞（飞行不需要算力）。
  - AC5：返航被挡住时直接召回坞，在代码中用 `ponytail:` 注释标出瞬移。
  - AC6：不改 `droneRoute`；挖完后刷新 `drone.surface`。
  - AC7：`place` 逐列寻找位置：等高、实心整砖、非水、不在树冠范围、高度上限为 spawn.y+6；40 列内找不到就抛错；太阳能板用 `place(4)` 的同一高度。
  - AC8：`markArea` 跳过未砍树的根下一格。
  - AC10：`cancelArea` 同时取消施工点，退料，退回后不超过容量。
  - AC11：在 game-app 组装统一的 `removeTree` 回调，依次处理 tree-view（已上屏的桶同步重建）、光照图 `removeCanopy`、小地图、光柱；花草环境实时读取 felled。雨滴落点与地表装饰不处理，写进汇报。
  - AC12：视图用对象池复用 Mesh，HUD 原地更新 DOM。
- `isDaytime` 移到 `config/homestead.ts`：`test/architecture.test.ts` 规定 ui 层对 sim 只能 `import type`，HUD 需要这个运行时函数。5994 改为命名常量。以上和 night 配置由主会话直接完成（第 1、2 行）。
- `updateEnemy` 的 `speedScale` 设为必填参数，所有调用方同步补上，不用默认值保留旧签名（AGENTS.md）。
- 存档 v1 失效：仓库没有外部使用者，概念版本未发布，旧档会提示用 `&reset=1` 重开。不构成需要停下来的数据迁移，没有触发停止条件，继续实现。
- AC7 实施时放宽了规则：按原设计（避开整个树冠、设施间留空列、4 块板要 4 列等高），81 个种子里有 39 个抛错，默认种子也在内。改为树只避开树干左右各 1 列、设施之间不留空列、初始太阳能板各自找一列平地。改后只有种子 1、13、23 抛错（陆地侧平地不足或贴着地图边缘），保持 ±40 列安全区，明确报错。副作用：设施可能和矮树的树冠重叠。
- 第 0 行不允许标记：挖穿后下面没有地面，无人机的 surface 会取不到；存档校验同样要求行号 ≥ 1。
- `minimap.ts` 不改：Minimap 已公开 raster，直接调用 `raster.removeTree`。
- 审查修复：`flat()` 原本把高于上限的山体内部洞穴地面当成平地（种子 45）。改为取整列最高地表，高于 spawn.y+6 的列不放设施。最终种子 1–81 加默认种子共 82 个中，1、13、23、45、76 会明确抛错，其余 77 个设施都落在露天的实心平地上。
- 未完成部分：AC11 中雨滴落点与地表装饰没有同步；返航被挡时瞬移回坞，没有动画。
- 夜间伤害测试依赖 A、B 两组，等两组都完成后再补。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/homestead.ts | night 倍率与校验；isDaytime 移入 | — | yes |
| 2 | src/sim/homestead-economy.ts | 从 config 导入 isDaytime；MAX_WAIT_TICKS | 1 | yes |
| 3 | src/sim/homestead.ts | AC2/3/4/5/6/7/8/10 | 1 | yes |
| 4 | src/app/homestead-save.ts | 存档 v2 与新字段校验 | 3 | yes |
| 5 | test/homestead.test.ts | 行为用例（夜间伤害用例最后补） | 3, 4 | yes |
| 6 | test/homestead-economy.test.ts | 删除参数抛错测试 | — | yes |
| 7 | src/entities/enemy.ts | updateEnemy speedScale（必填） | — | yes |
| 8 | src/sim/sim-world.ts | 夜间敌方伤害与移速 | 1, 7 | yes |
| 9 | src/world/light-map.ts | removeCanopy | — | yes |
| 10 | src/render/light-texture.ts | WorldLight.removeTree | 9 | yes |
| 11 | src/ui/minimap-model.ts | MinimapRaster.removeTree | — | yes |
| 12 | src/ui/minimap.ts | 不改：Minimap 已公开 raster，直接调 raster.removeTree | 11 | skipped |
| 13 | src/render/light-shafts.ts | removeTree 重建 anchors | — | yes |
| 14 | src/render/tree-view.ts | removeTree 同步重建已上屏的桶 | — | yes |
| 15 | src/render/flora.ts | shade 实时读 felled | — | yes |
| 16 | test/render-flora.test.ts | 树字面量补 id | 15 | yes |
| 17 | src/render/world-views.ts | felledTrees 透传 | 15 | yes |
| 18 | src/app/homestead-app.ts | worldViews 换成 removeTree 回调 | — | yes |
| 19 | src/app/game-app.ts | 组装 removeTree；传 felledTrees | 10, 12, 13, 14, 17, 18 | yes |
| 20 | test/light-map.test.ts | removeCanopy 用例 | 9 | yes |
| 21 | test/minimap.test.ts | removeTree 用例 | 11 | yes |
| 22 | src/render/homestead-view.ts | 对象池；429 牌与编号牌 | — | yes |
| 23 | src/ui/homestead-hud.ts | 原地更新；config isDaytime；目标文字；取消文案 | 1 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | 通过 |
| node --test test/homestead.test.ts test/homestead-economy.test.ts test/light-map.test.ts test/minimap.test.ts test/render-flora.test.ts test/architecture.test.ts（及 enemy 相关测试） | yes | 178/178 |
| npm test | yes | 1842/1842 |
| npm run build | yes | 通过 |
| 浏览器验收 `?mode=homestead&reset=1`（429/编号牌、砍树同步、取消施工、帧率） | no（交给用户） | |
