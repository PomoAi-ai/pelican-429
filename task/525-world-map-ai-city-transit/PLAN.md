# PLAN -- 世界地图整合：出生区换成 AI 城市 2，城区左侧接星舰交通中心

## Status: done
## Task: 525
## Related: 522, 524
## Baseline Commit: a13fdd68（工作区含 518–524 未提交改动，以当前工作区为基线）

## Goal
世界地图的起点改为“AI 城市 2”（residence-2 港湾城区，透视场景，建筑/门/建造/地下全保留），星舰交通中心并入城区左侧同一条街、同一个角色，可直接走过去登舰发射；从城区右端走出切换进原自由世界原野。原自由世界的渔屋出生区去掉。

## Non-goals
- 不做着陆舱（524 另一会话负责）。
- 不改交通中心发射/穿越/加载流程与 AI 住宅 2 本身的建筑内容。
- 不刻意改动世界生成的其余区域；去掉渔屋会连带改变沙漠/浮岛/地形组合选址（用户已要求去掉原出生区，接受）。

## Acceptance Criteria
- 进入世界地图时出生在 AI 城市 2 城区。
- 城区左侧是星舰交通中心，与城区同一条街、同一角色、同一套输入，步行可达；能乘电梯、登舱、选目的地并发射。
- 从城区右端走出进入自由世界原野（原野左端入场）；原渔屋出生区不再生成。
- 游戏与展示场复用同一模型、材质与生成函数。
- 同一种子生成同一世界；逻辑层不引入 three/DOM/随机。

## Constraints
- 遵守 AGENTS.md 分层、编码与测试规则。
- 524 会话可能同时改 game-app 等装配文件，装配点改动最小，避免互相覆盖。

## Decisions
- “AI 城市 2”= 场景目录 residence-2（AI 住宅 2，harbor 变体）。
- 整合方式（用户选择）：起点城市为透视场景，交通中心并入城区左侧同街；城区右端切换进瓦片自由世界原野；去掉原渔屋出生区。否决栅格化进瓦片世界（有损、代价高）与传送入口方案。
- 探索结论：自由世界为纯瓦片物理（free-world.ts generateFreeWorld，出生点 = 原野最近渔屋门外）；住宅 2 / 交通中心为 DefinitionCollision + perspective-player；两者零件同源但 app 层各有相机/输入/玩家。交通中心坐标全为绝对值，需引入原点；transit-pad-cloud 世界坐标 uniform 与地面 y=0 写死；住宅存档含左侧分段构件，需处理与交通中心重叠。

- 架构方案（architect）：城市 = residence-app 存档模式 harbor 变体；`mode=game` 无 level 且无 free=1 → 城市。交通中心抽成 `createTransitStation(host)`，独立页与城市两宿主；城市中地面阶段由 perspective-controls 驱动唯一玩家，电梯/登舱/发射/穿越阶段交通中心接管角色姿态与镜头；sim/transit、config/transit、transit-handoff 不改（判定用 body − origin）。两世界间用网址跳转（location.assign）切换；自由世界出生点改为原野左端第一块干燥平地，hutCount 0 仅对自由世界生效。
- 星舰中心位置（用户选择）：紧邻主城区左侧。街道右缘落在 x≈26（主院区园廊 28 之前），origin ≈ (-76, 1.5)，用地约 [-120, 26)；-1 段分段构件与该范围地面方石被清除，更左侧城区照常延伸。
- 地图拓扑（用户说明）：一整张、两端封死不循环；城区居中，左为星舰中心，右接原野。原野左端往左走返回城区右端（回程要做）；城区右端往右进入原野左端。
- 存档（用户决定）：旧场景不管，港湾存档键升 v2，不迁移 v1；读取 v2→原版→示例后执行用地清理再写 v2。用地下方地下可挖可修，只禁地面及以上建造。
- 城市里不建交通中心街道端墙（streetEnds=false），不加载运河背景，用城市湖景。
- E 键：用地内地面阶段捕获阶段拦截为交互，其余仍为技能。
- 用地实际取值（实现核实）：主院区最左构件是庭院短灯 x 25（非园廊 28），街道右缘改为 x 23，origin = (-79, 1.5)，用地 [-121, 23)，由 TRANSIT.walkwayMinX/MaxX 推导；用地内清除 y ≥ foundationTop 的构件（含地面方石），地下格与地下构件保留。
- 城内交通中心街面碰撞改为半格厚板（-0.5..0），与城区地面方石同厚，用地下方地下可挖。
- 城内不建护岸墙，街面两端各加一道低矮路缘收口，接缝处露出城区自身地下。
- 穿越阶段城区根节点加 residence-in-flight：舞台全屏、隐藏城区工具栏与 HUD；交接时宿主视口随交通中心层移动，其小地图在 .transit-handoff 下隐藏。
- 审查后修正：generateFreeWorld 增加 entry（wilds 左端入场无渔屋 / hut 家园模式保留渔屋出生区，家园设施与存档依赖渔屋布局）；原野左端回城排除 story；街面碰撞板与用地同宽（TRANSIT.pavingMargin 统一铺装外扩）；near() 同时判断街面高度，地下按 E 仍是技能；交通中心接管期间禁用建造与暂停按钮；站点目录“自由世界”描述改为城区出发。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/world/spawn-home.ts | 导出 flatAt、bodyHitsSolid | | ✓ |
| 2 | src/world/free-world.ts | 原野 hutCount 0；出生点 = 左端第一块干燥平地（entrySpawn）；安全区以入口为锚；无 spawnFacing | 1 | ✓ |
| 3 | src/world/free-world-regions.ts | wilds 标签改为“原野入口 · Sam 与 Tibo” | 2 | ✓ |
| 4 | test/free-world.test.ts | 更新 :36/:168/:187，新增左端入场用例（多种子含 7） | 2 | ✓ |
| 5 | test/free-world-backgrounds.test.ts | 湖/沙漠交界夹具换成实际存在的交界 | 2 | ✓ |
| 6 | src/config/residence.ts | RESIDENCE_TRANSIT：用地范围与原点（紧邻主院区左侧） | | ✓ |
| 7 | src/sim/residence.ts | reserveResidenceSite：清除用地内构件与地面、记录 reserved、用地内拒绝放置 | 6 | ✓ |
| 8 | src/app/residence-save.ts | 港湾存档键 v2（不迁移 v1） | | ✓ |
| 9 | test/residence.test.ts | 用地清理与禁建用例 | 7 | ✓ |
| 10 | src/render/ai-city-environment.ts | 空出用地 x 范围的 ground 层 | | ✓ |
| 11 | src/render/harbor-residence-environment.ts | 透传空地范围 | 10 | ✓ |
| 12 | src/render/transit-pad-cloud.ts | 起点 x 与地面 y 取自模型世界位置 | | ✓ |
| 13 | src/render/transit-center-model.ts | streetEnds 参数 | | ✓ |
| 14 | src/app/transit-controls.ts | 追加 section 而非替换；hosted 类 | | ✓ |
| 15 | src/ui/transit.css | transit-hosted 叠层规则 | 14 | ✓ |
| 16 | src/app/transit-pilot.ts | 原点、body getter、teleport 回调；导出碰撞、steer、transitWalkZ | | ✓ |
| 17 | src/app/transit-station.ts | 新建交通中心单元 createTransitStation(host) | 12,13,14,16 | ✓ |
| 18 | src/app/transit-app.ts | 缩为独立宿主 | 17 | ✓ |
| 19 | src/app/perspective-controls.ts | steer 选项 | | ✓ |
| 20 | src/app/residence-app.ts | 挂载交通中心、存档迁移与用地清理、walkZ 组合、阶段接管、右端出口、from=wilds 右端出生、传送特例、owner/dispose | 6,7,8,11,17,19,21 | ✓ |
| 21 | src/app/free-world-navigation.ts | worldMapSearch(current, 'city'|'wilds') | | ✓ |
| 22 | src/main.ts | mode=game 无 level 无 free → 城市 | | ✓ |
| 23 | src/app/scene-workspace.ts | 交通中心 owner 抽常量并传给 residence 分支 | 20 | ✓ |
| 24 | src/app/game-app.ts | 原野左端返回城市（自由世界非主线、非家园模式，玩家碰到左墙触发一次） | 21 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| node --test test/free-world.test.ts test/free-world-backgrounds.test.ts test/free-world-npcs.test.ts test/spawn-home.test.ts test/residence.test.ts test/transit.test.ts test/definition-collision.test.ts test/perspective-player.test.ts test/render-fish.test.ts test/architecture.test.ts | yes | ✓（含于 npm test） |
| npm test | yes | ✓ 2017/2017 |
| npm run build | yes | ✓ |
| 浏览器验收：城市出生、走到星舰中心登舰发射全流程、穿越隐藏城市、右端进原野、原野左端回城、旧存档迁移、独立交通中心页不变 | yes | ✓ 城市出生/起飞全流程/穿越全屏/抵达堡垒/原野左端回城右端/右侧接缝已验；旧存档按决定不迁移；独立交通中心页正常 |
