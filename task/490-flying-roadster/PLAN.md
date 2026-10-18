# PLAN -- 可站立的喷气 Roadster NPC

## Status: done
## Task: 490
## Related: N/A
## Baseline Commit: c292d188

## Goal
把白色喷气 Roadster 概念车接入真实游戏，作为自动往返飞行的友好 NPC；玩家可跳上车顶并随车移动，也可跳离。

## Non-goals
不新增驾驶、对话、战斗或存档系统；不更改已有背景交通和其他工作中的修改。

## Acceptance Criteria
- 在潮汐之城真实游戏出生点附近出现一辆白色无桨 Roadster。
- 沿固定路线平滑往返，尾部水平喷气与底部托举喷气方向正确。
- 车顶与实体承托面一致，玩家能落到车顶、被带着移动、跳离；暂停时同步停止。
- 使用同一实体坐标插值绘制车与玩家，离开场景释放资源。
- 类型检查、全量测试、构建与浏览器视觉/实际站立验证完成。

## Constraints
沿用逻辑层不依赖 three/DOM 的边界，复用 Solid/supportId/carry 和视图注册表；不增加渲染结构断言测试。

## Decisions
- 使用 dev/core-dev 工作流与已启用的 Ponytail Full；只改本需求相关文件。
- 现有背景载具没有碰撞；此车必须作为真实实体，而非背景图片。
- 从潮汐之城接入：已有平坦可游玩的临水路线，便于可靠登车与验收。
- 实际入口已路由到 AI 住宅 2；同时接入该页面的透视玩家控制器，车从门口左侧向外巡航，避开主体建筑。
- 模拟世界沿用 Solid 承托；住宅采用同一车辆实体与飞行更新，车顶转换为 DefinitionPlatform，随动位移继续扫真实房屋轮廓。
- 渲染使用共享程序化三维模型；平坦车顶与逻辑高度/范围共用尺寸常量，尾推与底推单独动画。
- 探索、逻辑实现、模型实现使用子代理；两种玩家控制器均已跑定向测试。
- 独立审查通过，无必须修复的问题；透视弹体编号从载具最大编号之后分配，避免与车辆视图冲突。
- 浏览器从地面实际跳上车顶后，无输入随车从约 x=41 到 x=17，脚底持续贴顶；随后主动跳离成功。截图见 evidence/player-riding-roadster.png。

## Implementation Map
| File | Result |
|------|--------|
| src/config/flying-roadster.ts | 共用尺寸、巡航距离与停留时长 |
| src/entities/flying-roadster.ts、entity.ts | 中立载具实体与往返路径 |
| src/sim/sim-world.ts、app/game-app.ts | 固定步长运动与标准游戏装配 |
| src/render/flying-roadster-view.ts、app/scene-wiring.ts | 共享三维车体、喷气和视图释放 |
| src/app/perspective-player.ts、perspective-controls.ts、residence-app.ts | 实际 AI 住宅 2 入口的动态车顶承托与同步渲染 |
| test/entity-collision.test.ts、perspective-player.test.ts | 落顶、往返、跳离/下穿、停帧、障碍和实体编号 |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes，1976/1976 |
| npm run build | yes | yes，保留既有大 chunk 提示 |
| 浏览器查看车辆、运动和玩家站立/跳离 | yes | yes，实际入口 http://127.0.0.1:5175/?mode=game&level=harbor |
