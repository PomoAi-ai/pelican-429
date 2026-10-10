# PLAN -- 透视场景与正常游戏骑车对齐

## Status: done
## Task: 369
## Related: 366
## Baseline Commit: 975f136

## Goal
透视场景可使用正常游戏的R上下车、骑车移动和跳跃，复用正式自行车模型与动画，技能及视角控制独立。

## Constraints
定义场碰撞包含半砖、斜坡、薄平台与动态太阳能板；不能用空瓦片地图替代骑行净空和障碍探测。只改相关代码，保留其他未提交工作。

## Decisions
- 子代理探索共享骑行逻辑和碰撞接入，再确定最小实现。
- 新测试针对骑行状态/位移/碰撞，渲染与UI使用浏览器验证。
- 探索确认现有控制器与骑行状态机可直接复用，仅需替换碰撞查询。架构审查后采用必填RideProbe参数，同步修改全部三个调用方；正式sim每步共享一个瓦片探测器，透视持有实时多边形探测器。
- 渲染探索已完整定位正式animateHuman及全部状态，跳过重复探索；将其提取为共享工厂，正式游戏和透视共同调用，不复制自行车模型/动画/尺寸规则。
- 上下车沿用正常桌面游戏R键，操作说明同步更新，不另造按钮。无需审批或新增依赖。

## Implementation Map
| File | Intent | Done |
| --- | --- | --- |
| src/physics/ride-probe.ts, src/physics/definition-ride-probe.ts | 瓦片与定义几何查询适配 | yes |
| src/entities/pelican-ride.ts, src/entities/pelican-controller.ts, src/sim/sim-world.ts | 共享骑行状态机接入几何查询 | yes |
| src/app/perspective-player.ts, test/perspective-player.test.ts, test/ride-probe.test.ts | 开启R骑车、结算撞墙净空、行为验证 | yes |
| src/render/grassy/grassy-player-animator.ts, src/render/player-view.ts, src/app/perspective-controls.ts | 同源人物/骑行动画与说明 | yes |

## Validation
| Command | Required | Done |
| --- | --- | --- |
| npm run typecheck | yes | passed |
| npm test | yes | passed — 1869 tests |
| npm run build | yes | passed — existing large-chunk warning |
| 浏览器R上下车、骑行动画、跳跃、技能、视角 | yes | passed |

## Outcome
- 目标骑行相关测试61项通过，包括与正式控制器逐帧对照、上车中平台不下穿、薄墙/门楣/坡面和动态轮廓。
- 浏览器验证大场景开阔处R上车、骑车移动与跳跃、自由镜头中骑行、R下车后技能恢复；低门楣自动下车符合正式规则。
- 子代理实现、代码审查和统一测试完成。审查确认的上车中下穿时序问题已修复并添加回归。
- 并行分层场景文件缺失曾暂时阻断浏览器，依赖落盘后验收恢复；未修改这些无关文件。
- 未提交或推送，未做手机真机验证。保留组合键边界：上车时同时S+空格不记录跳跃缓冲；正常上下车与骑行跳跃一致。
