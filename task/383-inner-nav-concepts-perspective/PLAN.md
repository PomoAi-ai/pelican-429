# PLAN -- 内页顶部菜单、概念目录与透视页体验

## Status: done
## Task: 383
## Related: N/A
## Baseline Commit: d2d72f4（工作区已有用户未提交改动，验收时只看本任务涉及的文件与改动）

## Goal
- 后续追加：家具候选分区暂停后无法恢复游玩；控制面板收纳进工具栏；大场景可点击传送的小地图；角色展示场卡顿与坏缩略图；家具层级（角色不被家具前缘遮挡）与 3/4 深候选。
## Goal
- 内页（非首页）顶部菜单：高 40px、字号 14、点击区 32px；左侧 首页/资源/场景/透视/自由世界，右侧 开始游戏/帮助与关于/社交/语言；下拉项 36px。保留游戏页可收起的“导航”把手。
- 基础概念页目录：滚动时高亮当前章节并让侧栏跟随；手风琴分组（默认只展开当前章节所在组）；目录顶部搜索过滤；窄屏改为抽屉目录。
- 透视页：单独场景/大场景/场景分层页内切换，不整页刷新，前进/后退可用；加大字号与面板（12–13px，左栏约 220px，右栏约 240px）；精简工具栏（不重复“透视”标题）；控制面板默认收起；自行检查并修复透视页其他明显体验问题。

## Non-goals
- 不改首页导航外观。
- 不改透视场景的模型、布局数据、镜头算法与游玩逻辑。
- 不处理工作区里与本任务无关的未提交改动。

## Acceptance Criteria
- 内页菜单在桌面宽度两端分组、40px 高；800px 以下可横向滚动不溢出；游戏页收起把手仍可用。
- 概念页滚动时目录高亮随之变化；点击目录跳转正常；搜索可筛出条目并自动展开所在组；≤700px 时目录通过按钮打开抽屉，选择条目后收起。
- 透视页三种场景互相切换时不出现加载遮罩、不刷新页面；URL 更新；浏览器后退/前进切回对应场景；切换后无残留画布、监听与动画帧。
- 透视页文字与面板放大，控制面板默认收起，工具栏无重复标题。

## Constraints
- 遵守 AGENTS.md：渲染/UI 由人工在浏览器验收，不写自动测试；不加防御性检查；只改任务相关代码。
- index.html、src/ui/site-pages.ts、src/app/room-scene-preview.ts 已有用户未提交改动，必须在其基础上增量修改，不得覆盖。

## Decisions
- 跳过 explorer/architect/dev-engineer 子代理：两个 explorer 均因推理网关 503 失败，改由主会话直接探索、设计与实现；改动范围小且每个文件意图明确。
- 透视页内切换：`startRoomScenePreview` 改为页面会话，每个场景用 AbortController 控制生命周期，标签点击 pushState、popstate 按网址切回；角色资源只在 pagehide 时释放，切换不重新加载角色。场景参数校验从 showcase-app 移入 room-scene-preview，错误通过 main.ts 的 bootError 暴露。
- 控制面板默认收起；家具候选、太阳能试玩分区的操作在面板里，选中时自动展开。操作提示从折叠面板移到画面右下角。
- 概念目录手风琴用 `<details name>` 原生互斥；筛选时临时去掉 name 以同时展开多组。滚动高亮按章节顶端越过阅读线判定，目录指向不存在的章节时直接抛错。窄屏（≤640px）目录改为左侧抽屉，右下角按钮开关，选中条目后收起。
- 内页菜单：40px 高、14px 字、32px 点击区，开始游戏起靠右；开始游戏恢复首页的强调样式；下拉项 36px。
- 无停止条件，直接实施。
- 家具层级：材质沿用单向平台的模板缓冲遮罩（角色写 stencil 1，家具 NotEqual 测试 + renderOrder 1），除对比 D 外全局生效；对比 D 经 occlude 参数保留真实穿模。
- 家具 3/4 深：用户确认只新增对比分区 G，真实场景家具深度不变。
- 展示场卡顿：鹈鹕骨架（约 0.8s 构建）在循环重播间复用，不再每轮重建；新角色挂入场景前用 compileAsync 按场景灯光异步编译着色器（compileForStage，复用 warm-up 的 HDR 目标），添加时最长帧从 1287ms 降到 450ms、循环重播 531ms 长帧消除。
- 缩略图 404：d2d72f4 把 ./resources/home/ 误写成 ./resourcesprivate-source/（返回 SPA fallback 的 HTML），全局改回。
- 展示场角色添加时仍有一次性约 0.5s 的着色器首次链接开销（含 dev 模式 checkShaderErrors 的日志查询），属一次性成本，不再处理。
- 24 款 / 古典角色并入原画资料库：删除 roster-24、classics-7（含 rejected-v1）三个独立静态页；条目由 roster.json、definitions.json 运行时读取生成（architecture 测试禁止 src 导入 public，故不用 JSON import），手写 76KB 重复数据删掉；分组顺序为角色设定→24款→古典角色→敌人…，默认选中第一条已确认原画；有待核对稿的分组显式给“显示 N 张待核对稿”按钮；旧七款否决稿只作附件留档。
- 原画资料库并入资源总览：catalog 页内 view=art-library 子视图，目录互转页内 pushState 不刷新；旧 mode=art-library 从 parseAppMode 移除（无外部使用者，不留兼容分支），内部链接全部改指新地址；发布版（localOnly）不渲染图库视图，保持原门禁。
- 子代理审查/测试同样因网关不可用未派发；由主会话运行 typecheck、全量测试（1876 通过）、build，并在浏览器人工检查。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/ui/navigation.css | 内页菜单尺寸与左右分组 | - | yes |
| 2 | src/ui/site-pages.ts | 目录搜索框、抽屉按钮、details name，接入 addConceptToc | - | yes |
| 3 | src/ui/concept-toc.ts | 滚动高亮、手风琴、筛选、抽屉 | 2 | yes |
| 4 | src/ui/site-pages.css | 高亮、搜索框与窄屏抽屉样式 | 2 | yes |
| 5 | src/app/room-scene-preview.ts | 页内切换、默认收起面板、精简工具栏、提示移到画面 | - | yes |
| 6 | src/app/showcase-app.ts、src/main.ts | 传入错误回调，移除重复校验 | 5 | yes |
| 7 | src/ui/room-scene-preview.css | 字号与面板加大、状态与提示样式 | 5 | yes |
| 8 | src/app/perspective-controls.ts | 离开家具候选分区时恢复游玩与跟随 | 5 | yes |
| 9 | src/app/room-scene-preview.ts、perspective-minimap.ts、room-scene-preview.css | 常用控制收进工具栏横排；大场景小地图点击传送 | 5 | yes |
| 10 | src/app/showcase/stage-actor.ts、src/render/warm-up.ts、src/app/character-stage-app.ts | 鹈鹕骨架跨重播复用；新角色先异步编译着色器 | - | yes |
| 11 | src/config/showcase.ts、src/ui/site-pages.ts | 修正 resourcesprivate-source 为 resources/home | - | yes |
| 12 | src/render/definition-furniture.ts、definition-scene-layout.ts、definition-settlement-layout.ts | 家具轮廓遮罩、FurnitureDepth 类型、G 3/4 深候选、对比 D 遮挡保留 | - | yes |
| 14 | src/config/art-library-sets.ts、art-library.ts、src/ui/art-library.ts、art-library.css、site-pages.ts，public/art-library（删 3 个静态页、更新 files.json/SOURCE.md） | 24款与古典角色并入原画资料库：条目由定义 JSON 运行时生成，目录按体型分组、待核对稿按钮、定义字段与附件，侧栏收成一个返回链接 | 13 | yes |
| 13 | src/ui/art-library.ts、site-pages.ts、main.ts、app-mode.ts、index.html、showcase/character-stage 面板、test/app-mode.test.ts | 原画资料库改为 catalog 页内 view 子视图 | - | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器人工检查（菜单、概念目录桌面/窄屏、透视三场景切换与前进后退） | yes | yes |
