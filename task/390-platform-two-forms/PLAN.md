# PLAN -- 平台收为两种形态 × 两种对齐

## Status: done
## Task: 390
## Related: 384
## Baseline Commit: d2d72f4

## Goal
平台定义从「3 宽 × 深1/深2 × 3 对齐 = 18 组」收为：
- 两种形态，前沿都在 Z=+0.5：背后无墙时深1居中（Z=[−0.5,+0.5]）；背后有墙时从墙面挂出 1.5（Z=[−1,+0.5]）。按「背后有没有墙」自动决定，以后再看是否调整。
- 两种高度对齐：整砖顶（j+1）、半砖顶（j+0.5）；删除「墙格底边对齐」候选。
- 左右半宽平台保留。
- 两种形态都可以放家具；平台被拆时，上面的家具一并拆除。

## Non-goals
- 正式游戏的平台渲染、碰撞与建造不改。

## Acceptance Criteria
- 定义构件按墙自动选形态，预览分区、文档、概念页与平台图同步。
- typecheck、npm test、build 通过。

## Constraints
- AGENTS.md：展示场复用共享构件；fail-fast；不写「不写」清单测试。未经要求不提交。

## Decisions
- 子代理在本会话持续被网关 403 拒绝，全部由主会话直接完成。
- 用户已逐条确认方案（两种形态、自动按墙、保留半宽、平台上可放家具、拆平台连带拆家具），无停止条件。
- 深2平台与深度参数整体删除，PLATFORM_DEFINITIONS 删除（仅大场景连廊使用，改为就地取宽度）。
- 旧规则「只许居中、禁止贴墙」改写为「前沿固定 +0.5」：禁止的是前沿落在人物脚下的深1贴墙。

- 形态在放置平台时按已铺的墙判断，事后在同一格补墙会抛错；装配顺序须先墙后平台。接入游戏时改为按格查询。
- 用户说“半砖平台需要”，按“左右半宽保留、半砖顶对齐也保留”处理，共 3 宽 × 2 对齐，每种两种形态。
- 预览「深度定义」分区室外原深2平台组删除；室内挂墙平台放置物架、室外居中平台放椅子，演示两种形态都能放家具。
- 大场景连廊原按 18 组定义逐级取样，改为每条竖井换一种宽度、最低一级整砖顶其余半砖顶。
- 重绘：platform-mount-perspective（2500×3895）、platform-half-plan、platform-position-plan、platform-definition、两张两层房屋图、家具图谱脚注。两层半砖房屋图（旧草案）的水平板两端改用 1/4 砖，与半宽侧墙外沿齐平，和预览场景一致。
- 左右半宽平台经用户确认为必须支持（半格房屋接半宽侧墙要用）。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/definition-kit.ts, src/render/definition-kit.ts | 平台深度常量、按墙自动选形态 | - | Done |
| 2 | src/app/definition-scene-layout.ts, definition-settlement-layout.ts, definition-depth-layout.ts, depth-scenery.ts, room-scene-preview.ts | 调用方与 12 组分区 | 1 | Done |
| 3 | docs/platform-definitions.md 等定义文档、src/ui/site-pages.ts | 文字 | - | Done |
| 4 | assets/concepts/**.py → public/concepts/*.png | 平台图重绘 | 3 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done |
| npm run build | yes | Done |
