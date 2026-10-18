# PLAN -- 神经星核加载页接入游戏与场景切换

## Status: done
## Task: 464
## Related: N/A
## Baseline Commit: c292d188

## Goal
用已定稿的“神经星核 + 弱化谱带”加载（原型 artifact 9xubGQLFyqdALkGgCWLUik 第 6 版）替换现有乐谱加载 `src/app/scene-loading.ts`，并让游戏内所有场景切换/首屏加载统一使用这一个共享模块；同时优化资源、包体与代码。

## Non-goals
- 不改序章（intro）本身的表现与流程。
- 不改场景挂载/资源加载逻辑本身，只换加载表现层。
- 不新增依赖。

## Acceptance Criteria
- 场景工作区与游戏中的场景切换都显示新加载，进度来自真实 `progress(phase, completed?, total?)`；失败显示“重新加载”并可重试；完成后淡出。
- 保留交互：指针拨动星核与谱带、点击奏音、章节悬停卡/点击重放、键盘 E/G/A/C（Shift 升八度）、声音开关。
- 复用序章的颜色/绘制工具（intro-finale-geometry、intro-edition-shared）与音色（intro-score `createPreludeInstruments`），不复制一套。
- 加载模块不进入首屏同步路径之外的额外负担：音频合成延迟到首次交互；隐藏后停止 rAF、释放监听；旧乐谱加载代码与 CSS 删除。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

## Constraints
- 逻辑层分层规则不变（加载属于 app/render/ui 表现层）。
- fail-fast；边界只在 DOM 输入处理。
- 渲染与 UI 由人在浏览器验收，不写渲染/UI 测试。
- 不提交、不推送。

## Decisions
- 探索结论：只有两条加载通路——工作区内切换（`scene-workspace.ts` + `createSceneLoading` + `SceneMountContext.progress`）和整页启动加载（静态 `#loading`）。游戏内换场景都是整页跳转，落在启动加载上；住宅 saved 模式是游戏家园进入住宅的入口。故统一出口为 `src/app/scene-loading.ts`，工作区、`game-app` 启动、住宅 saved 启动都用它。
- 不改：序章/story 预热（序章画面自身遮挡）、展示场、贴图对照、音效馆等工具页仍用静态 `#loading`；静态 `#loading` 保留为 JS 执行前的启动屏。
- 模块位置：放在 `app` 层（`ui` 不能依赖 `render`），保留文件名 `scene-loading.ts`，原乐谱实现整体删除。
- 接口：`createSceneLoading(parent, retry)` → `show(title, kicker, expectedPhases)`、`progress(phase, completed?, total?)`、`error(e)`、`hide()`、`dispose()`。`hide()` 播放就绪动画后淡出并停 rAF、解绑 document 监听；`retry` 必填。声音开关只在模块内部用，不进接口。
- 包体：`intro-score.ts` 改为首次手势时 `import()`，未交互不合成音色、不下载音频分块；`HEAVY` 与 `SANS` 相同，复用 `SANS`。
- 样式：新建 `src/ui/scene-loading.css` 并在 `index.html` 引入；挂在 `body` 下时 `position: fixed`，挂在工作区视口时 `absolute`；删除 `scene-workspace.css` 中旧乐谱加载规则。
- 游戏启动阶段：生成世界 → 加载角色与贴图（模型逐个计数）→ 装配场景 → 准备着色器与首帧；启动失败显示加载页的 DISCONNECTED 与“重新加载”（`location.reload()`），加载完成后的运行时错误仍走 `#error`。
- 已收尾阶段不再接受进度回报：游戏模型并行加载，可能在后一阶段开始后才回报，否则指示会跳回前一章。
- 审查修正：隐藏后清空画布缓冲并挂起音频上下文（游戏/住宅只用一次，不再常驻显存与音频线程）；音色分块下载失败只关闭声音并记录，不让场景加载失败。
- 未改：`progress(phase, completed?, total?)` 的可选参数沿用 `SceneMountContext` 现有签名，内部 `completed ?? 0` 是阶段初始计数，收紧签名涉及全部 mount 调用方，不在本任务范围。
- 跳过 architect：方案已由已定稿原型与探索结果逐文件确定，无分歧路线；无停止条件，直接实现。
- 后续定稿（用户逐步指定）：乐谱只留一根主线横穿星盘中心，星盘缩到 1/4（`DISC`），去掉中心光束；章节文字并到标题下方；同屏最多 6 个大节点；鼠标牵引为 5 根线汇到星盘边缘受力点再单线指向光标，按住蓄力，线端/线腰/星盘用阻尼弹簧，乐谱随星盘像弦一样被拉动；点击只蓄力不奏音。
- 最终定稿：去掉全部牵引线，只保留拉扯力学（星盘弹簧 + 乐谱随动）；按住时光标外正圆光环随蓄力收紧，固定 6 颗光点从星核飞向光标，松手放出一道扩散环。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/scene-loading.ts | 移植神经星核加载，按上面接口；音色懒加载；代码精简 | - | Done |
| 2 | src/ui/scene-loading.css, index.html, src/ui/scene-workspace.css | 新样式文件并引入；删旧规则 | 1 | Done |
| 3 | src/app/scene-workspace.ts | 适配 show(title, kicker, expected) | 1 | Done |
| 4 | src/app/game-app.ts | 启动加载接入与阶段上报、启动失败重试 | 1 | Done |
| 5 | src/app/residence-app.ts | saved 模式接入同一加载 | 1 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done |
| npm run build | yes | Done |
