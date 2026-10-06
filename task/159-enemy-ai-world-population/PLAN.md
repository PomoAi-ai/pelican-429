# PLAN -- 敌人追击 AI、Boss 闪现与全世界驻军

## Status: done
## Task: 159
## Related: 144
## Baseline Commit: 3a35077

## Goal
让无人机随玩家升降追击，地面敌人按战况选招，Boss 能闪现追到高台；各层与自由世界都使用同一敌人 AI。

## Non-goals
不新增行为树框架或依赖，不改角色美术/游戏界面，不引入无限复活/联网服务，不提交推送。

## Acceptance Criteria
- 无人机追踪玩家水平与高度，冷却期间保持机动，不能依靠飞高直接让它失去反应。
- 地面敌人按距离/高度选招，能跨小障碍、避开无落脚悬崖，脱战返回驻点。
- Boss 闪现有预警、冷却与安全落点，支持高台；不会把自身放进实体墙或水。
- 堡垒各可玩层、自由世界原野/岛屿/干燥洞穴/机房都有合法驻军，出生区安全且种子可复现。
- 主线外围计数不包含上层驻军；阶段存档恢复有上层驻军；通关自由世界入口使用完整自由世界逻辑。

## Constraints
保留工作区大量并行改动；测试使用真实逻辑内存夹具，渲染人工抽查。只运行本地验证。

## Decisions
- 三个子代理分别探索并实施小怪、Boss、刷怪布局，主代理负责主线/自由世界接线。
- 根因是无人机每帧清零垂直速度并受出生点横向绳限，地面怪盲轮换技能，Boss 固定机房坐标和固定循环。
- 保留原招式模型；加入轻量追击状态与地形探测，不实现通用寻路框架。Boss 闪现复用地形碰撞查询与安全站点。
- 各层驻军与外围任务敌人分开计数；刷怪指关卡初始化布置，不擅自增加无限复活。
- 无不可逆操作或仅用户可裁决的方案分歧，设计直接批准实施。
- 哨蜂二维追击并绕局部障碍，投弹时锁位；炸弹空中触碰玩家即结算并移除，避免穿过玩家或落地二次伤害；铝热剂继续封锁地面。
- 楼层布防：堡垒34、教堂29、深渊41；自由世界按seed稀疏放置四种敌人，营地40格安全范围。主线单独记录perimeterIds，不写入持久化存档。
- 交叉审查补充36次真实Boss高台闪现，落点无穿模/入冷却液；清理perimeterIds后core推进且上层守卫仍在。
- 既有平台/出口/倒计时测试使用无守卫夹具，避免新增追击影响其非战斗主题；独立布防/主线用例保留真实守军。
- 浏览器隔离页实测：无人机从y55追至y77，玩家由y63升至约79；高台Boss落点预警与上层战斗可见。仅临时运行状态用于观察，已关闭验证页并恢复视口，未改用户127.0.0.1存档。
- 行为边界：局部绕障而非全局寻路；强度和密度仍需完整真人通关体验。本次未做手机触控完整通关。

## Implementation Map
| Area | Files | Done |
|---|---|---|
| 小怪追击与选招 | entities/enemy.ts, config/enemy-rules.ts | yes |
| Boss 闪现与选招 | entities/boss.ts, config/boss-rules.ts, render/npc/boss-view.ts | yes |
| 世界驻军 | world/facility-level.ts, world/free-world.ts及刷怪辅助 | yes |
| 主线/自由世界接线 | sim/mainline.ts, sim/sim-world.ts, app/game-app.ts, ui/story-hud.ts | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes，1655/1655，0失败/跳过，137.9秒 |
| npm run build | yes | yes |
| 真实模拟追击/闪现/刷怪回归 | yes | yes |
| 浏览器抽查 | yes | yes |

定向验证：enemy/orb/weapons 84/84，Boss17/17，mainline5/5，世界/平台/章节33项通过。统一typecheck通过，build通过（19.67秒，既有chunk体积提醒）；范围内diff --check通过。

最终统一验证由core-test子代理完成，三个命令均exit0。未提交或推送。
