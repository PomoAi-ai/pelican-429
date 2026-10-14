# PLAN — AI 住宅的世界时间与科幻照明

## Status: done
## Task: 413
## Related: 412
## Baseline Commit: d2d72f4

## Goal
在当前住宅场景和建造游戏中加入统一 24 小时循环、太阳运行、黄昏、月亮星空，以及真正照亮家具和地面的科幻灯。

## Non-goals
不扩展其他主题场景，不改变住宅尺寸、角色、存档结构，不提交或推送。

## Acceptance Criteria
- 两个入口共用时间控件：拖动时间、暂停/循环、调整一天时长和四个时段快捷选择。
- 日夜平滑切换，太阳落下后月亮和星空显现，背景五层同步变为夜景。
- 壁灯、檐灯、吊灯保持现有标准尺寸，具有科幻造型和实际局部照明。
- 1280 格世界按相机位置选择局部灯，旧存档保留，其他展示分区不受住宅时间覆盖。
- 浏览器检查白天、黄昏、午夜、时间推进、远处分段及建造入口；完成相关检查。

## Constraints
复用游戏/目录共享模块，无新依赖；渲染效果不写几何和材质断言测试。工作区已有大量改动，以 /private/tmp/ai-home-daynight-start-snapshot 为本次增量基准。

## Decisions
- 复用 412 已完成的调用链探索，在本次按灯具、远景、时钟分给子代理补充探索和设计后实现。
- 默认 12 分钟一昼夜，提供 2 / 12 / 24 分钟速度；拖动时间或选时段后暂停以便检查。
- 时间只影响当前场景，不改变住宅存档；无需迁移，未触发设计审批停止条件。
- 太阳、月亮与天空均由统一时刻驱动；局部光数量固定以避免远处分段增加光照开销。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/core/world-clock.ts; test/world-clock.test.ts | 时间推进、天时采样与行为测试 | — | yes |
| 2 | src/render/ai-city-architecture.ts; definition-furniture.ts; residence-view.ts | 科幻灯具和实际局部灯 | — | yes |
| 3 | src/render/ai-city-environment.ts; ai-city-batches.ts | 远景夜间窗光、云水响应 | — | yes |
| 4 | src/render/celestial-sky.ts; ai-city-lighting.ts | 日月星空、渐变天空与环境光 | 1 | yes |
| 5 | src/ui/world-controls.ts; room-scene-preview.css; residence-hud.ts | 共用世界控制 | 1 | yes |
| 6 | src/app/residence-app.ts; room-scene-preview.ts; definition-scene-layout.ts | 两个入口集成 | 1–5 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | 通过；连续方向修复后复跑通过 |
| npm test | yes | 已运行：1901 项，1900 通过；1 项已有资料文字误判，见下 |
| npm run build | yes | 通过；连续方向修复后复跑通过，已有大包提示 |
| 浏览器昼夜、灯光、远处分段、建造入口 | yes | 通过：正午、18时、00时、自动推进/速度选择、第10段、旧存档建造入口、切其他分区再返回 |
| 子代理审查本次增量 | yes | 已修复日月方向二分硬切，复核通过，无剩余阻塞 |

## Final Decisions / Results
- 局部照明复用现有 facility-lighting 固定 4 暖光 + 2 蓝光池，镜头移动时淡入淡出选择最近灯；不增加逐灯阴影贴图。
- 日月主光以实际强度占比连续交接，避免晨昏阴影跳变。
- 时钟 4 个公开行为测试通过。全量唯一失败位于 test/architecture.test.ts:232，src/config/art-library.ts 的已有英文描述 `platform/window sizes` 被字符串规则当成 DOM 使用；cmp 已确认此文件与本次开始快照相同，本次未修改或跳过该测试。
- 本次 src/test 与开始快照之间仅有实施表列出的相关文件；保留此前工作区改动与旧住宅存档。
- 实景截图：assets/concepts/ai-city-residence/daylight-cycle-preview.png、starry-night-cycle-preview.png、night-builder-preview.png。
- 未提交、未推送；未检查移动端性能。太阳/月亮保留全局阴影，局部灯具有实际受光但没有逐灯遮挡阴影。
