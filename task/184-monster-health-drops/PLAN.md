# PLAN -- 怪物死亡掉落血包

## Status: blocked
## Task: 184
## Related: N/A
## Baseline Commit: 3a35077

## Goal
怪物死亡掉落血包，玩家触碰拾取后随机恢复 10–30 点生命值，并有可见的掉落物和绿色回血提示。

## Non-goals
不新增背包、商店、掉落稀有度、装备系统或存档格式。

## Acceptance Criteria
- 每个死亡怪物掉落一个血包，不重复掉落；友好 NPC 和训练假人不掉落。
- 回血量为 10–30 的整数，用现有确定性随机工具产生，同种子可复现。
- 两种玩家形态均可碰触拾取，回血不超上限，满血不消耗血包，死亡玩家不会被血包复活。
- 飞行怪掉落物受重力落地，水中复用浮力，药包可辨认，拾取后显示绿色加血数值。

## Constraints
保留既有工作区改动；分层和本地验证遵循 AGENTS.md，不提交推送。

## Decisions
- 按语义将用户“鞋包”理解为回血血包；每次死亡必掉，随机的是恢复量。
- 使用现有 Entity/ViewRegistry、物理移动和 HUD 飘字，不引入通用道具框架。
- 子代理独立探索逻辑、表现并直接实现；接口与方案明确，无需额外设计审批。
- 实现与实景验收完成；交付门禁仍有一项独立世界生成性能测试失败，不改动无关生成逻辑或放宽阈值。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/entities/entity.ts, src/entities/health-pack.ts | 血包实体与运动 | — | yes |
| 2 | src/sim/sim-world.ts | 死亡掉落与拾取回血 | 1 | yes |
| 3 | test/health-pack.test.ts | 掉落、回血、范围和确定性回归 | 2 | yes |
| 4 | src/render/health-pack-view.ts, src/app/scene-wiring.ts | 可见药包与工厂注册 | 1 | yes |
| 5 | src/core/game-events.ts, src/ui/hud.ts, index.html | 拾取事件和绿色回血飘字 | — | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/health-pack.test.ts | yes | yes，4/4 |
| npm run typecheck | yes | yes |
| npm test | yes | no，1717/1718；世界生成性能中位数 435.2ms 超过 250ms |
| npm run build | yes | yes，现有大 chunk 提示 |
| 浏览器检查掉落物与拾取显示 | yes | yes，实战击杀掉落 12 点血包；72 → 84 血、绿色 +12、血包消失，控制台无错误 |
| core-review + diff-guard | yes | yes，独立子代理审查通过 |

## Validation Notes
- 类型检查首次遇到机房测试的 20/22 字面量收窄错误；工作区该文件随后修正，重跑类型检查通过，本任务未修改该测试。
- 单独重跑 `node --test test/worldgen.test.ts`：28/29 通过，性能中位数 290.9ms，仍超过 250ms。该测试不执行血包逻辑，不继续扩大修改范围。
- 实景证据：`health-pack-drop.png`、`health-pack-heal.png`。测试使用独立临时浏览器标签页与真实游戏输入，未修改调试对象状态；验证后关闭该标签页。
- `git diff --check` 在本次涉及文件中通过。未提交、未推送。
