# PLAN -- D1 原画发束与头皮贴合新版预览接入

## Status: done
## Task: 472
## Related: N/A
## Baseline Commit: c292d188ad690a076f771a59ff5c1953155827f9

## Goal

把独立制作的头皮贴合新版接入现有头发预览，编号 39，保留现有九款供对比。

## Non-goals

不修改现有发型资产、材质、灯光、动作和球形眼球兼容范围；本跟踪只覆盖目录接入，模型由同一任务的建模工作提供。

## Acceptance Criteria

- 渲染实验顶部可选择 `blender-scalp-fit`，名称为“Blender · 原画发束与头皮贴合〔新款〕”。
- 头发总览自动显示 39 号，使用独立 GLB 路径与现有 Blender 发型适配流程。
- 现有九款编号、名称与资源路径保持不变。

## Constraints

- 只增加真实新资产入口，不以其他模型充当占位。
- 复用现有共享目录和总览目录生成逻辑，不增加新渲染分支。

## Decisions

- 探索与设计沿用已明确的接入合同：`d1-lab-hair-catalog.ts` 负责类型、资源路径、编号与 Blender 分类；`render-lab.html` 提供顶部入口，gallery 读取此入口自动生成卡片。无需额外探索或架构子代理。
- 接入只增加低影响目录项，不新增复述常量或 DOM 文案的测试。
- Blender 发束的蒙皮、导引信息与根梢属性沿用现有导出合同；资产制作与三视图验收由建模工作完成。
- 新资产到位后补充完整测试、构建与只读 GLB 合同检查；浏览器验收由主任务执行。

## Implementation Map

| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/d1-lab-hair-catalog.ts | 新增独立 39 号发型类型、资源路径与 Blender 分类 | — | yes |
| 2 | render-lab.html | 新增顶部头发按钮，并由总览读取 | 1 | yes |

## Validation

| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes（通过） |
| npm test | yes | yes（通过，退出码 0） |
| npm run build | yes | yes（通过；存在常规的 >500 kB 分块提示） |
| 只读解析新 GLB 的结构和逐顶点数据 | yes | yes（通过） |
| 聚焦变更审查与 diff-guard | yes | yes（无新增兜底、防御校验、无关改动或测试） |
| 新模型浏览器验收 | no（由主任务执行） | yes（主任务确认真实游戏环境总览加载 39，无 console warning/error） |

## Result

- 39 号入口已接入；现有九款保持原状，gallery 无需改动即可读取新项。
- 类型检查、全量测试、生产构建通过，`git diff --check -- render-lab.html` 通过。未为本次目录接入修改测试或断言。
- 最终资产 `public/characters/human/render-lab/d1-outfit-blender-scalp-fit-v1.glb` 已存在，9,432,848 字节，SHA-256 为 `fb4d7cdde024cd5efd97dab882e4e88768a4ab1fa7e189b2d1311f780dd3a609`。最终几何微调后已重跑 GLB 合同检查，未重复测试与构建。
- 只读合同检查通过：唯一 Hair 网格、一个 primitive、18,821 个顶点、22 条有效 hairGuides，完整 `_D1_STRAND_ID` / `_D1_STRAND_T` / `_D1_HAIR_FLOW` 属性，所有顶点权重均为 head=1，其余为 0。head 在 skin 内索引为 17；发束 ID、根梢进度和发流逐顶点检查均通过。
- GLB 保留 `idle`、`walk`、`run`、`jump` 四个动作。
- 主任务确认真实游戏环境 gallery 加载 39 且无 console warning/error，并已在 Blender 检查正面、45°、侧面、背面、顶面。本子任务未操作 Blender 或浏览器、未提交或推送。

## 美术与动画验收边界

- 39 是基于 05 雕刻主发束重做头皮、前额、冠部、耳侧和 bob 贴合的新稿，并非从零重新拓扑的完整发型；前额刘海仍沿用原雕刻。
- 贴头皮层复制真实 Head 表面，法向偏移 0.0075，最大最近距离 0.00750012；这一距离仅证明贴头皮层，不代表所有外层发根均已通过距离验收。
- 完整原画四视图 bbox 门槛尚未通过，报告位于 `assets/characters/grassy/customization/models/d1-render-lab-blender-hair/scalp-fit-study-01/multiview-fit-report.json`。当前状态为“贴合新稿”，未标记为“原画一致”美术验收通过。
- 现阶段发梢采用区域惯性，尚非逐束物理 rig。
