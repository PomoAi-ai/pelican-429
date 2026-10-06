# PLAN -- Boss 场战后恢复人形 NPC

## Status: blocked
## Task: 210
## Related: 204, 208
## Baseline Commit: 9a4faca

## Goal
Sam 和 Tibo 在 Boss 场战斗结束后原地变回人形友好 NPC，可交谈与活动。

## Acceptance Criteria
- 胜利或失败均结束敌对状态，当前 Boss 原地整体换成人形，不扫描、不缩放动画。
- 清理旧战斗弹道和攻击，NPC 使用现有居民系统，玩家恢复可移动与交谈。
- 再次点击头像可重新挑战，清理上一轮 NPC。
- 保留倒计时及胜败提示，预加载人形资产避免战后加载错误。

## Non-goals
不改主线剧情顺序、技能平衡，不生成新模型，不提交发布。

## Decisions
- 已追踪 Boss 清理、实体视图缓存、居民逻辑、对话和装配；逻辑子代理复核并实施，复用原有探索结论。
- 战后创建新 ID 的 wanderer 实体，确保旧 Boss 视图释放、切到共享人形 NPC 视图。
- 同一模拟帧致命伤害后、实体移除前结算，避免丢失原位置或生成掉落。
- 胜败后允许常规模拟；失败恢复玩家使之能交谈；对话居民列表支持战后新出现和新回合移除。
- 当前请求指向已有 Boss 测试场，主线剧情保持原有流程。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/sim/boss-arena.ts, src/sim/sim-world.ts | 战后转为NPC及结算时序 | yes |
| test/boss-arena.test.ts | 胜败转化、致命攻击、重开回归 | yes |
| src/app/game-app.ts | 人形预加载与对话接线 | yes |
| src/ui/npc-dialogue.ts | 对话列表跟随动态居民 | yes |
| src/ui/boss-arena-hud.ts | 战后可交谈提示 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | no |
| npm run build | yes | yes |
| 浏览器战后人形、对话与重开 | yes | yes |

## Results
- 实现和浏览器功能验收完成；由于必需全量检查存在无关性能项失败，跟踪状态保留 blocked，不宣称全量通过。
- npm run typecheck、npm run build、git diff --check 均通过；构建保留已有大 chunk / plugin timing 提示。
- npm test：1747/1748 通过，唯一失败为 test/worldgen.test.ts 世界生成中位耗时门槛 250ms（实测 585.3ms）。单独复测该文件 28/29 通过，耗时项 903.6ms，未改门槛或世界生成代码。
- 新战后用例先在旧实现复现失败，再通过；node --test test/boss-arena.test.ts test/free-world-npcs.test.ts：7/7 通过。覆盖 Sam/Tibo 胜/败、真实致命伤当帧转化、保留位置、无旧弹道/战斗组件、玩家可移动且不能伤害友好NPC、再次召唤。
- 独立审查无需修改发现；确认主线分支不受 Boss 场行为影响。
- 浏览器：Tibo 自然战斗结束后人形 NPC、交谈窗口、关闭对话并召唤 Sam 清旧居民、3秒倒计时、新战斗结束 Sam 人形巡游均通过；控制台无 error。evidence/tibo-dialogue.png、evidence/sam-human-npc.png。
- 验收使用临时静态预览避开共享开发服务热更新，最终入口保留在5174；无提交、推送或CI修改。
