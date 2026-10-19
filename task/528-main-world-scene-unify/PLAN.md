# PLAN -- 主世界与场景统一工具控制

## Status: done
## Task: 528
## Related: 525, 526
## Baseline Commit: a13fdd68（工作区含 518–526 未提交改动，以当前工作区为基线）

## Goal
主世界与场景工作区的其他场景统一：同一套工具条结构、同样的世界控制与天气控制、同样的样式与交互；主世界只在其中提供自己的场景控件。去掉 iframe 嵌套与 526 的搬节点写法。

## Non-goals
- 不改原野瓦片玩法、城区建造规则、交通中心流程与存档格式。
- 不改其他场景各自的控件内容。

## Acceptance Criteria
- 场景页“主世界”直接挂载城区（不用 iframe），左侧目录保留，顶部只有一条与其他场景（如 AI 住宅 2）同结构同样式的工具条：左侧标题/状态，中间场景控件，右侧世界控制与天气控制。
- 游戏页 ?mode=game（城区）与原野使用同一套工具条组件与样式，不再有 free-world 专用深色工具条。
- 主世界场景控件：快速旅行（同侧定位、跨侧网址跳转、story 不列城区、交通中心接管时拒绝）、建造（仅城区）、游玩视角、种子/规模/随机世界/GM（城区 GM 进入原野后生效）、地图 M；无保存按钮。
- 工具条右端可收起顶部：收起后站点导航与工具条隐藏、画面全屏，留小把手展开；游戏页默认收起，场景页默认展开。
- 点工具条按钮后焦点回到画布，A/D/空格立即可用；种子输入与规模下拉保留焦点。
- 场景页内从城区走进原野时整页切到游戏页原野。
- AI 住宅 2 等其他场景外观与功能不变。

## Constraints
- AGENTS.md：最小完整改动、无防御性检查、改接口同步调用方不留兼容分支；展示场与游戏共用模块；UI 不写自动测试，浏览器验收。
- 另一会话（524）可能同时改 residence-app.ts / game-app.ts，只改相关段落。

## Decisions
- 用户要求：主世界与其他场景统一，都有一样的工具控制；场景页直接挂载不用 iframe；可收起顶部（游戏页默认收起、场景页默认展开）；清理 526 的搬节点与隐藏旧工具条写法。
- 编号：另一会话已建 527-transit-to-main-world，本任务改为 528；该任务计划交通中心交接后启动 residence-app，主世界入口需与之一致，改动前重读相关文件。
- 探索结论：场景工作区没有共享工具条组件，各场景自写 .residence-toolbar / .room-preview-toolbar / .resource-inspection-toolbar，工作区 ready() 用选择器取第一个并 prepend worldToolbar（WORLD_CONTROLS + 天气控制台），样式全部限定在 .scene-workspace 下；createSceneGameOverlays 提供地图 M / 性能。主世界城区 = residence-app saved+harbor（自带未与工作区共享的 WORLD_CONTROLS 与天气/风力下拉），原野 = game-app（无世界时间；天气在设置面板，默认 precip auto 按区域）。顶部收起依赖 #game-navigation 抽屉（游戏页默认收起，工作区未挂抽屉）；--dev-nav-height 支撑大量 HUD 偏移。
- 原野时间（用户选择）：接入世界时间，原野有昼夜（复用家园的 free-world-daylight）。
- 原野天气（用户选择）：接入同一天气控制台，增加“自动 · 区域天气”选项，原野改动经 settings.set 持久化；选具体天气时为手动。
- 修复（用户报告）：世界控制摘要里的时间用 <output>，Chrome 点它不触发 <summary> 展开；改为 <span>（world-controls.ts 与两处样式），所有场景生效。
- 设计（architect）：新建共享 src/ui/scene-toolbar.ts（外壳 + 世界控制 + 面板互斥/点外关闭/Esc + attach/dispose），天气控制台改为泛型模型 {presets, weather, weatherConfig, set}，新增 auto 预设；scene-mount.ts 新增 createSceneWorld(title) 统一 world 与天气；工作区与独立城区页都用它，删除 residence-app 的 context ? 时间/天气双分支与 HUD 自带世界/天气控件。样式前缀 .scene-workspace 改为 :is(.scene-workspace, .scene-page) 保持优先级。主世界城区 HUD 新增 'world' 模式只生成标题/状态、建造、游玩视角；perspective-controls 暂停/自由镜头按钮改可空。free-world-toolbar 改为可插入宿主工具条的控件片段。原野在 body 上挂 div.scene-page > header.scene-toolbar.scene-toolbar-overlay，昼夜接工具条世界时间，天气写 settings.set。收起顶部统一用 #game-navigation 抽屉：工作区也挂（默认展开）、游戏页默认收起；删除 focusin 自动收起；场景页收起时侧栏与工具条隐藏（工具条高度 0，不用 display:none 以免网格错位）；transitOwner.leave 不再重复挂抽屉。目录 kind 'game' → 'main-world'，删除 iframe；网址跳转删除 demo 参数。
- 独立 AI 住宅页（?mode=homestead&scene=residence）也换成统一工具条：用户要求“主世界和其他场景统一，都一样”，不保留双分支。
- 主线进入原野同样有昼夜与天气控制：与普通原野是同一世界。
- 实现由单个 engineer 完成全部行：各行接口相互依赖，分开派发会出现中间态编译失败。无停止条件。
- 审查后修正：存档状态只隐藏正常态（data-error='true' 时显示）；工具条 Esc 关掉面板时吃掉按键，原野不再同时弹设置；GM 复选框改动后焦点回画布；删除无调用方的 resolveSceneWeatherMode（无测试引用）；设置块 sticky 贴右、为把手留位从工具条移到设置块（设置块隐藏时工具条仍留位，阴影盖住工具条右内边距），中间控件在其下横向滚动；原野保留导航小把手（桌面与手机横屏均不与按钮重叠）；原野小地图天气标签按实际雨雪（precipWeatherMode，与预设高亮共用映射）。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/scene-weather.ts | SceneWeatherPreset 含 auto、sceneWeatherPatch、WILDS_WEATHER_PRESETS、wildsWeatherPreset | | ✓ |
| 2 | src/ui/scene-weather-controls.ts | 泛型天气模型 + sceneWorldWeather 适配器；展开时刷新 | 1 | ✓ |
| 3 | src/ui/scene-toolbar.ts | 新建共享工具条 | | ✓ |
| 4 | src/app/scene-mount.ts | createSceneWorld(title) | 2,3 | ✓ |
| 5 | src/app/scene-workspace.ts | 用 createSceneWorld；attach；删 iframe；main-world case；leave 关闭抽屉 | 4,6 | ✓ |
| 6 | src/app/scene-catalog.ts | kind 'game' → 'main-world' | | ✓ |
| 7 | src/main.ts | 工作区也挂抽屉 | | ✓ |
| 8 | src/ui/game-interface.ts | 删 focusin 自动收起；切换后 blur；展开时显示收起 | | ✓ |
| 9 | src/ui/navigation.css | 把手在工具条右端；原野展开时导航高度 +52px | | ✓ |
| 10 | src/ui/scene-workspace.css | :is 前缀；拆 .residence；overlay；面板 top；收起状态 | 3 | ✓ |
| 11 | src/ui/free-world-toolbar.ts | 改为主世界控件片段 | | ✓ |
| 12 | src/ui/free-world.css | 删深色条，保留片段样式，chapter 规则改 :has | 11 | ✓ |
| 13 | src/ui/residence-hud.ts | 删世界与天气段；新增 'world' 模式；根节点 scene-page | | ✓ |
| 14 | src/ui/residence.css | 删 main-world 隐藏规则 | | ✓ |
| 15 | src/app/perspective-controls.ts | 暂停/自由镜头按钮可空 | | ✓ |
| 16 | src/app/residence-app.ts | mountMainWorld；统一 world；挂控件片段；删 526 搬节点 | 4,11,13,15 | ✓ |
| 17 | src/app/game-app.ts | 原野工具条 + 控件片段 + 设置天气模型；昼夜接世界时间 | 1,2,3,11 | ✓ |
| 18 | src/app/free-world-navigation.ts | 跳转删除 demo 参数 | | ✓ |
| 19 | test/free-world.test.ts | 带 demo 参数的跳转断言 | 18 | ✓ |
| 20 | test/settings.test.ts | wildsWeatherPreset 映射结果 | 1 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| npm test | yes | ✓ |
| npm run build | yes | ✓ |
| 浏览器验收：工作区主世界/AI 住宅 2/其他场景外观与收起；游戏页城区与原野默认收起、昼夜、自动·区域天气持久；点按钮后键盘可用；快速旅行拒绝条件；工作区城区进原野网址干净；527 城内发射与到达 | yes | 部分 ✓（拒绝条件与 527 城内发射/到达未测） |
