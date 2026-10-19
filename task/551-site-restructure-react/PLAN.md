# PLAN -- 整站结构标准化与 React + Base UI 引入

## Status: done
## Task: 551
## Related: N/A
## Baseline Commit: 47a8232a

## Goal
- 游戏部分结构标准化：整理 `src/app`、`src/render`、`src/ui` 等表现/装配层的入口与目录组织，统一子应用生命周期，消除“这儿一点，哪儿一点”的零散结构。
- 网站网页引入 React + Base UI，保留 Vite 多页入口；站点外壳与低频面板组件化。
- i18n 改为显式 `t()`，废除 DOM 文本改写。

## Non-goals
- 不改逻辑层 `world → physics → combat → entities → sim` 的行为与确定性。
- 不改 `src/vendor/pelican-3d`。
- 不替换 three.js 渲染；每帧 HUD 与触控输入保留原生（性能约束）。

## Acceptance Criteria
- 现有多页入口（index、render-lab、d1-hair-gallery、harbor-perspective、maglev-track）全部纳入构建、可访问、功能不退化；`?mode=` 网址与发布白名单不变。
- React + Base UI 接入；站点外壳（导航、首页、帮助、原画库、概念页、声音页、工作区外壳）与低频面板（设置、对话剧情、场景工具栏、展示场面板、角色编辑器）迁到 React。
- src/app 按子应用分目录、统一 `mount(ctx)` 生命周期；src/render 按主题分目录。
- 中文字面量扫描清零，`dom-language.ts` 删除。
- `npm run typecheck`、`npm test`、`npm run build`、`npm run build:full` 通过。

## Constraints
- AGENTS.md 分层规则：逻辑层不依赖 three/DOM/React。
- 展示场复用游戏资源，不复制模型/着色器/动画。
- localStorage 键、存档格式、发布资源白名单不变。
- 不新增 CI 测试；不提交，交由 /dev:commit。

## Decisions
- 探索·入口：index.html 用 `?mode=` 承载 15 个模式（app-mode.ts），scene-workspace 内再分 10 种 kind；harbor-perspective、maglev-track 两页从未进入构建，D1 两页仅 full 模式构建；29 个 CSS 全局外链、无 TS import CSS；DOM 辅助 el()/element()/button() 在 9 个文件各写一份私有版本；“是否发布版”判断重复 4 处。
- 探索·React 阻碍：architecture.test.ts 只允许 three/marked 外部依赖且不扫描 .tsx；tsconfig 无 jsx；dom-language.ts 全局 MutationObserver 改写文本节点会与 React 协调冲突；手机端 iframe 自加载会重复挂载。
- 探索·游戏装配：src/app 121 文件约 2.4 万行，仅 showcase/ 分了子目录；生命周期四套并存（工作区 mountX(SceneMountContext)、页面级 startX 签名各异、模块顶层自启、游戏内插件），释放方式三种（onDispose / disposers 数组 / pagehide）；输入绑定、dt 上限、renderer 创建各自为政。webgpu-* 16 个文件放在 app 是受 architecture.test.ts:146 动态导入规则所限；render/input 移动会触发写死路径的断言。
- 探索·UI 层：src/ui 62 TS（9.7k 行）+ 34 CSS。每帧 HUD 与触控输入保留原生；菜单/设置、剧情对话、场景工具栏、展示场面板、站点/概念页约 3.5k 行适合 React。重复控件映射 Base UI：ToggleGroup、Slider、Select、Dialog、Tabs、Menu、Collapsible、Switch。阻碍：dom-language 文本改写式 i18n；.hud-* 样式依赖 link 顺序；settings 等测试经 fake-dom 断言 class；约 21 处 stopPropagation 阻止按键传给游戏；游戏循环同步读 UI `.open`。
- 用户决定·组件库：MUI Base UI（base-ui.com，`@base-ui/react` 1.9.0），配 React 19.3；样式用自有 CSS。
- 用户决定·范围：一次全部做完。
- 用户决定·i18n：一次性废除 dom-language，全部文案（含原生 HUD）改为显式 t()。
- 基线：用户已自行分组提交（a13fdd68..47a8232a）。主工作区仍有其他会话在编辑 src/render（transit-*、residence-three-*、return-corridor-overlay 等），整目录移动会破坏其工作，因此在仓库同级目录的独立 git worktree（分支 refactor/site-react）实施，主工作区切回 main 原样保留；其他会话的改动合并时依赖 git 重命名检测。
- 设计·入口：保留 index 单入口 + `?mode=`，main.ts if 链改为 `app/shell/routes.ts` 路由表；不引入客户端路由（各模式整页跳转，发布网址、RELEASE_MODES、手机 iframe 自加载保持不变）。Vite 用 PAGES 表：full 构建 5 页，普通 build 仅 index 且 release-assets 白名单不变；删除 vite.harbor/maglev.config.ts、tsconfig.harbor.json。
- 设计·React：tsconfig `jsx: react-jsx`，Vite 8 oxc 直接处理，不加 @vitejs/plugin-react（只多 Fast Refresh）。.tsx 与 react/react-dom/@base-ui/react 仅限 src/ui；app 继续零外部依赖；测试与被测 .ts 不得触达 .tsx/.css，纯逻辑放 ui/model/*.ts。迁移面板保留原工厂签名（命令式外观），内部 mountReact + createStore（useSyncExternalStore），游戏循环继续同步读 `.open`。不用 StrictMode（双重 effect 会重复创建命令式资源）。`ui/react/key-fence.tsx` 统一拦截 React 根内 keydown/keyup 冒泡，取代逐个 stopPropagation，不改 keyboard-mouse.ts。
- 设计·生命周期：新增 PageContext，SceneMountContext extends PageContext；startX 与自启模块统一为 `mount(ctx)`，释放统一走 ctx.onDispose；dt 上限两档（模拟 TUNING.sim.maxFrameTime，表现 VIEW_MAX_DT=0.05）；驱动玩法的输入统一 bindKeyboardMouse + createActionTracker，按键表 config/keybindings.ts。
- 设计·边界：return-corridor-overlay 移到 app/transit；网址参数统一由 config/app-mode.ts `parsePageParams` 解析；RELEASE 常量合并 4 处判断；webgpu-* 迁 render/webgpu，动态导入规则放宽为 main/app → app|ui|render。
- 设计·i18n：`core/i18n.ts` 的 `t(zh)` 以中文原文为键，合并现有四本词典到 core/i18n/*；英文缺词抛错（fail-fast），以中文字面量扫描清零为完成判据；React 用 use-language，原生 HUD 沿用 onLanguageChange；最终删除 dom-language.ts。4 个开发页原本无英文，保持中文。
- 设计·CSS：ui/styles/theme.css 统一 :root 变量（不改名）、base.css 承接 index 内联样式，二者由 index.html link；组件 CSS 由 .tsx 自己 import，原生 HUD CSS 由装配它的 app 入口 import；修正 .hud-skill-icon 对 link 顺序的依赖。
- 设计·测试：architecture.test.ts 放行 .tsx/.css、新增 React 限 ui 规则，删除按任务编号命名的归层用例（011/012/013/014/018，属于“不写”类别）；settings.test 的 DOM 结构用例随 React 迁移删除，新世界种子逻辑提炼到 settings-model 保留断言。
- 首页 SEO：首页改由 React 渲染后，index.html 保留 head meta/og 与 `<noscript>` 简介和主要链接，llms.txt 不变。
- W1 结果：移动 410 个文件（app 108、render 204、ui 96、词典 2），scene-wiring→game-wiring、homestead-app→homestead-feature；删除 architecture.test.ts 中 011/012/013/014/018 五个按任务编号命名的归层用例；css 导入归为 style 组不参与分层。
- i18n 落层调整：sound-language 依赖 config/world-music，core 不能依赖 config；而 render 画布文字也要用 t()，不能放 ui。故 i18n 改放 config 层：`config/i18n.ts` + `config/i18n/{site,home,sound,showcase}.ts`（W1 放入 core/i18n 的两本词典随之移动）。语言当前值由 config/i18n 持有，localStorage 读写与校验仍只在 ui/model/language.ts。
- W2 结果：i18n 落在 config/i18n（t、getLanguage、setLanguage、onLanguageChange；过渡期多导出 translateEnglish 供 dom-language 使用，W5 收回）；React 基础设施与 8 个 Base UI 控件（ctl- 前缀样式）就绪，Base UI Portal 经 createPortal 沿 React 树冒泡，KeyFence 可拦截；index.html 内联样式拆为 theme/base/hud/settings-panel.css，生产与开发层叠顺序从此一致（旧生产顺序下内联规则排最前，可能影响嵌在 residence/showcase 容器内的焦点样式，需浏览器确认）；main.ts 改为 pageRoute 纯函数 + 路由表，PageContext/createPageContext 就绪（transit-app 首个采用），parsePageParams 在入口统一 fail-fast 校验 textures。集成检查：typecheck 通过，npm test 2039/2039。
- 输入统一范围收窄（修正 D9）：ActionTracker 绑定的是 sim 的 GameAction/InputFrame，交通、磁浮、港口透视等载具场景的按键（E 交互、Space 刹车等）与游戏动作语义不同且撞键，硬塞进 GameAction 会污染模拟输入。只有驱动平台游戏角色的场景统一走 bindKeyboardMouse + createActionTracker；载具场景保留各自的输入绑定，但统一由 ctx.onDispose 释放并遵守 KeyFence 语义。
- W3 结果：所有入口统一为 mountX(ctx)（mountGame、mountStory、mountIntro、mountShowcase、mountTransitPage、mountResidencePage、mountSceneWorkspace、mountD1RenderLab、mountHarborPerspective、mountMaglevTrack 等），自带 pagehide 全部移除，bfcache 恢复统一整页重载；工作区工具栏改为 ctx.attachToolbar 显式交接；d1-hair-gallery 改从 d1-lab-hair-catalog 生成，不再解析 render-lab.html。保留项：frame-loop 自有时钟的 dt 夹取并非重复（改为由 FrameLoop.frame 返回夹好的 dt 供 game-app 复用）；wiring 模块的 disposers 参数保留（调用方需在页面释放前自行释放，内部汇总后一次交 onDispose）；载具/交通/住宅交互按键保留自有监听；d1-render-lab、harbor-perspective 自建 WebGLRenderer（参数与 createStageRenderer 不等价）。行为变化：tile-scene 改用 TUNING.sim.maxFrameTime（与游戏页一致）；切回标签页世界时钟不再一次跳 0.25s。集成检查：typecheck、npm test 2039/2039、build、build:full 通过。
- i18n 同形异义：以中文原文为键会遇到同一中文在不同语境下英文不同（如“水”技能图标 W / 设置分组 Water，“关闭”Off / Close）。不靠改中文显示文案规避（W4b 临时把设置分组“水”改为“水面”，W5 恢复原文案）；W5 给 t 增加可选语境参数 `t(zh, scope)`，仅为冲突词条提供带语境的词条，其余不变。带变量文案约定 `t('与 {name} 交谈').replace('{name}', …)`。
- W5 结果：全部界面文案改为 t()，dom-language 删除，index.html 只 link theme/base；新增英文模式显示数据覆盖测试；扫描 TOTAL 0（允许清单 130 条在 scratchpad）；typecheck、npm test 2037/2037、build、build:full 通过。待办：Phase 6 审查（reviewer-general）与测试（tester-general）尚未执行；浏览器手工验收未做。
- 审查修复：KeyFence 截断 React 根内按键冒泡，焦点在 React 根内仍需收到的游戏/场景按键一律改在 window 捕获阶段监听——展示场手动卡片的 keydown/keyup（靠 focused() 只在画面聚焦时响应）、GM 倒水的 keyup；tile-scene 补切回标签页时重置时钟（与 game-app 一致）。
- CSS 加载顺序：改为模块 import 后，样式表先后随分包变化，不再依赖它。scene-workspace.css 的 `:is(.scene-workspace, .scene-page)` 工作区规则在旧 link 顺序里排在 residence/room-scene-preview/resource-picker 之后，同特异性一律胜出；住宅根节点总带 scene-page、场景预览只在工作区内出现，因此删去这三份文件里被工作区同特异性规则盖住、从未生效的声明（住宅分栏 240px 与按钮网格即在此列）；公共工具条默认样式改 `:where(.room-preview-toolbar)`，交通/搭建工具条覆盖不再看先后；加载画面悬停描边写到音效按钮上；小地图在场景页内的 border-box 显式写出。另修 React 迁移带来的视角预设组在工具条内收缩换行（加入不收缩列表，间距 6px）。验证：dev 下把注入的 <style> 按旧 index 顺序重排、对比全部元素计算样式，19 个页面差异为 0；无头截图与基线工具栏/画布位置一致；剩余同特异性重叠为同模块 import 顺序或入口包先于懒加载包的固定先后，未改。
- 未见停止条件（无持久化数据迁移、无外部副作用、本地分支可整体回退），设计直接进入实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | package.json, tsconfig.json, vite.config.ts, vite.harbor/maglev.config.ts, tsconfig.harbor.json, 开发页 HTML, public/models/maglev/README.md | 依赖、jsx、PAGES 多页、删冗余配置 | - | ✓ |
| 2 | src/render/**, src/app/**, src/ui/*, test/**, scripts/*.ts, HTML | 脚本集中 git mv 并重写导入 | 1 | ✓ |
| 3 | test/architecture.test.ts | 支持 .tsx/.css、动态导入规则、React 限 ui、删任务编号用例 | 2 | ✓ |
| 4 | src/core/i18n.ts, src/core/i18n/* | t() 与合并词典 | 2,3 | ✓ |
| 5 | src/ui/react/*, src/ui/controls/* | mount、store、key-fence、use-language，Base UI 封装 | 2,3 | ✓ |
| 6 | src/ui/styles/*, index.html, hud/hud.css, game-hud.css, control-surface.css | 主题变量、基础样式、去内联样式、修顺序依赖 | 2,3 | ✓ |
| 7 | src/main.ts, app/shell/*, workspace/scene-mount.ts, config/app-mode.ts, config/keybindings.ts, stage/character-model 及调用方, ui/site/release.ts | 壳与路由、PageContext、页面参数、RELEASE | 2,3 | ✓ |
| 8 | src/app/{game,story,audio} | mount(ctx)，统一 dt 与释放 | 7 | ✓ |
| 9 | src/app/{transit,residence,homestead} | 同上，输入走 bindKeyboardMouse | 7 | ✓ |
| 10 | src/app/{workspace,perspective,facility} | 同上 | 7 | ✓ |
| 11 | src/app/{showcase,character,intro} | 同上 | 7 | ✓ |
| 12 | src/app/{lab,site} + 开发页入口 | 同上 | 7 | ✓ |
| 13 | src/ui/site/*, index.html body | 站点外壳迁 React | 4,5,6,12 | ✓ |
| 14 | src/ui/panels/{settings-panel,npc-dialogue,story-hud,story-intro-hud,restart-confirm,free-world-toolbar}, test/settings.test.ts | 游戏面板迁 React | 4,5,8 | ✓ |
| 15 | src/ui/panels/{scene-*,resource-picker,lab-controls,scene-demo-directory} | 场景工具迁 React | 4,5,10 | ✓ |
| 16 | src/ui/panels/{showcase-panel,character-stage-panel,character-editor} | 展示场与角色编辑器迁 React | 4,5,11 | ✓ |
| 17 | src/ui/hud/*, src/ui/model/* | 文案改 t() | 13-16 | ✓ |
| 18 | src/app/** | 文案改 t() | 13-16 | ✓ |
| 19 | src/render/**, config 展示文字使用处 | 文案改 t() | 13-16 | ✓ |
| 20 | src/ui/dom-language.ts（删除）, main.ts | 废除 DOM 文本改写，扫描清零 | 17-19 | ✓ |
| 21 | AGENTS.md | 记录新分层、CSS、i18n 规则 | 20 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck（每波结束） | yes | ✓ |
| npm test（每波结束） | yes | ✓ |
| npm run build（产物清单与基线一致） | yes | ✓ |
| npm run build:full（5 个 HTML 可打开） | yes | ✓ |
| 中文字面量遗漏扫描为零 | yes | ✓ |
| 手工浏览器验收（15 个 mode + 4 开发页、手机 iframe、面板暂停与按键拦截、中英切换、存档读取、场景切换无残留、bfcache 重载） | no（交用户） | |
