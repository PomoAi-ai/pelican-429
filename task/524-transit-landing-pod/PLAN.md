# PLAN -- 星舰着陆舱：抵达目的地后缓慢着陆

## Status: done
## Task: 524
## Related: 522
## Baseline Commit: a13fdd68（工作区含 518–522 未提交的交通中心改动，以当前工作区为基线）

## Goal
从交通中心穿越抵达目的地关卡后，出生点上空出现一个单独的小型载人着陆舱（沿用星舰顶部座舱造型与钢壳材质），底部反推光焰点亮、着陆支脚展开、缓慢减速降落；落地后舱门打开，角色走出，玩家获得控制，正式开始游戏。

## Non-goals
- 不做整艘星舰的垂直着陆。
- 不改穿越流程、时空航道与目的地真实加载机制。
- 不做着陆舱返航、再次登舱或世界地图整合（世界地图由另一会话负责）。
- 不给非交通中心进入的关卡加着陆（直接打开关卡网址时照常出生）。

## Acceptance Criteria
- 仅当从交通中心抵达时播放着陆；直接访问关卡网址时行为不变。
- 着陆舱造型与星舰座舱同源（共享建模/材质函数），不另造一套独立假模型。
- 着陆阶段：反推光焰与地面烟尘、支脚展开、先快后慢的减速、触地轻微压缩；全程玩家输入锁定，角色在舱内不可见或坐姿。
- 落地后舱门打开，角色从门口走出到出生点，之后正常控制；着陆舱留在原地作为场景物体（不阻挡出生点通行）。
- reduced-motion 时缩短着陆时长。
- 关卡加载完成后再开始着陆，着陆与交通中心的抵达白光衔接，无旧画布残留。

## Constraints
- 遵守 AGENTS.md：逻辑层不依赖 three/DOM；表现层改动由浏览器人工验收；不加防御性检查、不写违规测试。
- 展示场与游戏复用同一生成函数。
- 另一会话正在做世界地图整合，可能同时修改 game-app 等装配文件；本任务改动尽量收敛在独立模块，装配点改动最小。

## Decisions
- 着陆舱形态：单独小型载人着陆舱（用户选择）。
- 着陆位置：目的地关卡出生点（用户选择）。
- 从交通中心进入堡垒时，用着陆替代黑洞开场；直接访问仍走黑洞开场。理由：两段开场都会锁定玩家，叠在一起冲突。
- 时序：逻辑层照黑洞开场（blackholeArrivalTicks）的写法新增 podLanding。舱内阶段（下降 4.8 s、触地 .6 s、开门 1.1 s）冻结世界、丢弃输入，玩家身体随舱下降；走出阶段玩家向左步行到出生点后交还控制。reduced-motion 下为 1.5/.25/.5 s，起始高度降到 4。
- 走出阶段玩家不受伤：世界与舱内阶段一样冻结（敌人、弹体、伤害结算都不推进），只对玩家执行固定的向左步行（updatePelican + moveAndCollide + resolvePelicanState），丢弃真实输入。理由：此时玩家无法操作，照常运行世界时深渊关敌人会在走出途中命中玩家；复用无敌帧会弹出“免伤”提示且敌人仍会围到出生点。
- 起始高度压在上层踏板之下：堡垒 18、大教堂 6、深渊 10；舱心在出生点右侧 offsetX 6.3、z −3.4，位于行走平面之后。
- 同源复用：从 transit-center-model 最小导出构件、profileSection、createPressureHatch（滑动角带符号）、createHullPalette，火箭外观保持不变；createPlume 导出，地面高度改为 uniform。鼻锥由 TRANSIT_HULL_PROFILE 缩放派生。
- 镜头走 frame-loop 现有的 closeup 通道；舱上不放点光源，避免全场景重编译。
- 跳过 explorer 之外的第二架构：无实质分叉；包体积的替代方案（独立 transit-hull-kit）暂不采用。
- 用户反馈造型差距大：着陆舱改为 1:1 复用星舰座舱段（细长钢壳、大弧形驾驶舱窗、左侧滑门、焊缝铆钉），舱下补短舰裙、支脚和反推；角色从左侧出舱，舱体放在出生点右侧。
- 用户要求专门的测试场景，加入场景菜单：目的地选择 +“开始飞行”（直接从发射开始，播放穿越并真实加载目的地，然后着陆）+“开始着陆”（直接打开目的地并立即着陆），每次点击重新载入内嵌画面，可反复测试。内嵌 iframe 让交接在框内完成，工作区和按钮保留。网址参数 flight=<目的地>、landing=1 是边界，入口处校验一次。
- 无停止条件，直接实施。
- 堡垒着陆位：舱落在出生点右侧 x≈50.3、z −3.4，原有石柱、路灯和 x 49–53 段砌石与舱体重叠；按用户选择移走这些装饰，在 `facility-approach.ts` 按 `landingPodPlan('fortress')` 铺一块带灯点的圆形停机坪，直接进关卡时也能看到。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/transit.ts | profileRadiusAt（transitHullRadiusAt 改为调用它）、LANDING_POD 规格、landingPodPlan(chapter, reduced) | | ✓ |
| 2 | src/render/transit-exhaust.ts | 导出 createPlume，新增 floorY 参数并改用 uFloorY uniform | | ✓ |
| 3 | src/sim/sim-world.ts | podLanding 状态、beginPodLanding、podAltitude；stepSim 加舱内冻结与走出替换输入 | 1 | ✓ |
| 4 | src/render/transit-center-model.ts | 导出构件、profileSection/profilePoint、createPressureHatch、createHullPalette；火箭外观不变 | 1 | ✓ |
| 5 | test/facility-chapter.test.ts | 三关参数化：着陆期间锁定输入、走到出生点、交还控制 | 3 | ✓ |
| 6 | src/render/transit-landing-pod.ts | 新建：舱体、支脚、反推光焰、尘埃、舱门、玩家视图隐藏与偏移、closeup、dispose | 2,3,4 | ✓ |
| 7 | src/app/frame-loop.ts | 可选 lander 依赖：closeup 接入 cameraRig，views.sync 后调用 update | 6 | ✓ |
| 8 | src/app/game-app.ts | presentation 存在时开始着陆、否则走原黑洞分支；预热前创建舱体并首帧同步；传给 frame loop | 3,6,7 | ✓ |
| 9 | src/app/game-app.ts | 网址参数 landing=1 时直接开始着陆（测试场“开始着陆”入口） | 8 | ✓ |
| 10 | src/app/transit-app.ts（+ sim/transit.ts 如需） | 网址参数 flight=<目的地> 时跳过登舱，直接发射 | | ✓ |
| 11 | src/app/landing-lab.ts（新）、scene-catalog.ts、scene-workspace.ts | 场景菜单“星舰飞行 · 着陆测试”：目的地选择、开始飞行、开始着陆，内嵌 iframe | 9,10 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| node --test test/facility-chapter.test.ts test/transit.test.ts test/architecture.test.ts | yes | ✓ |
| npm test | yes | ✓ |
| npm run build | yes | ✓ |
| 浏览器人工验收：交通中心发射→穿越→目的地着陆→出舱→可控；直接访问关卡不着陆 | yes | ✓ |
