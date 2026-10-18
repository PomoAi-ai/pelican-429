# PLAN -- 无人机宠物行为与柔光

## Status: done
## Task: 512
## Related: 510
## Baseline Commit: c292d188

## Goal
无人机在屏幕内宽松陪伴，随机地面闲逛与驻留，走远后追赶；各带轻度照明。
## Non-goals
不改家园工作指令与采集模拟，不引入通用行为树依赖。
## Decisions
- 复用前项任务的运动、采样和渲染探索结果，跳过重复探索。
- 按 Reynolds 的行为选择/转向/运动分层，wait/wander/follow 管目标，保留已有接地运动；子代理设计并实施。
- https://www.red3d.com/cwr/steer/gdc99/ ：参考 wander、arrival、containment。
- 活动半径根据当前投影与屏幕宽度计算，留边距；伙伴独立 seeded RNG。
- 无审批停止条件，直接实施；轻光使用无阴影短距离点光源。
## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/ui/drone-locomotion.ts | 宽松跟随、随机驻留、地形安全漫游 | yes |
| test/drone-locomotion.test.ts | 随机复现、边界和追赶回归 | yes |
| src/ui/game-hud.ts | 独立seed、可见范围接入 | yes |
| src/render/utility-drone.ts | 共享机体柔光 | yes |
| src/render/residence-lighting.ts | 保留移动点光真实漫反射 | yes |
| src/render/light-texture.ts | 轻光强度、范围与原灯槽优先级 | yes |
## Validation
- typecheck、全量测试、build
- 浏览器实际闲逛、间距、柔光
- 子代理审查

- 子代理运动实现11项回归通过；独立core-review + diff-guard通过。
- 住宅ShaderLib真实注入2/4灯槽自检通过。

- npm run typecheck、npm test（2003/2003）、npm run build 均通过，构建仅既有大chunk提示。
- 浏览器住宅2日夜、走远追赶/停留检查，pet-night.png；GPU渲染正常。视觉发现出生点同高筛选挤近，最后修正后补跑受影响测试。

- 最终出生点修正：12/12受影响行为测试通过；类型检查与构建再次通过。未重复全量（只有单模块初始化筛选修改）。

- 最终浏览器确认左右伙伴分开在附近不同高度安全地面，pet-spacing.png，无人机柔光照亮住宅设备；完成。
