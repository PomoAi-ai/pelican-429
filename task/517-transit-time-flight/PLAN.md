# PLAN -- 化光后的时空跟随飞行

## Status: validating
## Task: 517
## Related: 511
## Baseline Commit: c292d188

## Goal
火箭化光后镜头继续跟随数秒，让玩家看见高速星流与明暗流转的时空通道，再进入已选目的地。

## Non-goals
不改模型、登船、点火与离架效果，不增加目的地，不新增依赖，不提交推送。

## Acceptance Criteria
- 化光后有约 4.6 秒持续前进的画面，光核、不同纵深的星流与冷暖光幕可见。
- 化光、通道、抵达衔接连续，途中不提前导航或重新显示人物。
- 试玩与展示场复用同一渲染实现，减少动态效果设置下减少摆动与星流速度。
- 相关逻辑测试、类型检查、全量测试与构建通过，真实浏览器完成一次全流程。

## Decisions
- 沿用 511 的探索与现有装配路径；状态机子代理核对调用方并实现 travel 阶段，表现子代理实现单一共享 shader，主代理接入镜头、HUD 和声音。不另设重复探索/设计轮。
- `warp → travel → complete`，只有 travel 结束返回目的地；以公开状态转换测试抓住提前跳转与重复通知回归。
- 化光仍是短促爆发，travel 单独持续 4.6 秒；不把原有白屏简单延长。
- 全屏透视光流使用少量解析计算，不引入流体模拟或纹理依赖；深度平面避免背景 AO/反射污染。
- 功能可回退且无外部副作用，没有审批停止条件，直接实施并验证。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/config/transit.ts / src/sim/transit.ts / test/transit.test.ts | 新增 travel 阶段与导航时序测试 | — | yes |
| 2 | src/render/transit-time-corridor.ts | 共享时空通道与降低动态效果 | — | yes |
| 3 | src/app/transit-app.ts / transit-pilot.ts / transit-audio.ts | 视觉参数、镜头、HUD、人物显隐和通道声 | 1 | yes |
| 4 | src/render/transit-center-model.ts / transit-center-fx.ts | 连接共享渲染及资源释放 | 2,3 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| node --test test/transit.test.ts | yes | pass，6/6 |
| npm run typecheck | yes | pass |
| npm test | yes | pass，2004/2004，约 50.81 秒 |
| npm run build | yes | pass，现有大于 500 kB 的 chunk 提示保留 |
| 浏览器完整发射、时空通道、抵达；截图/动态记录 | yes | no |
