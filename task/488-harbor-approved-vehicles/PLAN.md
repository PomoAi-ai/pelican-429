# PLAN -- 正式载具与白日河岸场景

## Status: done
## Task: 488
## Related: 476
## Baseline Commit: c292d188

## Goal
将已认可的白日横版河岸构图接入独立可玩关卡，使用资料库正式飞行车、两款轨道列车与哨蜂四轴无人机；远处建筑减少并逐层消失，无山。

## Non-goals
不修改住宅或其他关卡，不改玩法平面/碰撞，不提交推送、不重启容器。

## Decisions
- 使用 dev 与已注入 Ponytail Full；复用前轮探索，子代理确认正式载具入口；没有需停止的方案分歧。
- 正式哨蜂复用 enemy-rig 真实模型及旋翼动画，只作环境角色；飞行车与列车用内置 ImageGen 按正式三视图派生透明侧视。
- 建筑/天空/岸台按已认可完整图统一绘制；稀疏远城逐层压淡，河面无遮挡。保留真实深度分层与横向玩法。
- 仅独立 harbor 使用新资源。旧透视页保留但增加通往新版游戏的明确入口。
- 渲染视觉与运动人工浏览器验收，不新增锁定材质或源码的测试。
- 已绘制并保存6张PNG，严格沿用参考车型与配色；原图及完整提示词保存为assets/scenes/harbor-daylight-v2/PROMPTS.json，不覆盖资料库原件。
- 中远景使用同一稀疏远城图，分层透明度0.5/0.16，错位布局且降低高度；没有山或额外密集天际线。
- 原画、水面与天空标记noLightMap，避免被玩法地下光照错误压黑；两条浅灰轨道关闭线性距离雾，保持与清晰列车一致。
- 程序式旧飞行器/列车只从新横版关卡移除，旧透视页和住宅交通保持原行为。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| public/scenes/harbor-daylight-v2/* | 原画/正式载具透明资源 | yes |
| assets/scenes/harbor-daylight-v2/PROMPTS.json | 完整来源和提示词 | yes |
| src/config/harbor-painted.ts | 资源清单与路径 | yes |
| src/render/harbor-painted-traffic.ts | 正式车型、精确图集区域、哨蜂运动 | yes |
| src/render/harbor-side-scene.ts | 白日分层、水面、岸台 | yes |
| src/app/harbor-presentation.ts | 白日光照 | yes |
| src/app/game-app.ts | 独立岸台替换岩石表面 | yes |
| vite.config.ts | 新资源随正式构建发布，6张原画SHA-256匹配 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes：1967通过，301套件，0失败 |
| npm --ignore-scripts run build | yes | yes：构建通过；现有大分块提示 |
| 浏览器默认/移动/跳跃与控制台 | yes | yes：宽1600/窄724、左右移动和跳跃，控制台无警告或错误 |
| 子代理相关代码审查 | yes | yes：修复轨道雾化后复查通过 |

## Evidence
- evidence/first-wide.png：宽屏构图与飞行车。
- evidence/moving-right.png：列车、哨蜂、车辆和横移视差。
- evidence/jump.png：实际角色跳跃，近岸仍保持连续。
- evidence/narrow.png：窄窗口。
- /private/tmp/harbor-v2-{typecheck,tests,build}.log：本地命令输出。

## Limits
飞行车和列车为透明侧视美术实例，按各自深度巡航；哨蜂为真实共享模型。未新增驾驶、乘坐或交通碰撞，不改变现有玩家玩法。未提交推送，未修改生产环境。
