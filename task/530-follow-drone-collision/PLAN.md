# PLAN -- 跟随无人机碰撞体积

## Status: done
## Task: 530
## Related: 523
## Baseline Commit: a13fdd68

## Goal
- 主游戏中跟随玩家的无人机（game-hud 的两台跟随机）获得碰撞体积：
  - 玩家可以站在无人机上（地面与飞行状态都算可站立平台）。
  - 两台跟随机之间互相碰撞，不重叠。
  - 无人机不能穿越物理墙体格。

## Non-goals
- 怪物无人机（entities/enemy.ts）、家园作业机（sim/homestead.ts）不加碰撞。
- 不改无人机外观与动画。

## Acceptance Criteria
- 玩家从上方落到无人机车顶时停住，可以站立和起跳；从侧面不会被卡死在车身里。
- 两台跟随机在任何状态下车身不重叠。
- 无人机移动时遇到实心格停下或绕开，不进入实心格。
- 逻辑层仍不依赖 three/DOM/Math.random；`test/architecture.test.ts` 通过。

## Constraints
- 分层：world → physics → combat → entities → sim 只向左依赖；表现层不能被逻辑层读取。
- sim-world.ts、definition-collision.ts、game-app.ts、game-hud.ts 有其他会话未提交改动：只做最小插入，不整仓暂存。
- 碰撞纯逻辑用 node --test 断言具体结果，加到已有同主题测试文件。

## Decisions
- 跟随机保留两台：用户需求包含“无人机互相之间也有碰撞”。
- 探索：dev:explorer 梳理了跟随机链路；玩家物理那一路的 explorer 因额度限制中断，改为直接读 entity-collision / tile-collision / sim-world。设计与实现阶段同理未派 subagent，由主会话直接完成（改动面已逐文件明确）。
- 跟随移动仍留在表现层（活动半径取决于屏幕宽度，搬进 sim 会破坏同种子同世界）；sim 里只放一个运动学碰撞体 followDrone 实体，照飞行跑车写法：pushable false、standable true、layer dummy / mask pelican，只和玩家碰撞。
- 位置在 tick 内写入：表现层每帧写 targetX/targetY，sim 步进时 updateFollowDrone 把 body 移到目标并给出速度。savePrev 在 tick 开头，位移落在 tick 内，resolveSolids 的 carry 才能带着车顶上的玩家走。
- 碰撞体：原点在轮底，半宽 0.75，高 0.84（车壳顶），尺寸放在 config/follow-drone.ts，表现层与实体共用。
- 不穿墙在表现层的移动里做：app 用 overlapsSolid 提供 droneBlocked（车身盒从轮底上 0.25 到头顶 1.44，坡面上的轮子不算撞墙）。飞行时水平撞墙停在墙前、无支撑升降不穿天花板/地板；地面行驶原本就由支撑检查挡住台阶。已卡在墙里时放行退出。
- 两机互撞：separateDrones 在两台都自主跟随时把重叠部分左右各退一半，被墙挡住的一侧不动由另一台全退；上下错开超过车高不算重叠。
- 出舱护送阶段（带 escortDepth）关掉碰撞体，免得在舱梯上挤开玩家；家园作业机与透视场景（多边形碰撞，droneBlocked 恒为 false）不加碰撞体。
- 无停止条件：不涉及持久化、外部接口；直接实现。
- 审查（reviewer-general）修复：
  - 玩家站在悬停机车顶时，以无人机自身轮底为地面查询基准、无支撑时保持高度，不再追着玩家高度上升。
  - 地面行驶也做撞墙检查（抬高 0.6 再查，避开 45 度坡），撞到高墙停下，追赶时起飞越过。
  - Boss 场清空实体表后把碰撞体放回。
  - 表现层按帧写目标时附带帧时长，sim 按从当前位置算起的速度在各 tick 匀速分摊，避免一帧多 tick 时速度忽大忽小把车顶玩家弹起。
- 遗留：已卡在墙里时撞墙检查放行（为了能退出来），极端情况下仍可能加深穿透；车顶站人时无人机在等待模式下仍会因玩家太近而慢速走开，带着玩家移动。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/follow-drone.ts | 碰撞体尺寸 | | Done |
| 2 | src/entities/follow-drone.ts、entity.ts | followDrone 实体与 tick 内移动 | 1 | Done |
| 3 | src/sim/sim-world.ts | 步进中调用 updateFollowDrone | 2 | Done |
| 4 | src/ui/drone-locomotion.ts | 撞墙判断、separateDrones | 1 | Done |
| 5 | src/ui/game-hud.ts | droneBlocked 选项，两机分离后再交给渲染 | 4 | Done |
| 6 | src/app/follow-drone-bodies.ts、game-app.ts、facility-app.ts、perspective-controls.ts、scene-wiring.ts | 接线与空视图 | 2,5 | Done |
| 7 | test/drone-locomotion.test.ts、test/entity-collision.test.ts | 撞墙、两机分离、车顶承载与侧挡用例 | 4,6 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（2029/2029） |
| npm run build | yes | Done |
| 浏览器目视：站上无人机、两机不重叠、不穿墙 | no | 待用户验收 |
