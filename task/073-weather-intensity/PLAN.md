# PLAN -- 多龙卷风与天气强度条

## Status: done
## Task: 073
## Related: 067
## Baseline Commit: 无 HEAD；基线 $TMPDIR/pelican-storm-baseline

## Goal
独立调节龙卷风、狂风、雨、雪的连续强度，支持多龙卷风，高强度明显提升视觉密度、运动与角色受力。

## Non-goals
不修改其他并行任务，不提交推送，不新增依赖。

## Acceptance Criteria
- 四种天气各有强度条，可叠加且保存、URL加载。
- 龙卷风数量可调，所有风柱共享实际模拟状态。
- 高强度提升效果而不只改标签，关闭和零强度无作用。
- 维持碰撞、暂停、确定性。

## Decisions
- 保留天气模式和雨雪档位，新增0–5倍强度条与1–6个龙卷风数量条。
- 沿用既有天气模块，不另建天气系统。
- 默认龙卷风为3柱、2倍。新增风柱与既有风柱共用确定性模拟，增减数量保留已有状态。
- 浏览器实际操作龙卷强度5倍、数量6个，滑条正确显示；与3倍雨雪共存，角色已在空中。截图：$TMPDIR/pelican-storm-preview.jpg。
- 独立审查通过。类型检查修复新增测试断言导致的静态收窄后通过；全量测试1520项全部通过；构建通过，仅保留体积提示。未提交或推送。

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |

- explorer 已完成最小接入设计：wind最终场倍率、独立雨雪倍率、多风柱数组，共用尺寸；没有需暂停批准的分歧。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| config/game-settings、ui/settings-model、ui/settings-panel、index.html | 数值边界与滑条 | yes |
| app/game-app、app/settings-wiring | 设置和启动接线 | yes |
| world/wind、world/tornado、sim/environment、sim/sim-world | 强度与多风柱物理 | yes |
| render天气模块、app/precip-wiring | 放大视觉与扩池 | yes |
| 对应主题测试 | 倍率、数量和持久化行为 | yes |
