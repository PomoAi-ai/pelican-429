# PLAN -- 主线完整进度自动存档

## Status: complete
## Task: 164
## Related: 140, 159
## Baseline Commit: 3a35077

## Goal
从“进入游戏”返回主线时继续已有进度，刷新不再重开当前阶段战斗。

## Decisions
- 定位发现story-save只保存阶段，game-app即使每秒调用persist也仅在阶段/倒计时变化时写入，位置和敌人状态从未保存。
- 修复涉及纯逻辑快照、localStorage校验、装配与入口提示，采用dev工作流扩展实现；子代理探索并实现快照，主代理接线及存储校验。
- 保留version1原检查点，在同一记录增加可选progress快照，旧记录无需迁移或清空。用户已明确要求浏览器存档，无外部操作。
- 只保存稳定进度，不保存进行中的弹体/攻击动画；死亡中恢复按已有检查点复活规则，不能生成零血死档。
- 主线按秒与阶段变化自动保存，切后台/pagehide补存；结局选择自由世界后不得被离页保存覆盖回堡垒。
- 首页有记录显示继续游戏；无需重做游戏界面。
- 离页回调先补存再清理，避免清理操作移除保存监听器；同归于尽时导出已击败Boss后的检查点，保留胜利。

## Acceptance Criteria
- 主线位置/生命/形态/骑乘和武器资源可恢复。
- 已清敌人不重新出现，存活敌人与Boss生命/位置恢复，治疗额度不能刷新重置。
- 阶段/倒计时/通关目的地保存正确，死亡中存档不会复活为死状态。
- 旧阶段存档可用，非法快照明确报错，写入失败不显示假成功。

## Implementation Map
| Files | Intent | Done |
|---|---|---|
| sim/mainline-progress.ts, mainline.ts + tests | 捕获/恢复稳定进度，保存同归于尽胜利 | yes |
| app/story-save.ts + tests | 浏览器边界校验与序列化 | yes |
| app/game-app.ts, main.ts, ui/story-hud.ts, ui/homepage-language.ts | 自动存档/继续入口/真实提示 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes，最终修改后通过 |
| npm test | yes | yes，1661/1661通过；最终同归于尽修复后定向10/10通过 |
| npm run build | yes | yes，最终修改后通过，仅体积/耗时提示 |
| 浏览器刷新前后恢复抽查 | yes | yes，48HP/剩余4守卫刷新保留、首页继续入口、自由世界结局跳转记录保留 |

- `node --test test/story-save.test.ts`：3/3通过，包括高于地图顶端的飞行存档。
- `node --test test/mainline-progress.test.ts test/mainline.test.ts`：10/10通过，包括真实双向攻击同帧死亡。
- 子代理只读复核20次行走/跳跃/飞行/变形存档往返通过；发现的离页顺序和同归于尽问题均修复。
- `git diff --check -- src test task/164-mainline-progress-save`通过。浏览器在localhost隔离验证，已还原测试存储并关闭临时页。
