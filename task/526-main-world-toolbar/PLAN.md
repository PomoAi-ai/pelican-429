# PLAN -- 主世界统一精简工具条

## Status: done
## Task: 526
## Related: 525
## Baseline Commit: a13fdd68（工作区含 518–525 未提交改动，以当前工作区为基线）

## Goal
主世界（城区 + 星舰交通中心 + 原野）顶部只有一条统一的游戏工具条，城区与原野外观一致；点击工具条后键盘仍驱动角色。

## Non-goals
- 不改 AI 住宅 2 实验页（?mode=lab&demo=residence-2）的编辑器工具条与调试功能。
- 不改游戏内 HUD（血量、技能、小地图）与交通中心叠层。
- 不改城区与原野的跳转拓扑、存档格式。

## Acceptance Criteria
- 城区与原野显示同一组件的工具条：区域名、快速旅行、世界与天气、建造（仅城区可用，原野禁用）、地图 M、设置、种子 / 规模 / 随机世界 / GM 工具。
- 快速旅行列出城区、星舰交通中心与原野各区；同侧直接定位，跨侧用网址跳转。
- 主世界城区不再出现：住宅游戏演示、视角预设（正视/斜视/俯视/自由镜头）、看地下、全场景、回到门口、背景分层、地面反射、时间预设、暂停游玩、保存住宅；城区存档只靠自动保存。
- 点击工具条按钮后 A/D/空格立即驱动角色；下拉框、输入框内的按键不驱动角色。
- AI 住宅 2 实验页工具条保持原样。

## Constraints
- AGENTS.md：最小改动、无防御性检查、不保留旧签名；UI 不写自动测试，浏览器验收。
- 524 会话可能同时改 residence-app.ts / game-app.ts，只改本任务相关段落。

## Decisions
- 方向（用户选择）：统一精简游戏条；种子/规模/随机世界/GM 照常显示；调试项只留在 AI 住宅 2 实验页。
- 主世界不留“保存住宅”按钮，城区只靠自动保存（提出后用户回复“开始”）。
- 探索结论：原野工具条 createFreeWorldToolbar 挂在“导航”抽屉（#game-navigation），城区用 AI 住宅 2 编辑器工具条（residence-hud）；城区 HUD 元素多为必然存在查询，直接删 HTML 会牵动 perspective-controls 等 3 个调用方。键盘失效来自冒泡阶段截停（城区 stopKey、工具条自身、抽屉、#dev-navigation 三层），只有点完后把焦点还给画布才能统一修好。城区每次放置/拆除自动保存，保存按钮只是重复保存。
- 跳过 architect：探索已覆盖全部改动点，方向由用户确定，下方按文件写清设计。无停止条件（不涉及存档迁移与外部副作用），直接实现。
- 方案：两侧都把 createFreeWorldToolbar 挂进同一个“导航”抽屉。组件新增 extra 节点插槽（放在快速旅行后）、onSettings 可为 null（城区无设置面板，隐藏 GM 设置）、onFocusGame（按钮点击与下拉变更后回到画布）；按键只在 input/select/textarea 内截停。城区把原有建造按钮、世界控制、天气、风力节点移入插槽，旧 .residence-toolbar 在主世界隐藏（节点保留，避免改 perspective-controls 签名）；地图 M/性能按钮改挂新工具条。原野插槽放禁用的建造按钮（提示只能在城区建造）与地图按钮。
- 快速旅行：城区列出城区各段（含星舰交通中心段）+ 原野入口；原野列出城区、星舰交通中心 + 原野各区。原野各区需按种子生成地形，城区侧只列入口（不为列表在城区生成一遍原野）。跨侧：worldMapSearch 目标扩为 wilds/city/transit，城区入口参数 from=transit 出生在交通中心街面。story 的原野不列城区项，避免跳出主线。
- 城区的种子/规模/GM：从网址解析（与原野同一套默认值）；应用/随机世界进入新种子的原野入口；GM 切换只改写当前网址（城区无 GM 功能，进原野时生效）。
- 审查后修正：游玩视角按钮移入城区工具条（建造后），主世界结束建造即恢复跟随（与游玩视角共用 playView）；工具条只在非提交按钮与 summary 点击、非规模下拉变更后回到画布（应用/规模保留焦点，导航抽屉不收起、可见种子校验提示）；按键截停恢复为全部 keydown/keyup/pointerdown/mousedown/wheel（抽屉本身截停全部按键，收窄无效）；seed/gm/size 解析抽为 free-world-navigation.ts 的 parseMainWorldParams，两侧共用（GM 非法值现对所有 game 页抛错）；世界控制面板 top 改为 dev-nav-height + 30px 避开导航把手；新增 gmHint（原野 reload / 城区 wilds，“进入原野后生效”）；原野插槽的建造、地图按钮接入中英文切换；交通中心接管时城区快速旅行返回 false。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/ui/free-world-toolbar.ts | extra 插槽、onSettings 可空、onFocusGame、仅表单输入截停按键、返回 root | | ✓ |
| 2 | src/app/free-world-navigation.ts + test/free-world.test.ts | worldMapSearch 目标 wilds/city/transit；用例补 transit | | ✓ |
| 3 | src/app/game-app.ts | 原野工具条：城区/交通中心项（非 story）、跨侧跳转、禁用建造与地图按钮、回到画布 | 1,2 | ✓ |
| 4 | src/app/residence-app.ts | 主世界城区挂统一工具条、移入建造/世界/天气/风力、隐藏旧工具条、overlays 改挂、from=transit、抽出分段传送、种子/GM 网址处理 | 1,2 | ✓ |
| 5 | src/ui/residence.css、src/ui/free-world.css | 主世界隐藏旧工具条；插槽内控件样式 | 4 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| node --test test/free-world.test.ts test/residence.test.ts test/architecture.test.ts | yes | ✓（另跑 npm test 2017/2017） |
| npm run build | yes | ✓ |
| 浏览器验收：城区/原野工具条一致；快速旅行同侧与跨侧；建造仅城区；点按钮后 A/D/空格可用；AI 住宅 2 实验页不变 | yes | ✓（交通中心接管期间拒绝快速旅行仅代码核实） |
