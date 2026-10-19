# PLAN -- 星舰发动机群与目的地加载过渡

## Status: done
## Task: 518
## Related: 511, 517-transit-time-flight
## Baseline Commit: a13fdd68

## Goal
- 用程序建模、材质着色器、粒子和灯光强化星舰尾部发动机与厚重喷流。
- 发射、化光与穿梭结束后延续为下一场景的真实加载过渡，准备好才进入。

## Non-goals
- 不嵌入视频、视频贴图或预渲染动画，不更改已确认的座舱和登船流程。
- 不提交、不推送，不改无关场景与资产。

## Acceptance Criteria
- 紧凑发动机阵列、近口淡紫蓝喷束、白热融合主柱、暖橙翻滚边缘可见。
- 镜头保留横版游戏构图，低速起飞后加速、化光、穿梭连续。
- 加载层显示目的地和实际加载阶段；首帧就绪后离开，失败有明确反馈。
- 游戏和展示场复用渲染模块，完整运行相关检查并在浏览器验收。

## Constraints
- 保留喷流的深度核心与现有资源释放，避免背景 AO 污染。
- 尊重减少动态效果偏好。不为渲染效果添加网格或源码字符串测试。

## Decisions
- 视频只作观察参考。已实际播放 SpaceX 官网第七次试飞视频开头的尾部仰视镜头：密集白热圆口、紫蓝细束、融合亮柱和橙金烟云。
- 参考来源：https://www.spacex.com/content/starship-flight-tests （官网提供的 Flight_7_720P.mp4）；游戏不引用任何视频资源。
- 子代理分别负责尾焰建模实现与加载链路探索；沿用上一轮已完成的交通中心架构探索，不重复全仓探索。
- 这些修改局限本地且可回退，无需暂停审批。
- 加载复用正式 startGame 的场景构建，保留目的地玩法；等待所有角色、环境和 HUD 准备后揭幕。两种交通中心入口分别释放自己的场景与渲染器。
- 星流用独立 elapsed 连续推进，arrival 由真实就绪触发；等待期间不提前闪白或伪造总百分比。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/transit-center-model.ts | 紧凑发动机群和发热喷口 | — | yes |
| 2 | src/render/transit-exhaust.ts | 白热喷流与紫蓝束流 | 1 | yes |
| 3 | src/render/transit-center-fx.ts | 灯光与粒子衔接 | 1,2 | yes |
| 4 | src/app/transit-app.ts / transit-handoff.ts / game-app.ts / scene-workspace.ts | 穿梭接实际目的地加载，释放旧场景与输入，失败重试 | — | yes |
| 5 | src/render/transit-time-corridor.ts / src/app/transit-audio.ts | 加载期间持续星流与航行声，真实就绪时淡出 | — | yes |
| 6 | src/app/transit-controls.ts / src/ui/transit.css | 目的地、实际加载阶段、错误和重试界面 | 4 | yes |
| 7 | src/main.ts / src/ui/game-interface.ts | 同页交接复用游戏导航，补齐手机横屏宿主入口 | 4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | passed；手机入口修复后重跑通过 |
| npm test | yes | passed，2004/2004，302 suites |
| node --test test/architecture.test.ts test/latest-scene-loader.test.ts | yes | 手机入口修复后定向 24/24 通过 |
| npm run build | yes | passed；最终修复后重跑通过，保留既有大 chunk 提示 |
| 浏览器完整发射、加载、进入目的地 | yes | game → 算力大教堂、lab → 山体算力堡垒均通过 |
| 本地资源加载故障与重试 | yes | 临时代理对目的地模块返回一次 503，显示抵达中断；重试成功进入光纤深渊 |
| git diff --check（本轮文件） | yes | passed |

## Result
- 发射尾焰、化光、星流、目的地加载全部实时渲染，游戏未引用视频或预渲染动画。
- 两种入口抵达后均只有一个正式游戏画布，无交通中心、工作区或普通加载层残留；正式关卡可操作，成功路径浏览器无 warning/error。
- 子代理最终复核发现的实例化 GPU 缓冲释放和手机横屏宿主初始化问题均已修复。
- 实机截图与过程记录在 evidence/；engine-and-loading.webp 为尾焰与真实加载界面拼图。
- 未做手机真机验收或最终音效试听；未提交、推送或修改 CI。
