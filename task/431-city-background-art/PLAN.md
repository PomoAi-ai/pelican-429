# PLAN -- 住宅高科技城市背景资源

## Status: implementing
## Task: 431
## Related: 430
## Baseline Commit: 64ef4a38

## Goal
- 按用户参考补齐住宅背景的环形高塔、科幻城市、空中飞行器、悬轨列车与瀑布峡谷；绘制需要的资源并实际接入场景。

## Non-goals
- 不改变住宅格子、家具、玩家标准镜头和菜单，不扩展其他场景或存档格式。

## Acceptance Criteria
- 正常游玩镜头可见明确的高科技地标，比例及颜色接近参考。
- 城市与峡谷分层，背景控制能分别切换，天空、太阳不烘焙在图片内。
- 列车、飞行器保持动态，背景响应昼夜和天气；加载失败可见、切场取消正确释放。
- 绘制源图及运行资源保存在仓库；浏览器核对白天、夜晚与移动；类型检查、全量测试、构建通过。

## Constraints
- 共用游戏资源工厂；不新增依赖；不改 vendor；UI/渲染以浏览器验收。
- 保留现有未提交工作，差异以本轮开始的文件快照核对。

## Decisions
- 用户实景反馈图片效果不满意，要求本轮优先完成门口格子与通行；背景视觉迭代暂停，不能将此资源任务标为视觉验收完成。现有两张原图和接入代码保留，等待后续调整。
- 子代理探索确认目前主城/峡谷只有简化几何，没有绘制图层，远景雾与比例也削弱了辨识度。
- 用内置 image_gen 分别绘制透明主城和峡谷资源；保留独立天空和真实动态交通，避免将整体参考作为静止背景。
- 探索与架构建议由同一子代理完成：主城大尺度透明卡置于既有 city 层，峡谷补充既有 canyon 层，使用既有 prepare 进度和资源释放协议。引用资源只放在仓库内。
- 当前要求已足以裁决比例与表现方向；操作可回退，不涉及额外审批，直接实施并浏览器校准。
- 交通造型用共享低开销三维几何，替换敌人无人机和方盒列车，仍按原轨道函数运动。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/scenes/ai-city-background-v1/ | 透明主城/峡谷运行资源 | — | no |
| 2 | src/render/ai-city-backdrop.ts | 共享背景资源、加载及日夜响应 | 1 | no |
| 3 | src/render/ai-city-environment.ts | 接入分层、进度、取消和释放 | 2 | no |
| 4 | src/render/ai-city-traffic.ts | 科幻列车/飞行器造型、运动与背景匹配 | — | no |
| 5 | assets/scenes/ai-city-background-v1/ | 原图、提示词和来源记录 | 1 | no |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm run build | yes | no |
| 浏览器日夜/移动/分层/切场取消 | yes | no |
| 本轮 diff review | yes | no |
