# PLAN -- AI 住宅游戏内 HUD（模块科技风）

## Status: done
## Task: 495
## Related: N/A
## Baseline Commit: c292d188

## Goal
把「界面与操作」原型（`public/concepts/ui-controls-concept.html`）的布局与模块科技风皮肤做成游戏自己的 HUD，由游戏 UI 层渲染，不再是原型页上的悬浮层。**范围是全部有玩家 HUD 的场景**（用户：“完全修改，这次是最终修改，全部都修改，不是只在这儿”）：正式游戏（`game-app`）、AI 住宅两个入口、scene-demo、房间透视、设施页，统一用同一套 HUD 模块和皮肤。缺数据的部分一律用示例数据，完成后再和用户讨论怎么接入。

1. 第一批（接真数据）：左上人物卡（头像、血量、护盾）；左下技能栏（含大招充能环）；右上小地图，顶部整合天气与时间；统一模块科技皮肤（白瓷面板、钴蓝角块、金色接缝、青色灯条）。
2. 第二批（示例数据）：人物卡下方电力 / 算力 / Token 小条；其下无人机卡；物品面板（I 打开，含 1 格回收站，关闭面板前可取回，关闭时删除）。
3. 最后：场景里两台可点击的无人机，点击弹出 NPC 式对话（去挖掘 / 去建造 / 取消，按 1–3 也可选）；选择后左键按游戏格子坐标放标记，右键点标记取消、点空白或 Esc 结束。

## Non-goals
- 电网、算力、Token、物品、无人机工作的真实玩法逻辑（只做界面与示例数据）。
- 全地图、电网详情、键位总览、建造栏的游戏内实现。

## Acceptance Criteria
- AI 住宅两个入口中，HUD 由游戏 UI 层渲染，布局与原型一致：左上人物卡 → 资源小条 → 无人机卡；右上小地图（顶部天气 + 时间）；左下技能栏。
- 血量、护盾、技能冷却与大招充能、时间、天气、小地图显示真实游戏数据。
- 皮肤统一为模块科技风，图标使用 `public/concepts/ui-controls-assets/` 中的渲染素材（迁到游戏共享资源位置）。
- I 打开物品面板；回收站 1 格，关闭前可取回，关闭时删除。
- 点击场景中的无人机弹出对话；选择挖掘 / 建造后可在格子上放标记并取消、结束。
- 游戏与展示场共用同一套 HUD 模块，不复制实现。

## Constraints
- 遵守 AGENTS.md 分层：逻辑层不依赖 DOM / three；表现层在 `src/ui`、`src/render`、`src/app`。
- 不修改 `src/vendor/pelican-3d`。
- 渲染、UI 由人在浏览器验收，不写 UI 自动测试；纯逻辑（如回收站规则、标记格子增删）如新增则在已有同主题测试文件加用例。
- 不提交，交由 `/dev:commit`。

## Decisions
- 用户已明确同意直接完成，不再请示设计。
- 探索结论（HUD）：住宅玩家 HUD 是 `.room-preview-hud` 里由共享的 `createWeaponHud` 填充（`perspective-controls.ts:60`），同一模块还服务 scene-demo、房间透视、设施页、正式游戏；直接改 `weapon-hud.ts` 或共享样式会波及它们，所以新皮肤和新增面板只作用于 `.residence` 作用域。
- 数据来源：血量 `player.entity.health`；技能冷却 `humanCombat.cooldowns`；时间 `gameTime` + `calendarOf`；天气在 demo 模式取 `context.world.weather`，saved 模式取下拉框；小地图 `createPlayableDefinitionMinimap`。仓库没有护盾、光子充能（住宅里写死 0 且被 CSS 隐藏）、资源、无人机、背包数据 → 这些用示例数据，护盾与大招充能环也是示例。
- 探索结论（输入）：I、Tab 未绑定；1–3、E、左右键是技能；不改 `DEFAULT_BINDINGS`，在住宅层用 window 捕获阶段监听（参照 `scene-game-overlays.ts` 的 M 键）处理 I / Tab / Esc / 对话 1–3。标记模式左右键要与开火、技能、Orbit 右键平移隔开。格子 1 世界单位 = 1 格，拾取用 z=0 平面并 `Math.floor`；世界坐标投影到 DOM 用 `perspective-controls` 内部的 `project`（未导出）。
- 素材：从 `public/concepts/ui-controls-assets/` 迁到 `public/ui/hud/`，并加进 `vite.config.ts` 发布白名单。
- 设计（architect，全局版）：新模块 `src/ui/game-hud.ts` + `game-hud.css`，挂在每个创建 `createWeaponHud` 的地方（perspective-controls 覆盖住宅 / scene-demo / room-preview，另有 facility-app、game-app），共用同一个 `project`；技能栏在 `control-surface.css` 原地换皮，旧主卡隐藏，由新人物卡取代；大招环用 weapon-hud 已有的真实冷却环（无数据的场景显示满环就绪）；三种小地图统一加 `hud-map` 外框，由 `attachMap` 插入天气 / 日期 / 时钟顶栏；时间天气缺失时用示例值；输入用 window capture 监听，只在新 HUD 自己有东西打开时拦截 Esc / I / Tab / 1–3，`dialog[open]` 时整体放行，家园保留 Tab 指挥模式（`tabOpensDrone: !world.homestead`）；标记模式下画布左右键在 capture 阶段截住，不开火、不转镜头；`pickTile` 用各场景已有的 `screenToWorld` 取整。
- 不写新测试：全部是界面与示例数据，按 AGENTS.md 由人在浏览器验收。
- 无停止条件（无数据迁移、无外部副作用），直接实现。
- 浏览器验收发现页面级按钮规则（`.scene-workspace :is(button, select)`、`.residence-demo :is(button, select)`）会把场景内 HUD 按钮染成深色；在这两条规则上排除 `.room-preview-hud *`，不在 HUD 侧抬高选择器权重。`.hud-bar` 与敌人血条类名冲突，改名 `.hud-gauge`；地图顶栏日期改用 `dayOfSeason`。
- 审查一轮修复：指针与键盘捕获监听在 `blocked()` 时收起并放行；Tab 只在焦点位于画布或 body 时处理；透视场景 blocked 含大地图；大地图打开时去掉外框内边距，避免全图被裁；标记横幅加“结束”按钮供触屏退出。
- 用户要求 UI 层做到极限优化、技能区去掉底框：每帧 DOM 写入一律比对上次写入值（hidden、disabled、style 都比对），跟随物只写 transform 并取半像素，走独立合成层；悬浮动画改 transform，去掉常驻 drop-shadow；左列 contain；透视/机房投影用 ResizeObserver 缓存画布尺寸，避免强制重排；透视场景 HUD 更新挪到相机就位之后，消除跟随物落后一帧；透视小地图玩家不动不重画、文字变了才写。实测住宅静止时 HUD 每帧 DOM 写入为 0。卡顿主因是住宅 3D 场景每帧约 6500 次绘制调用，与 HUD 无关。
- 第一版设计只作用于 `.residence`；用户随后要求全部场景统一修改（数据可用示例），设计改为全局：共享 `weapon-hud` 皮肤全局替换，新增的 HUD 模块挂到每个创建 `createWeaponHud` 的地方。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/ui/hud/ | 把 `public/concepts/ui-controls-assets/*` 移过来 | — | Done |
| 2 | public/concepts/ui-controls-concept.html | 素材路径改为 `../ui/hud/` | 1 | Done |
| 3 | assets/concepts/ui-controls-game-render/modular-tech/README.md | 素材路径改为 `public/ui/hud/` | 1 | Done |
| 4 | vite.config.ts | 发布目录列表加 `ui/hud` | 1 | Done |
| 5 | src/ui/world-controls.ts | 导出 `clock` | — | Done |
| 6 | src/ui/game-hud.ts | 新建 `createGameHud`：人物卡、资源条、无人机卡、砸击格、无人机、对话气泡、标记、物品面板与回收站、地图顶栏、capture 键鼠监听 | 5 | Done |
| 7 | src/ui/game-hud.css | 模块科技皮肤令牌与新 HUD 样式 | 1 | Done |
| 8 | index.html | 引入 `game-hud.css` | 7 | Done |
| 9 | src/ui/control-surface.css | 技能栏原地换皮，隐藏旧主卡，移开 status / hints | 7 | Done |
| 10 | src/ui/weapon-hud.ts | 冷却环颜色改用 HUD 令牌 | 7 | Done |
| 11 | src/ui/room-scene-preview.css | 不再隐藏大招格；小地图只留位置尺寸 | 9 | Done |
| 12 | src/ui/residence.css | 不再隐藏大招格；移开 save-status / action-status / hint | 9 | Done |
| 13 | src/ui/homestead.css | `.hs-drones` 下移让出左列 | 7 | Done |
| 14 | src/ui/perf-panel.ts | 默认位置改到右侧 | — | Done |
| 15 | src/app/scene-game-overlays.ts | 性能面板位置改到右侧 | 14 | Done |
| 16 | src/ui/minimap.ts | 去掉内联外框样式，加 `hud-map` 类，返回 `element` | 7 | Done |
| 17 | src/app/perspective-minimap.ts | `createPlayableDefinitionMinimap` 加 `hud-map`、返回 `root`、`is-open` | 7 | Done |
| 18 | src/app/perspective-minimap.ts | `createPerspectiveMinimap` 加内层、`hud-map`、返回 `root` | 7 | Done |
| 19 | src/app/perspective-controls.ts | 提出 `project`，创建并更新 game-hud，返回 `hud`，options 加 `world?` | 6 | Done |
| 20 | src/app/residence-app.ts | 传时间天气，记录 `weatherMode`，`attachMap` | 17,19 | Done |
| 21 | src/app/scene-demo-stage.ts | 传 `context.world`，`attachMap` | 17,19 | Done |
| 22 | src/app/room-scene-preview.ts | 传 `context.world`，`attachMap` | 18,19 | Done |
| 23 | src/app/facility-app.ts | 创建、更新、释放 game-hud，`attachMap` | 6,16 | Done |
| 24 | src/app/game-app.ts | 创建 game-hud（家园时间、`tabOpensDrone`），`attachMap`，传入 loop，加入 disposers | 6,16 | Done |
| 25 | src/app/frame-loop.ts | deps 加 `gameHud`，`updateUi` 里调用 update | 24 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done |
| npm run build | yes | Done |
| 浏览器手工检查：住宅两入口、scene-demo、room-preview、机房、正式游戏（普通关卡、剧情、家园） | no | 部分：住宅两入口、机房、正式游戏自由世界已查；room-preview、剧情、家园 Tab 指挥、手机布局未查 |
