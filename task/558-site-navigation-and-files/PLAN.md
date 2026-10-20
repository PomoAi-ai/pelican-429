# PLAN -- 站点导航与项目文件整体整理

## Status: done
## Task: 558
## Related: 551, 557
## Baseline Commit: 59f1b361（任务 557 的修复在工作区未提交，作为本任务起点）

## Goal
按改造后的站点梳理结果整理导航与项目文件：
1. 发布版开放轻量资料页：基础概念、声音目录、场景透视、角色展示场（只用游戏档模型）；原画库、历史资料库、画质对比只在本地完整版，从发布版导航中去掉；发布白名单同步扩展，发布版不再有跳到报错页的链接。
2. 统一导航：每个场景只保留一个规范网址（删除重复参数与走不到的分支）；所有页面（站点页、工作区、整页游戏、4 个实验室页）都挂同一个站点顶栏。工作区与整页游戏两套实现暂时保留，AI 住宅 1/2/3 演示与住宅建造都保留。
3. 顶栏 5 大类：游玩 / 世界与场景 / 角色与模型 / 资料（概念、原画、声音）/ 实验室（render-lab、头发预览、港口透视、磁悬浮，仅开发版显示）。
4. 项目文件整理：
   - 资料单一来源：llms.txt 由 concept-documents 生成；模型路径、头发目录、参考图登记各合并为一份配置；未登记的概念文档与原画目录补登记。
   - 清理死文件：无引用的 glb、`public/robots/utility-drone/SOURCE.md`、白混凝土材质与序章音频死代码、`docs/` 下只剩跳转说明的 md。
   - 统一命名（全部改）：原画库统一为 catalog，`public/art-library` 目录、配置与组件一起改名；敌人代码 id `gatekeeper` 改为 `omi`（含模型目录、技能 id、首页图片），主线存档升级版本并在读取边界迁移旧 id；概念 id 改为文件名。
   - 统一词汇与工具条：视角、暂停、复位、返回、机房、主世界、主线的叫法统一；设置、地图、语言入口各只留一处；工作区公共条作为唯一工具条骨架。

## Non-goals
- 不改游戏玩法；逻辑层只做敌人 id 改名。
- 不把工作区场景并入整页游戏，不给整页游戏移植视角/自由镜头/暂停等功能（正式游戏后续安排）。
- 发布版不开放原画库、历史资料库、画质对比。
- 不改 `src/vendor/pelican-3d`。
- 不新增页面视觉设计；不为概念正文补英文翻译。
- 不推送、不改 CI。

## Acceptance Criteria
- 顶栏为 5 大类；实验室只在开发版出现；发布版顶栏包含资料与角色页。
- 每个场景只有一个规范网址；旧的重复参数与走不到的分支删除（仓库无外部使用者，不保留兼容别名）。
- 所有页面（含实验室 4 页）都有同一个站点顶栏。
- 发布构建（`npm run build`）包含开放页面所需资源；发布版内所有站内链接指向发布版可打开的页面。
- 旧主线存档（含 gatekeeper）能读出并迁移为 omi。
- llms.txt 由脚本从 concept-documents 生成；模型路径、头发目录、参考图登记各只有一处定义。
- 列出的死文件已删除，没有残留引用。
- 统一词汇表在代码与 i18n 字典中落实；设置、地图、语言入口各只有一处。
- typecheck、npm test、build、build:full 通过；中英文模式下无未翻译文字（CJK 扫描为 0）。

## Constraints
- AGENTS.md：分层由 architecture.test 强制；.tsx 与 React/Base UI 只在 src/ui；改接口同步改调用方，不留别名；fail-fast；不写读源码、断言常量的测试；UI 效果由人工验收。
- 只在 worktree 内修改，不碰主工作区。
- 存档（localStorage）格式若受改名影响，需在边界显式处理或说明。

## Decisions
- 用户决定：顶栏 5 类并挂实验室（仅开发版）；文件整理四项全做。
- 任务编号取 558：主工作区已有 557-* 目录，避开冲突。
- 发布范围（用户）：只开放概念、声音、场景透视、展示场（游戏档模型）；原画库全量约 0.7–1 GB、历史约 480M、对比约 160M，会超出 Pages 上限，留在本地完整版。
- 实现合并（用户）：先做统一导航，工作区/整页两套实现与功能移植留给正式游戏阶段。
- AI 住宅（用户）：演示 1/2/3 与住宅建造都保留。
- 命名（用户）：全部改，含目录改名与敌人 id 改名及存档迁移。
- 实验室页顶栏：4 个独立 HTML 由各自入口脚本挂 `mountSiteNavigation`，`findSitePage` 需能按 pathname 识别。
- 死文件中 maglev glb 仍被 maglev-track.html 下载链接和导出脚本使用，保留；utility-drone/SOURCE.md 内容并入 art-library 对应 SOURCE 后删除。
- 设计：采用架构蓝图（发布规则集中在 app-mode 的 RELEASE_MODES + releasedUrl，导航 siteSections(release) 过滤，实验室页靠 releasedUrl 自动在发布版消失；工作区按条目 href 校验规范网址；概念文档在发布版把指向未发布页面的链接降为文字）。
- build_bipeds.py 删除旧 gatekeeper Rodin 分支（已被 build_omi.py 取代，再跑会覆盖正式模型），旧 blend 移到 omi/rodin-original 留档。
- CharacterAsset 标签用 `string | [zh, en]` 联合，catalog 来源用元组。
- 未引用的概念图登记进对应文档；prompt 文本与 depth-layer-trial 移出 public 到 assets/concepts，不删除用户素材。
- 主线存档升到 v4，读取 v2/v3 时把 gatekeeper 映射为 omi，v4 中的 gatekeeper 视为非法。
- CI 稀疏检出不含 /scripts/，而 prebuild 依赖 scripts/：改造前已存在，不改 CI，汇报用户。
- 无停止条件：所有分叉已由用户或上述决定定下，直接实施。
- 实施分组：W0 命名改名（串行先做）→ W1 导航路由发布、W2 文件整理、W3 工具条入口（并行）→ W4 词汇与 i18n（唯一改 i18n 字典的组，最后做）。
- ☰“地图”保留但只在没有公共“地图 M”的页面显示（control-surface 必填选项 map），保证触屏在主线/机房/家园仍能打开大地图，每屏只有一个地图入口。
- 发布版展示场不渲染“图片资料”与“模型精细度”（引用的原画与精细档模型不在发布包内）。
- 镜头切换按钮固定为“自由镜头”开关（aria-pressed 表示处于自由镜头），避免与“游玩视角”预设同名；磁悬浮“重新归位”实际是列车回起点，归为“回到起点”。
- 第一章草案 chapter-1.md 登记为概念文档，随 concepts 目录进入发布版。
- 审查修复：窄屏顶栏横向滚动时把语言选择器钉在右端（语言唯一入口在手机横屏游戏里也可见）；建筑构件条目改用 `resource=` 参数并删除 `demo` 兜底；删除 character-assets 残留的 sc-active。
- 留待后续：`?mode=game&level=facility` 不带 scene 仍默认堡垒；发布版里 ui-controls.md 的原型链接与内嵌预览会被降级去掉；实验室 4 页没有 favicon（控制台 404）。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/art-library → public/catalog 及全部路径引用 | W0 目录改名+机械替换 | — | ✓ |
| 2 | src/config/art-library*.ts → catalog*.ts 及调用方 | W0 文件/类型/常量改名 | 1 | ✓ |
| 3 | src/ui/site/art-library.tsx/.css → catalog.tsx/.css | W0 组件与 CSS 类改名 | 2 | ✓ |
| 4 | gatekeeper → omi（EnemyKind、src、test） | W0 敌人 id 改名 | — | ✓ |
| 5 | 敌人模型目录、首页图片、SOURCE、报告 json | W0 目录与路径改名 | 4 | ✓ |
| 6 | scripts/blender_enemies/build_omi.py、build_bipeds.py | W0 删旧 Rodin 分支、改名 | 5 | ✓ |
| 7 | src/app/story/story-save.ts、test/story-save.test.ts | W0 存档 v4 与迁移 | 4 | ✓ |
| 8 | concept-documents.ts、concept-markdown.ts、concept-page.tsx、room-scene-preview.ts、public/concepts/*.md | W0 概念 id 改为文件名 | — | ✓ |
| 9 | src/config/app-mode.ts | W1 RELEASE_MODES、releasedUrl、删 harbor | 1-8 | ✓ |
| 10 | src/ui/site/release.ts | W1 linkReleased 用 releasedUrl | 9 | ✓ |
| 11 | src/config/site-directory.ts | W1 5 大类、match(url)、siteSections | 9 | ✓ |
| 12 | src/ui/site/site-navigation.tsx | W1 siteSections、mountLabNavigation | 11 | ✓ |
| 13 | src/ui/site/site-pages.tsx | W1 删 ReleaseCatalog | 3,9 | ✓ |
| 14 | src/main.ts | W1 删 mobileTransit | 9 | ✓ |
| 15 | src/app/workspace/scene-catalog.ts | W1 规范网址校验、删别名 | 9 | ✓ |
| 16 | src/app/workspace/scene-workspace.ts | W1 发布校验、删别名与手机跳转块 | 15 | ✓ |
| 17 | game-app.ts、game-level.ts、删 harbor-presentation.ts / world/harbor-level.ts / test/harbor-level.test.ts | W1 删死分支与原野别名 | 9 | ✓ |
| 18 | facility-chapter-hud.ts、facility-scenes.ts | W1 删走不到分支与无调用函数 | — | ✓ |
| 19 | transit-controls.ts、harbor-perspective.html、residence-hud.ts、game-hud.ts | W1 删自链接、处理报错链接 | 10 | ✓ |
| 20 | src/ui/site/concept-markdown.ts | W1 发布版降级未发布链接与 iframe | 8,10 | ✓ |
| 21 | vite.config.ts | W1 发布白名单 | 9 | ✓ |
| 22 | showcase.ts、showcase-app.ts、character-stage-panel.tsx | W1 releaseShowcaseCatalog、发布版隐藏档位与原画 | 2,4,9 | ✓ |
| 23 | 4 个实验室 HTML、src/app/lab/*.ts、src/ui/lab/*.css | W1 挂站点顶栏、删 d1-preview-nav | 12,19 | ✓ |
| 24 | test/app-mode.test.ts、free-world.test.ts、展示场测试 | W1 测试 | 9-22 | ✓ |
| 25 | scripts/build-llms.ts、package.json、public/llms.txt | W2 生成 llms.txt | 8 | ✓ |
| 26 | web-models.ts、enemy-models.ts、enemy-rig.ts、texture-compare-app.ts | W2 模型路径派生 | 5 | ✓ |
| 27 | d1-lab-hair-catalog.ts、d1-render-lab.ts | W1 头发目录合一（与 23 同组避免冲突） | 23 | ✓ |
| 28 | config/character-assets.ts、ui/model/character-assets.ts、test/language.test.ts | W2 参考图从 catalog 取 | 2 | ✓ |
| 29 | src/config/catalog.ts、utility-drone SOURCE | W2 补登记、合并 SOURCE | 2 | ✓ |
| 30 | concept-documents.ts（chapter-1）、i18n/site.ts（仅此一条）、三个 md、git mv prompt 与 depth-layer-trial、SOURCE.txt | W2 补登记与移出 public | 8,25 | ✓ |
| 31 | 死 glb、white-concrete-material.ts、intro-overture-audio.ts、intro-overture.ts | W2 删死文件 | — | ✓ |
| 32 | docs/ 22 个跳转 md 及其引用 | W2 改引用后删除 | 30 | ✓ |
| 33 | src/ui/panels/scene-view-controls.tsx | W3 presetsOnly | — | ✓ |
| 34 | building-sandbox.ts、building-field-stage.ts、tile-material-gallery.ts | W3 公共视角预设 | 33 | ✓ |
| 35 | control-surface.ts、frame-loop.ts | W3 删 ☰ 设置与地图 | — | ✓ |
| 36 | free-world-toolbar.tsx、residence-app.ts、wilds-scene.ts | W3 删 GM 设置入口 | — | ✓ |
| 37 | src/app/game/game-app.ts | W1 原野用公共地图按钮、删 onSettings 调用（与 17 同组） | 17,36 | ✓ |
| 38 | settings-panel.tsx | W3 删语言、有公共条时隐藏天气与世界组 | — | ✓ |
| 39 | resource-controls.ts、showcase-panel.tsx | W3 选中态 aria-pressed | — | ✓ |
| 40 | 文案与 src/config/i18n/*.ts、site-directory 元组 | W4 落实词汇表、同步英文、删本任务死键 | 1-39 | ✓ |
| 41 | scratchpad scan-cjk-allow.txt | W4 CJK 扫描清零 | 40 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes |✓ |
| npm test | yes |✓ |
| npm run build | yes |✓ |
| npm run build:full | yes |✓ |
| CJK 扫描（scan-cjk.mjs）TOTAL 0 | yes |✓ |
| git grep art-library / gatekeeper / level=harbor / demo=transit / #ai-residence（排除 task/）为空 | yes |✓ |
| build 后 dist 含开放页资源、不含原画库/历史/实验室/depth-layer-trial | yes |✓ |
| 浏览器人工验收（中英顶栏、实验室页、发布预览、旧存档） | no（交用户） | |
