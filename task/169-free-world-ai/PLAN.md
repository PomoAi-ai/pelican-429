# PLAN -- 自由世界 AI 地形判断

## Status: done
## Task: 169
## Related: 157
## Baseline Commit: 3a35077

## Goal
修复自由世界敌人在真实地形中的隔墙攻击、盲目扑坑/入水与脱战无法下平台回家。

## Non-goals
重写完整寻路系统、增加伤害和敌人数量、改变 Sam/Tibo 的普通对白 NPC 定位。

## Acceptance Criteria
- 实体墙阻挡自动出招与近战伤害；单向平台保留可见性与上下追击。
- 地面追击与扑冲/下平台检查落脚、水域和冷却池，危险落点不释放；释放前再次检查地形变化。
- 平台移动使用追击或返驻地的实际目标；脱战后能从上层平台回家。
- 同主题真实模拟回归测试先复现失败，修复后通过；已有战斗压力和动作行为保留。

## Decisions
- explorer 已通过内存场景复现：搬山隔墙将 HP100→72、巡线犬扑冲跌落深坑、欧米脱战240帧仍停在驻地上方平台。
- 已有上下平台/绕矮墙/感知滞回，无需重复建立全图导航。针对攻击可见性和安全移动增加小型物理查询。
- 本轮保留敌人警戒范围（可感知附近动静）；实体遮挡时不能出招或隔墙造成近战伤害，避免破坏既有绕障追击。
- 本轮规模与文件级设计已完整，跳过重复架构代理。无须用户设计批准的停止条件。
- 新增4个真实模拟回归先全部失败，覆盖隔墙攻击、积水/冷却液、扑冲深坑与脱战下平台；根代理负责物理遮挡和模拟装配，explore_world负责敌人行为，toolbar负责只读审查。
- 审查复现低墙上方身体中心可见但低扫仍穿墙，伤害遮挡改用实际攻击与受击框重叠的高度；感知仍使用身体中心。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/physics/line-of-sight.ts | 尊重实体形状的共享遮挡查询 | — | yes |
| 2 | src/entities/enemy.ts | 起手视线、安全动作和回家下平台 | 1 | yes |
| 3 | src/entities/enemy-navigation.ts | 安全步进与扑冲落点预测 | — | yes |
| 4 | src/sim/sim-world.ts | 注入地形水域上下文、近战遮挡过滤 | 1,2 | yes |
| 5 | test/enemy.test.ts | 真实地形行为回归与接口更新 | 2,4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/enemy.test.ts | yes | yes（最终57/57） |
| node --test test/line-of-sight.test.ts | yes | yes（3/3，含擦角与边界双向一致） |
| npm run typecheck | yes | yes（最终修复后通过） |
| npm test | yes | yes（1685/1685；最后局部修复由57项定向覆盖） |
| npm run build | yes | yes（447模块，7.11秒） |
| 同线程代码审查 | yes | yes（低扫、DDA边界、返家跳台速度3项均修复并回归） |
