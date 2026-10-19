# PLAN -- 开发阶段统一外壳

## Status: done
## Task: 529
## Related: 527, 528
## Baseline Commit: a13fdd68（工作区含 518–528 未提交改动，以当前工作区为基线）

## Goal
开发阶段所有游玩页面（主世界城区、原野、关卡）与场景页使用同一个外壳：顶部站点导航 + 左侧场景目录 + 一条场景工具条，只有一层导航。

## Non-goals
- 不改游戏玩法、关卡内容、存档格式。
- 不做面向发布的独立全屏游戏页（开发阶段统一走外壳）。

## Acceptance Criteria
- ?mode=game（城区）、?mode=game&free=1（原野）、关卡页面都显示外壳：顶部站点导航 + 左侧场景目录 + 统一场景工具条（528）。
- 左侧目录主世界下有城区、原野两项，并列出关卡。
- 城区与原野之间步行、快速旅行跨侧、交通中心发射、着陆返回都在外壳内切换目录条目，不离开外壳；网址可直接打开、刷新、前进后退。
- 原野/关卡在外壳内以无自身导航的内嵌画面运行，画面里只有统一场景工具条，不出现第二层站点导航或目录。
- 528 功能保留：快速旅行、建造、世界控制/天气控制、收起顶部（收起后目录与工具条隐藏、画面全屏）、点按钮后键盘可用。
- 527 交通中心发射与着陆返回主世界正常。

## Constraints
- AGENTS.md：最小完整改动、无防御性检查、改接口同步调用方；UI 浏览器验收为主。
- 另一会话可能同时改 residence-app.ts / game-app.ts / transit-handoff.ts，只改相关段落。

## Decisions
- 范围（用户最终确认）：开发阶段全部作为场景。场景页是唯一入口，?mode=game 也打开它；主世界的城区、原野、各关卡都作为场景直接挂载（不用 iframe）；所有场景用同一套工具条：视角（正视/斜视/俯视/游玩视角/自由镜头/暂停）+ 世界时间 + 天气，再加各自控件（城区：快速旅行、建造；原野：种子、规模；关卡：回到起点）；原野做成场景版，与关卡场景版共用模拟世界与镜头；发射时穿越在场景里播完，再切到关卡场景并着陆；整页游戏版留到发布时再用，手机暂时仍走整页游戏。先前的 iframe 内嵌方案作废。
- 探索结论：main.ts 中 sceneWorkspace = lab/resources/facility，release 版不开放工作区；resolveSceneEntry 不认 mode=game；facility 场景版（facility-app mountFacilityDemo + scene-demo-stage）跑正式模拟世界与机房镜头，有暂停/自由镜头/回到起点，时间天气取 context.world，缺章节 HUD、着陆舱、音频、设置面板；游戏页（game-app）的整页跳转点多处（种子重建、回城、快速旅行、着陆返回、story）；发射交接 transit-handoff 在同文档 startGame 并调用 owner.leave 拆外壳；mountMainWorld 无着陆揭幕闸门；目录只有平铺分区 scenes/perspectives。
- 设计（architect）：工作区是开发版桌面主世界唯一宿主，主世界条目网址即现有游戏网址（?mode=game…），场景间切换统一 context.open(url)（pushState + 微任务派发 popstate）；release、手机、iframe 内仍走整页游戏，整页代码（game-app、frame-loop、startResidence/startTransit 流程、landing-lab）不改。视角控件做成共享片段 src/ui/scene-view-controls.ts（正视/斜视/俯视/游玩视角/自由镜头/暂停），城区、瓦片场景、scene-demo-stage 共用；perspective-controls 导出 tiltCamera。关卡与原野共用新 src/app/tile-scene.ts（从 facility-app 搬出循环、HUD、输入、视角、天气写入模拟、着陆舱与返程、揭幕后启动）；原野场景 src/app/wilds-scene.ts（原野背景、机房、昼夜、区域天气、控件片段、快速旅行、GM 传送、左端回城）。发射交接：TransitOwner 增加场景宿主 {open}，穿越播完后打开目的地关卡条目并 landing=1。SceneMountContext 增加 open 与 revealed（加载层隐藏后才开始着陆/循环）。目录新增“主世界”分组（城区、原野、三关），其他场景另组。
- 取舍（按开发阶段场景编辑定位直接定）：场景版原野不做 NPC、对话、家园、设置面板、音频；天气与工作区共享不持久化；发射到达时显示工作区加载页后再揭幕着陆（不延续星流，两个场景共用一个渲染器无法同屏）；关卡返程保留 527 穿梭层。会覆盖 528 中“主世界不显示视角预设/暂停/自由镜头”的决定。
- 实现由单个 engineer 完成：各行接口相互依赖。无停止条件。
- 实现偏差（engineer）：瓦片场景 setup 另带 tuning（关卡机房调参与原野不同，实体光照与着陆舱镜头距离要用它）；playTileScene 返回 releaseInput 供原野工具条聚焦时释放按键。网址带 bench 的渲染基准仍走整页游戏（基准由整页帧循环驱动）。原野场景切条目不另释放输入，由场景释放时解绑。
- 审查后修正：是否进外壳抽成 app-mode 的 opensSceneGame(params, {release, embedded, coarsePointer})，main.ts 与工作区 openScene 共用，openScene 遇不该进外壳的游戏网址用 gameHost().location.assign 整页跳转（手机/iframe 宿主下发射与点主世界条目都回整页游戏）；删交通中心“全屏试玩”链接；原野背景板朝向相机、放在视线与玩法平面交点后 121 格并按该深度定尺寸（正视与原 z=-121 平面一致）；返程穿梭层释放时 forceContextLoss；scene-demo-stage 自由镜头下点预设用 tiltCamera 保持自由镜头并同步游玩视角按钮；删 tile-scene 不成立的 aborted 检查；freeWorldSearch 去掉 from；原野场景接入 installDebugKeys（GM 时倒水、风、降水、假人射击键，tile-scene 每步按 pour 倒水），V 与降水键改的天气每帧会被工作区天气控件覆盖。exposeDebug 不接：它要的帧循环句柄（cameraRig 之外的 stepper、tracker、orbs 等）在瓦片场景内部，只为调试全局变量不值得外抛。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/app-mode.ts | isSceneGameLevel | | ✓ |
| 2 | src/app/free-world-navigation.ts | keepWorldParams | | ✓ |
| 3 | src/app/scene-catalog.ts | world 分组、城区/原野/三关条目、resolve 认 game 网址 | 1 | ✓ |
| 4 | test/app-mode.test.ts | resolveSceneEntry 与 isSceneGameLevel 用例 | 1,3 | ✓ |
| 5 | test/free-world.test.ts | keepWorldParams 断言 | 2 | ✓ |
| 6 | src/app/scene-mount.ts | context.open、revealed | | ✓ |
| 7 | src/app/scene-workspace.ts | openScene、{open} owner、revealed、目录分组、主世界条目重挂、点击拦截、wilds case | 2,3,6,20 | ✓ |
| 8 | src/main.ts | 开发版桌面 mode=game 进工作区 | 1 | ✓ |
| 9 | src/app/transit-handoff.ts | 场景宿主 owner 提前返回 handoff；keepWorldParams | 2 | ✓ |
| 10 | src/app/transit-app.ts | 独立页 context 补 open 与 revealed | 6 | ✓ |
| 11 | src/ui/scene-view-controls.ts | 共享视角片段与角度常量 | | ✓ |
| 12 | src/app/perspective-controls.ts | 导出 tiltCamera；按钮改回非空 | | ✓ |
| 13 | src/ui/residence-hud.ts | 所有模式输出视角片段 | 11 | ✓ |
| 14 | src/ui/residence.css | 视角按钮选择器改名 | 13 | ✓ |
| 15 | src/app/residence-app.ts | 视角接线、go 函数、owner、revealed 揭幕 | 6,9,11,12 | ✓ |
| 16 | src/app/scene-demo-stage.ts | 视角片段与接线 | 11 | ✓ |
| 17 | src/app/tile-scene.ts | 新建共用瓦片场景 | 6,11,12 | ✓ |
| 18 | src/app/facility-app.ts | 关卡场景改用 tile-scene，章节出生点与 landing | 17 | ✓ |
| 19 | src/app/precip-wiring.ts | 镜头参数类型放宽 | | ✓ |
| 20 | src/app/wilds-scene.ts | 新建原野场景 | 2,17,19 | ✓ |
| 21 | src/ui/scene-workspace.css | 目录分组与视角按钮样式 | 7,16 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| npm test | yes | ✓ 2033/2033 |
| npm run build | yes | ✓ |
| 浏览器验收：三类入口显示外壳与分组；视角六按钮；城区原野双向走动与跨侧快速旅行；种子/规模/GM；前进后退刷新；城内发射与 level=transit 发射到关卡着陆；关卡起飞返回城区；时间连续与自动天气；手机/release/着陆测试场仍整页 | yes | 部分 ✓（城内登舰发射未驱动；手机/release 未测） |
