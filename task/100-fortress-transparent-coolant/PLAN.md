# PLAN -- 堡垒底部透明冷却液

## Status: blocked
## Task: 100
## Related: 097-fortress-coolant-chasm, 099
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-coolant-fill-before

## Goal
堡垒主路下方空区与悬崖冷却池连成一片，冷却液透明，可以透视后方支架和管道。

## Non-goals
不改普通水体、其他章节或角色技能。

## Acceptance Criteria
- 冷却液覆盖 x22～168、y2～18，主路和跳台 y20 保留净空。
- 水体透明、有柔和波纹与气泡，模型、致死范围及小地图一致。
- 悬崖跳台和石拱桥位置不随冷却池扩宽改变；上层平台保持下穿。

## Constraints
复用共享场景生成函数，低成本透明混合和实例化气泡，不加渲染依赖或视觉细节测试。

## Decisions
- 复用已有冷却液渲染、致死/重生流程；历史探索已覆盖调用链，子代理复核配置与地形耦合并实现逻辑侧，主代理处理材质和浏览器。
- 液面位于主路下方 2 格，填满下层空区；原底部安全步行区域改为致命液池，这是需求导致的行为变化。
- 现有可回退实现无审批停止条件。
- 子代理确认逻辑无须新增死亡分支；冷却液改为独立范围，原悬崖边界和池底保留。先验证旧范围无法使 x45 下穿死亡，再确认实现后相关 25 项测试通过。
- 实现及浏览器验收完成；整仓类型检查被本任务未修改的 Grassy 动画接口不一致阻塞，复查仍有 6 处错误（grassy-animator.ts / grassy-flight-pose.ts 缺失 GrassyFlight/GrassyFlightState 导出与参数不一致）。不扩大范围修改其他进行中的工作。日志 $TMPDIR/pelican-coolant-fill-typecheck-final.log。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/facility-structure.ts | 液池范围与悬崖边界分离 | — | Yes |
| 2 | src/world/facility-level.ts | 地形和致死范围同步 | 1 | Yes |
| 3 | src/render/facility-coolant.ts | 透明液体、横贯底部的波纹与气泡 | 1 | Yes |
| 4 | src/render/facility-approach.ts | 石桥使用独立悬崖右边界 | 1 | Yes |
| 5 | src/ui/facility-minimap.ts | 液池范围及地图标注同步 | 1 | Yes |
| 6 | src/ui/facility-chapter-hud.ts | 悬崖危险提示保持在跳跃入口 | 1 | Yes |
| 7 | test/facility-chapter.test.ts、test/facility-level.test.ts | 验证下层触液死亡、重生、跳台和上层平台行为 | 1、2 | Yes |
| 8 | README.md | 记录透明冷却液与底部通行变化 | 1、2 | Yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | No：Grassy 动画模块 6 处无关错误 |
| npm test -- --test-concurrency=4 | yes | Yes：1527 全通过 |
| npm run build | yes | Yes：已有 bundle 大小提示 |
| 浏览器透明效果及地图检查 | yes | Yes：底部液池透明、支架可见、危险范围贯穿底部，控制台无 error/warn |
| 子代理审查任务 diff | yes | Yes：Approved，无阻断发现 |

## Artifacts
- output/chapters/fortress-transparent-coolant.jpg
- output/chapters/fortress-transparent-coolant-map.jpg
