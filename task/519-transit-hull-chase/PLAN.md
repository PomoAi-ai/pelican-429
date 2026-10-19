# PLAN -- 星舰实体舱门与尾部追航

## Status: done
## Task: 519
## Related: 518
## Baseline Commit: a13fdd68

## Goal
- 修正舰体轮廓、顶部舱门与实体碰撞；门沿舰体向远侧滑开，登船无穿帮。
- 时空穿梭采用后方追随星舰的镜头，清楚看到尾部发动机与尾焰，延续为真实目的地加载。

## Non-goals
- 不嵌入视频，不重建独立预渲染过场，不将顶部座舱移回参考图低位。
- 不改无关工作区文件，不提交或推送。

## Acceptance Criteria
- 舰体上下平顺过渡，门闭合贴壳、开启滑向远侧，门框/门禁位置稳定。
- 自由移动/飞行时不能穿过舰体，登船和出舱沿实际开口进行。
- 后追视角能辨认立体舰体、尾部喷口和持续喷焰，星流向镜头掠过。
- 已有目的地加载、失败重试与游戏/展示场复用机制保持有效。

## Constraints
- TypeScript/three.js 原有分层；复用真实模型、共享轮廓，不新增视频资源或依赖。
- 仅碰撞与逻辑回归增加行为测试，模型/动画在浏览器验收。
- 基线包含上一轮未提交改动；本轮开始快照位于 /private/tmp/transit-hull-chase-baseline。

## Decisions
- 沿用上一轮加载架构探索，只对子模块做定向探索；子代理负责舰体/门与碰撞，主代理负责后追镜头与特效。
- 参考图用于钢壳弧度与体积，用户已确认的顶部驾驶舱、细长比例、独立塔架继续保留。
- 定向探索确认：舰体斜面被自动踏阶反复抬高，使用共享轮廓和舰体禁踏阶属性修复，不改变其他场景坡面行为。
- 后追复用同一舰体和喷口，穿梭时保持既有高度，镜头从尾下方看向舰艏；星流改为深度背景，入场/抵达闪光独立覆盖，避免背景盖住舰体。
- 七束有体积的离子喷流用于后追视角，起飞继续保留厚重白热合流尾焰。修改均在本仓库可回退，无需审批。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/transit.ts / src/app/transit-pilot.ts / src/sim/transit.ts / src/physics/definition-collision.ts | 共享轮廓与实体阻挡、登舱路径 | — | yes |
| 2 | src/render/transit-center-model.ts | 曲面滑门、连续舰体轮廓与门框厚度，出舱合门平滑 | 1 | yes |
| 3 | src/app/transit-app.ts | 后方追航相机与加载衔接 | — | yes |
| 4 | src/render/transit-time-corridor.ts / transit-center-fx.ts / transit-exhaust.ts | 星流背景、七束立体离子尾焰与抵达光效 | 2,3 | yes |
| 5 | src/ui/transit.css | 加载信息移至左下，避开亮尾焰 | 4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/definition-collision.test.ts test/perspective-player.test.ts test/transit.test.ts | yes | 44/44 通过；已先复现自动踏阶抬升缺陷 |
| npm run typecheck | yes | 通过 |
| npm test | yes | 2008/2008 通过，302 suites |
| npm run build | yes | 通过；仅原有大 chunk 提示 |
| git diff --check（本轮文件） | yes | 通过 |
| 浏览器：侧面/飞行碰撞、滑门进出、发射后追、真实加载进入 | yes | 开发页进入算力大教堂，构建预览进入山体算力堡垒均通过 |

## Result
- 持续向舰壳移动不再被抬上船顶；跳跃/飞行碰到舰体侧面仍受阻挡，从上方落在舰壳时可承托。进出舱保留真实门口深度，开门沿曲轨向背侧退让。
- 同一艘实时模型在穿梭中重新可见，七束体积喷流从实际喷口发出；星流跟随舰艏投影，独立入场/抵达白光覆盖整场。
- 最终构建实测到达后只有一个正式游戏画布，无交通中心或加载层残留，浏览器无 warning/error。真实加载卡片位于左下，不遮挡尾焰。
- 定向子代理复核未发现新增问题；模型、碰撞和展示场继续使用共享资源。
- 证据在 evidence/，hatch-and-chase.webp 为舱门实体与追航加载实机拼图。
- 本轮未重做故障注入（上一轮已验，交接错误路径未改），未做手机真机或音效试听；未提交、推送或修改 CI。
