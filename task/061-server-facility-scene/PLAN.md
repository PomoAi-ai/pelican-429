# PLAN -- 机房内外独立场景

## Status: blocked
## Task: 061
## Related: N/A
## Baseline Commit: 无（仓库尚无 HEAD，现有文件均未跟踪；按本次文件清单审查）

## Goal
制作与现有横版瓦片世界衔接的机房内外场景，以独立页面和导航入口访问。

## Non-goals
不改现有游戏关卡，不实现章节战斗或 Boss，不修改 vendor，不提交或推送。

## Acceptance Criteria
- 首页与全局导航能直接进入机房场景，无需进入游戏页。
- 同一实时场景展示自然外围、建筑入口、屋顶设备、服务器大厅与 G300 核心。
- 自然资产复用游戏工厂；工业资产放在共享 render 模块。
- 可查看全景和不同区域，支持横向查看、缩放及动画暂停。
- 类型检查、全量测试、构建通过，并进行浏览器视觉检查。

## Constraints
遵循 AGENTS.md；不新增依赖，不为渲染/UI 添加自动测试，不在 CI 运行测试。

## Decisions
- 图片阶段已完成，直接制作实时 three.js 场景。
- 使用独立页面模式与入口，不挂在游戏页或展示卡片下。
- 探索、设计、实现与审查使用当前任务子代理；不跨会话通信。

- 探索与架构子代理确认：createStage + createWorldViews + createEntityViews 可直接复用完整游戏资源，采用固定 LevelData 场景。
- 无需澄清或设计审批：范围可回退，独立页面符合当前要求。
- 坐标统一为 1 格 1 单位，地面 y=10，建筑 x48..104、屋顶 y24；入口横向贯通。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/world/facility-level.ts | 机房外围地形与水体 | — | yes |
| 2 | src/app/facility-environment.ts | 复用自然环境和鹈鹕 | 1 | yes |
| 3 | src/render/facility-view.ts | 共享工业建筑与服务器动画 | — | yes |
| 4 | src/app/facility-app.ts | 独立场景页面、镜头与生命周期 | 2,3 | yes |
| 5 | src/ui/facility.css | 页面布局与响应式控制 | — | yes |
| 6 | src/main.ts、src/config/showcase.ts、index.html、README.md | 路由、首页与导航入口及文档 | 4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，退出 0 |
| npm test | yes | no，1500/1501 通过；既有 render-tiles 断言失败 |
| npm run build | yes | yes，退出 0；有大 chunk 提示 |
| 浏览器视觉与交互检查 | yes | yes，独立入口、区域定位、拖动、缩放、Home、暂停/播放、返回页面 |

## Final Decisions
- 功能实现完成：独立 facility 模式、首页真实缩略图、顶部导航、自然外围与工业内景、定位及镜头控制。
- 工业模型位于共享 render 模块，自然场景使用正式 world/entity views；没有改动现有游戏关卡或 vendor。
- 浏览器检查修复了可见性切换后的帧时间边界，并按现有序章模式修复 BFCache 返回重建；子代理复审 Approved。
- 新增测试通过实际碰撞体跨溪流至机房后出口，保护连续通路；未新增渲染/UI 自动测试。
- 全量测试退出 1，1501 项中 1500 通过；唯一失败为 test/render-tiles.test.ts:102 对 tiles-climb-0-0 的投影属性断言。
- 定向复跑同样失败。在 $TMPDIR/pelican-facility-baseline-7au8wid1 中移除本次新增模块、恢复 main.ts/config/showcase.ts 原件，使用与仓库一致的 Node 25.9.0 运行同用例，复现同样失败，确认非本次回归。
- 因项目要求全量验证通过，状态保留 blocked；阻塞仅为既有测试，未修改无关断言，场景页面可使用。
- 实际预览截图：output/facility/overview.jpg、output/facility/entrance.jpg；首页缩略图：public/resources/facility.jpg。
- 验证日志：$TMPDIR/pelican-facility-test.log、$TMPDIR/pelican-facility-tile-recheck.log、$TMPDIR/pelican-facility-baseline-test.log、$TMPDIR/pelican-facility-build.log。
