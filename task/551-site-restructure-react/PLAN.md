# PLAN -- 整站结构标准化与 React + Base UI 引入

## Status: clarifying
## Task: 551
## Related: N/A
## Baseline Commit: a13fdd68

## Goal
- 游戏部分结构标准化：整理 `src/app`、`src/ui` 等表现/装配层的入口与目录组织，消除“这儿一点，哪儿一点”的零散结构。
- 网站网页（游戏外的页面与界面外壳）引入 React + Base UI，保留 Vite 多页入口。

## Non-goals
- 不改逻辑层 `world → physics → combat → entities → sim` 的行为与确定性。
- 不改 `src/vendor/pelican-3d`。
- 不替换 three.js 渲染。

## Acceptance Criteria
- 现有多页入口（index、render-lab、d1-hair-gallery、harbor-perspective、maglev-track）全部可访问、功能不退化。
- React + Base UI 接入 Vite，至少网页外壳/菜单/面板类界面迁移到组件化写法。
- 目录分层清晰，`test/architecture.test.ts` 分层规则通过（必要时随新结构更新）。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

## Constraints
- AGENTS.md 分层规则：逻辑层不依赖 three/DOM/React。
- 展示场复用游戏资源，不复制模型/着色器/动画。
- 基线工作区有约 800 个未提交改动，改造须在此基础上进行。
- 不新增 CI 测试；不提交，交由 /dev:commit。

## Decisions
- 探索·入口：index.html 用 `?mode=` 承载 15 个模式（app-mode.ts），scene-workspace 内再分 10 种 kind；harbor-perspective、maglev-track 两页从未进入构建，D1 两页仅 full 模式构建；29 个 CSS 全局外链、无 TS import CSS；DOM 辅助 el()/element()/button() 在 9 个文件各写一份私有版本；“是否发布版”判断重复 4 处。
- 探索·React 阻碍：architecture.test.ts 只允许 three/marked 外部依赖且不扫描 .tsx；tsconfig 无 jsx；dom-language.ts 全局 MutationObserver 改写文本节点会与 React 协调冲突；手机端 iframe 自加载会重复挂载。
- 探索·游戏装配：src/app 121 文件约 2.4 万行，仅 showcase/ 分了子目录；生命周期四套并存（工作区 mountX(SceneMountContext)、页面级 startX 签名各异、模块顶层自启、游戏内插件），释放方式三种（onDispose / disposers 数组 / pagehide）；输入绑定、dt 上限、renderer 创建各自为政。最小统一契约候选为现有 `SceneMountContext`。webgpu-* 16 个文件放在 app 是受 architecture.test.ts:146 动态导入规则所限。app 加子目录不触发架构断言；render/input 移动会触发写死路径的断言（177-184、338-380、477-512 等）。
 (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | |
| npm test | yes | |
| npm run build | yes | |
