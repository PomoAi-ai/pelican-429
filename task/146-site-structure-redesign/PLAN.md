# PLAN -- 网站结构与首页改版

## Status: done
## Task: 146
## Related: N/A
## Baseline Commit: e5fb3bf

## Goal
- 首页（`#entry-index`，`index.html` + `src/ui/homepage.css`）：
  - 明确展示开源协议：Apache 2.0 + Commons Clause，链接到仓库 LICENSE。
  - 新增 PomoAI 中转站赞助区块，链接 https://www.pomoai.vip 。
  - 新增「联系作者」：GitHub Issues、微信群二维码（`public/contact/wechat-group.jpg`，由用户提供）；X 账号以后再加。
  - 首屏背景换成当前主战场景；章节卡片配图换成当前主战场景。
  - 新增怪物/角色设定展示，复用 `public/characters/**` 下的真实资源图。
- 正式游戏（`?mode=story`，包括其中的序章）：不显示顶部导航；☰ 菜单里的「返回首页」改为 Home 按钮，点击后弹出悬浮资源导航条（首页 + 全部资源页）。
- 除正式游戏外，所有资源页面都显示顶部导航（`#dev-navigation`），游戏画面和 HUD 让出导航的高度。
- 新增手机控制展示页（例如 `?mode=controls`）：游戏演示场景 + 强制使用手机操控布局 + 说明，并加入导航与资源目录。

## Non-goals
- 不改玩法、物理、战斗逻辑和操控映射。
- 不改资源展示目录页（`?mode=dev`）的结构。
- 不加 X 账号（等用户提供）。

## Acceptance Criteria
- 首页可以看到协议、赞助、联系作者、角色/怪物设定区块，首屏和章节配图是当前主战场景；桌面和 390px 宽的手机上都没有横向溢出。
- `?mode=story`：看不到顶部导航；☰ → Home 弹出悬浮导航，包含首页和全部资源页链接，可以关闭。
- `?mode=game`、章节关卡、测试关卡、`?mode=intro`、`?mode=facility`、`?mode=showcase`、`?mode=resources`、`?mode=sounds`、`?mode=lab`、`?mode=controls` 都显示顶部导航，导航不遮挡 HUD 和操控层。
- `?mode=controls` 打开后是手机操控布局（桌面浏览器也一样），配有操作说明，导航中当前项高亮。
- `npm run typecheck`、`npm test`、`npm run build` 全部通过。

## Constraints
- 遵守 AGENTS.md：分层规则、fail-fast、最小改动、展示页复用游戏资源和生成函数（不复制模型或操控实现）。
- 渲染和 UI 效果由人在浏览器里验收，不写自动测试。
- 工作区里有用户自己未提交的大量改动；审查只看本任务涉及的文件。

## Decisions
- 用户确认：赞助链接 https://www.pomoai.vip；联系方式为 GitHub Issues + 微信群二维码；手机控制页采用「游戏场景 + 强制手机布局」；悬浮导航包含首页 + 全部资源页。
- 微信群二维码 7 天过期（10/13），已提醒用户；图片路径固定为 `public/contact/wechat-group.jpg`，换图时不用改代码。
- 第一轮首页视觉改版（index.html 首页部分、homepage.css）已在本任务之前完成，本任务在其基础上继续。
- 素材（探索结论）：主线全部在 fortress（黑洞前哨 + 蓝天都市 + 冷却液断崖 + 三层机房）。旧首屏图是序章概念图，旧 `resources/facility-fortress.jpg` 已过时。已从 dev server 截取真实画面：`public/resources/home-fortress-hero.jpg`（1920×1080，游戏内黑洞前哨，鹈鹕在画面中，已去掉 HUD）和 `public/resources/home-fortress-overview.jpg`（1600×701，机房预览全景）。序章卡片继续用 `assets/chapter-one/01-grassy-coding-concept-v3-mac-studio.png`。
- 角色素材：怪物 thumbnail 都是不透明的灰底；有透明底的是 `human/models-equipped/render-game-hero.png`、`tibo/render-front.png`、`sam/render-front.png`。名称和简介沿用 `ENEMY_RULES`、`NPCS`、`SHOWCASE_ACTORS` 的现有文案（首页是静态 HTML，直接写死文字，不引入 JS）。
- 导航（探索结论）：`game-app.ts` 对所有游戏页都会调用 `createControlSurface(document.body)`，于是 `body[data-controls]` 把导航藏掉了；`intro.css:2` 也会把导航藏掉。story 模式本身已经由 `main.ts` 的 `hidden` 和 `story.css` 的 `--dev-nav-height:0` 处理好。`#hud` 和 `.facility-chapter-hud` 必须保持 `inset:0`，因为世界坐标投影依赖画布的视口坐标，只能单独下移各个面板。
- 并发风险：另一个 pelican-429 会话正在修改 `game-app.ts`、`free-world.css` 等文件（任务 145，自由世界）。本任务尽量不碰 `game-app.ts`；必须改时只做最小的局部编辑，编辑前重新读取文件。

- 设计（architect）：
  - (a) 在 `control-surface.ts` 里把「返回首页」链接换成 Home 按钮，点击后用原生 popover 打开悬浮面板，面板内容克隆自 `#dev-navigation .dev-links a`。所有游戏页都用这一套，不区分是否 story 模式。面板要显式写 `pointer-events:auto`。
  - (b) 删掉 `control-surface.css` 里把导航高度清零、隐藏导航的规则。顶部定位的元素逐个改成 `calc(var(--dev-nav-height) + 原值)`，容器不整体下移，这样不会和 free-world.css 的逐项覆盖叠加计算。同时删掉 intro.css 里隐藏导航的规则。
  - (c) 新页面 `?mode=controls&level=test`：用测试关卡，加载轻，不进入自由世界，不必改 `startGame` 的签名。`ControlSurfaceOptions` 新增必填项 `forceMobile`，`game-app.ts` 只改一行。操作说明复用现有的 `.hud-touch-help`。
  - (d) 首页新增 03 角色与怪物、05 赞助与联系；04 源码区块补上协议；首屏和主线卡片换成新截图。
  - 没有触发需要停下来问用户的条件，直接实现。
- 协议措辞：LICENSE 明确写着不是 OSI 认可的开源协议，首页标题用「源码公开」，并写清 Apache 2.0 + Commons Clause；导航锚点仍叫「开源」。
- 赞助文案只写「由 PomoAI 中转站赞助 · 大模型 API 中转服务」，加上指向 www.pomoai.vip 的链接（`rel="sponsored noopener"`），不写未经核实的服务承诺。
- 手机操控页选测试关卡而不是 `?mode=game`：`?mode=game` 不带 level 时会进入另一个会话正在开发的自由世界，测试关卡更稳定。

- 追加需求（用户）：
  - 首页增加 06「特别感谢」：感谢 GPT-6 Astra、Claude Opus 5.5、Claude Sonnet 5.5 三个模型不降智地提供帮助；感谢付费 3D 模型制作服务 Hyper3D Rodin（素材记录中出现 197 次）；感谢开源项目 three.js、Vite、TypeScript、Node.js、Blender。已直接改在 index.html 和 homepage.css。
  - 全站自动识别语言，暂时只支持中文和英文：`language.ts` 已按 `navigator.languages` 识别，但首页和资源目录页（`?mode=dev`）写死成中文、也没接翻译，需要补上。
  - 语言切换做成下拉菜单，方便以后增加语言：在 `language.ts` 导出唯一的 `LANGUAGES` 列表，导航里的 `.site-language` 和设置面板都从这份列表生成选项。

- 验证阶段修正：审查指出手机操控页没有常驻的操作说明，改为 `forceMobile` 时给操控层加 `control-surface-demo`，横屏或宽屏下顶部常驻显示操作说明。序章、序章版本列表和机房预览各自带的「中文 / English」按钮和全站语言菜单重复，统一删除，全站只保留一个语言菜单。
- 浏览器验收时，正式游戏和所有游戏场景都报「Grassy 模型缺少 fly_fast 动作」，原因是另一个会话正在修改 Grassy 动画模型，与本任务无关；正式游戏中导航已确认隐藏。

- 联系方式补全：X 账号 @grassy429（作者「小草」），头像缩放到 256px，存为 `public/contact/x-avatar.jpg`；微信群二维码按用户要求只裁出码本身（740×740），存为 `public/contact/wechat-group.jpg`。

- 联系方式醒目化：首页页头右侧加 GitHub / X / 微信图标（微信用 popover 弹出二维码）；首屏右侧加作者联系卡片（≤1080px 隐藏，下方 05 区块仍有完整联系方式）。序章不再显示「游戏资源已就绪」，加载完成后直接移除状态文字。
- 导航重组（用户）：01/02/03 + 机房预览收进二级菜单「场景展示」（原生 popover，锚点定位，不支持时退回固定位置）；删除「测试关卡」导航项，手机操控页仍使用测试关卡；新增一级「进入游戏」（`?mode=story`）。

- 首屏改为实时渲染（用户：不要视频、不要截图，直接用已有代码）：新增 `src/app/home-hero.ts`，装配机房预览的堡垒场景（`createFacilityPresentation` + `createFacilityEnvironment`，黑洞着色器、天气与鹈鹕均为游戏同一份代码），首页专用取景 `HERO_VIEW` 让黑洞落在标题右侧；离开首屏停止渲染，减少动态效果时只画一帧。取景逻辑抽成 `frameFacilityCamera`，机房预览同步改用。
- 首屏底部乐谱带（用户指定序章 finale 的谱线）：直接调用 `drawFinaleScore`，其参数收窄为 `ScoreFrame`（只含画布、尺寸、时间），在序章 12.6–15.3 秒来回慢放；鼠标滚动提示保留；手机布局隐藏乐谱带。删除旧首屏截图 `home-fortress-hero.jpg`。
- 首页 Tibo、Sam 改用人形渲染图（用户：首页不用动物形象），灰底铺满卡片画面。
- README 重新排版：徽章、配图、入口表、赞助、联系作者、特别感谢；保留用户已改的许可说明原文。

- 首页加载优化（生产构建实测 54 MB → 11.9 MB）：首屏场景不生成敌人（`createFacilityEnvironment` 新增 `{ enemies, grassyVariant }` 选项，机房预览传 `{ enemies: true, grassyVariant: 'game' }` 保持原样），省下约 35 MB 敌人模型；玩家视图必须建好人形，首屏改用 Grassy 轻量版（6.3 MB → 2.8 MB）；首页卡片图改用 `public/resources/home/` 下按显示尺寸 2 倍生成的 WebP（约 9.8 MB → 0.3 MB），原图不动，来源记录在 `public/resources/SOURCE.md`。
- 堡垒天空、城市分层与黑洞贴图（PNG 约 8.4 MB）：用户选择只给网站首页转格式。首页加载 `public/resources/home/fortress/` 下的同分辨率 WebP（约 1.1 MB），`createFacilityPresentation` 由调用方传入贴图加载函数；游戏与机房预览仍用原 PNG。首页实测 11.9 MB → 4.8 MB。
- 特别感谢文案按用户要求改为「感谢三个模型，全程封号 + 降智」（首页、英文翻译、README 同步）。
- 序章：进入即自动播放；点击画面暂停并显示「继续」，点击继续接着播放；终版播完自动进入游戏（正式游戏模式进入战斗，单独观看时进入山体堡垒），历史版本播完停在结尾。浏览器拦下自动播放时，开场页延迟 0.6 秒出现，「开始播放」在用户手势里恢复音频。
- 序章控制栏只保留进度条、时间和「跳过」：去掉历史版本链接、播放/重播/声音按钮、场景跳转和阶段文字（暂停靠点击画面或空格，静音保留 M 键），相关文案与样式一并删除。
- 首页乐谱带悬浮（按用户描述重做）：不额外加光，只让指针附近的谱线和谱点高亮；指针离谱线中线 70px 内时谱线被欠阻尼弹簧牵向指针（最多 26px），离开范围后越过原位再弹回；指针横扫乐谱时按横向位置弹出 C 大调五声音阶（三个八度，左低右高，左右声道随位置），音色复用序章木槌。浏览器要求页面先有用户点击才能出声，所以只在 `navigator.userActivation.hasBeenActive` 后创建音频；序章音色模块在首次出声时才动态加载。谱线先画离屏画布再按列错位贴回，序章绘制代码不改；减少动态效果时不启用画面效果。
- 首页黑洞引力（`src/app/home-gravity.ts`）：标题、标语、简介、标签和右侧联系卡片按欠阻尼弹簧被拉向黑洞屏幕位置（平时约 6px 呼吸，指针进入视界 4.5 倍半径内黑洞「苏醒」后最多约 26px，引力消失后带回弹归位），「429」额外横向拉伸；指针进入视界 2.2 倍半径后隐藏系统光标，换成绕黑洞旋入、缩小淡出的光点。按钮和链接上不隐藏光标；触屏不启用。黑洞屏幕位置由 `FORTRESS_BLACKHOLE` 经相机投影得到，取景变化时自动跟随。
- 山体堡垒向左扩 32 格（用户确认）：可走地面向左延伸，最左段必须飞行才能过去；整张堡垒坐标右移 32 格，游戏、机房预览与首页同步。
- 堡垒扩展实现：宽 168 → 200，所有堡垒坐标 +32（黑洞 x=36、出生点 x=44）；新增 `FORTRESS_PLATEAU`（x 0–13，顶面 y=27，高出地面 7 格 > 跳高 4.2），删除旧左缘斜坡；自由世界里在高台底部沿地面挖 4 格高的隧道，接近道路改为直接接平地面；主线存档改为 version 2 并换键名 `pelican-mainline-two`，旧存档不再读取，不做迁移。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| A1 | index.html | 首页：首屏和主线配图、03 角色与怪物、04 协议、05 赞助与联系、页头锚点、页脚协议链接 | — | Done |
| A2 | index.html | `.dev-links` 在测试关卡后面加「手机操控」`./?mode=controls&amp;level=test` `data-page="controls"` | A1, C1 | Done |
| A3 | src/ui/homepage.css | 首屏遮罩适配亮色背景；角色卡、协议块、赞助与联系的样式及移动端适配 | — | Done |
| A4 | public/resources/SOURCE.md | 登记两张新截图；改写 facility-fortress.jpg 的用途说明 | — | Done |
| B1 | src/ui/control-surface.ts | Home 按钮 + popover 悬浮导航；新增 `forceMobile` 选项，开启时隐藏布局切换按钮 | — | Done |
| B2 | src/ui/control-surface.css | 导航让位的偏移；`.control-nav` 样式；`.control-modes[hidden]`；删除 `.control-home` | — | Done |
| B3 | src/app/game-app.ts | `createControlSurface` 调用处加 `forceMobile: params.get('mode') === 'controls'` | B1 | Done |
| C1 | src/config/showcase.ts | `parseAppMode` 支持 'controls' | — | Done |
| C2 | src/ui/dom-language.ts | 新增英文词条：手机操控、悬浮导航的关闭和首页文案 | — | Done |
| C3 | src/ui/intro.css | 删除隐藏导航的规则 | — | Done |
| E1 | index.html + src/ui/homepage.css | 06 特别感谢区块 | — | Done |
| D1 | src/ui/language.ts | 导出 `LANGUAGES`（id + 原生名称），自动识别从这份列表取候选 | — | Done |
| D2 | src/ui/dom-language.ts | 语言切换改为 `<select>` 菜单；接入首页文案英文词典；跟随 onLanguageChange 同步 | D1, D3 | Done |
| D3 | src/ui/homepage-language.ts | 新增：首页与资源目录页的英文词典 | — | Done |
| D4 | src/ui/settings-panel.ts | 语言选项改为从 `LANGUAGES` 生成 | D1 | Done |
| D5 | src/main.ts | index/dev 模式不再写死 zh-CN，调用 attachDomLanguage，把语言菜单放进首页页头 | D2 | Done |
| D6 | src/ui/homepage.css + navigation.css | 语言菜单样式（首页页头、导航） | D2 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done |
| npm run build | yes | Done |
| 浏览器验收：首页（桌面 + 390px）、story、game、intro、controls 的导航与布局 | yes | Done |
