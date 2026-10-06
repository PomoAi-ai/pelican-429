# PLAN -- 黑洞吸力与悬停入场

## Status: blocked
## Task: 201
## Related: 198
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Goal
堡垒开场让玩家从黑洞中心出现，固定 1 秒后自然下落；黑洞附近有平滑向心吸力，持续飞行可挣脱。

## Non-goals
不改变黑洞视觉风格、不增加吸入即死规则、不改变主线存档格式。

## Acceptance Criteria
- 场景显示时玩家身体中心对齐黑洞中心，前 1 秒不响应移动/飞行/攻击，之后恢复操控和重力。
- 加载耗时、暂停及后台不消耗开场时间。
- 吸力有限且平滑归零；核心不产生 NaN，不输入可以下落，持续飞行能离开作用半径。
- 预览重置与全新主线堡垒开场触发；死亡重生及已有主线进度恢复不强制重播。
- 共享自由世界里的黑洞吸力正确平移，不改变其他场景和自由世界初始出生。

## Constraints
纯逻辑层不得依赖 three/DOM/时间；复用固定步长、控制器和碰撞系统；本地验证，不提交或推送。

## Decisions
- 子代理已完成 explorer 探索与架构设计：逻辑核心涉及 5 个生产文件，复用 app 首帧后启动的固定步长，无需改控制器/帧循环/存档。
- 保留安全出生点用于重生，通过独立入场状态移动开场玩家，避免把存档/复活点也改到空中。
- LevelData 携带黑洞逻辑中心，合并自由世界时平移；玩家控制器之后、碰撞之前叠加半径 9 的柔化 Wendland 向心力，最大系数 40，低于水平空气加速度 45 和飞行上升加速度 70。
- 开场不缓存瞬时攻击、变身或跳跃输入；不改变形态和主线骑行。自由世界初始定位堡垒时也播放，后续传送不重播。
- 新主线由序章入口显式传入 newStory；不能用 progress 缺失推断，避免旧版检查点存档重播。
- 无需只有用户才能回答的问题，没有难回退或外部操作，设计直接通过并进入实现。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/world/level.ts | 黑洞逻辑中心元数据 | — | yes |
| 2 | src/world/facility-level.ts | 堡垒挂接共享黑洞坐标 | 1 | yes |
| 3 | src/world/free-world.ts | 合并地图时平移黑洞中心 | 1,2 | yes |
| 4 | src/sim/sim-world.ts | 入场冻结与向心吸力 | 1 | yes |
| 5 | src/app/game-app.ts | 正确范围及初始化顺序触发入场 | 4 | yes |
| 6 | test/facility-chapter.test.ts | 入场、释放、吸力、挣脱、重生行为 | 2,4 | yes |
| 7 | test/free-world.test.ts | 自由世界黑洞位置与物理范围 | 3,4 | yes |
| 8 | src/app/story-app.ts | 显式区分新主线与旧存档恢复 | 5 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 针对性行为测试：悬停/放开/吸力/飞离/作用域/重生 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | no |
| npm run build | yes | yes |
| 浏览器验证开场与实际逃离 | yes | yes |
| core-review 与 diff-guard | yes | yes |

## Validation Evidence
- typecheck 通过；定向 facility-chapter + free-world 测试 28/28 通过。
- 全量 npm test：1737 项，1736 通过；仅 worldgen 生成耗时门限失败（606.5ms > 250ms），隔离复测仍失败（326.7ms > 250ms）。
- npm run build 通过，保留既有大 chunk 提示。
- 浏览器确认初始黑洞内身体拉伸、释放后落地、空格配合向右键可离开；控制台无错误。首次一秒的精确时长由固定步长行为用例验证，浏览器首帧受机器负载影响。
- 子代理审查发现的旧存档入场误判已修复并复核。临时录制页面已删除，真实预览恢复标准入口。
- 本任务改动 diff --check 通过；保留其他并行工作的无人机等改动。
- 关闭当前游戏预览释放渲染负载后，性能用例复测仍失败，见 /tmp/pelican-blackhole-arrival-perf-unloaded.log；本任务未修改 generateWorld，不修改性能门限，也不将其称为已证实基线问题。
- 当前阻塞仅为既有世界生成性能验收；本任务行为、类型、构建和审查已通过，未提交或推送。
