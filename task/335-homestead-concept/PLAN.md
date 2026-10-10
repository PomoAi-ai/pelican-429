# PLAN -- 家园概念版本（阶段 1）

## Status: implementing (M1–M3 done, M4 试玩调参中)
## Task: 335
## Baseline Commit: 975f136

## Goal
按 `docs/economy.md` 第 17 节实现概念版本：电力 → 算力 → 机器人劳动 → 建设与 Token，验证核心循环和昼夜节奏。

## Non-goals
季节、天气对玩法的影响、食物、装备、护盾、其他电站和储能、污染、鹈鹕玩法、卖给 NPC；不改主线与现有自由世界。

## Acceptance Criteria
- 独立入口 `?mode=homestead`（`&reset=1` 清档重开），复用自由世界地形、渔屋、敌人、Tibo、光子和人形战斗。
- 时钟、供电（满足不了的用电方跳过）、算力分配（生产优先 / 收益优先）、天亮结算与首日补助、睡觉七成。
- Lv1/Lv2 无人机：标记、采集、搬运、卸货、充电、遇怪撤回、只在已清场区域工作，不可达目标给出原因。
- 太阳能板按瓦片格子铺、仓库扩容；商店终端；本地存档。
- 新玩家 30 分钟内走完首次采集、建造、夜晚、结算、购买。

## Decisions
- dev 工作流技能在本环境不可用，按其阶段手工推进，用本文件跟踪。
- 经济时间用整数游戏秒：1 个模拟 tick = 1 游戏秒，昼夜边界与睡觉结算没有浮点误差。
- 睡觉用 15 游戏分钟粗步长跑同一套逻辑，Token 和机器人产出乘 0.7。
- 第 19 节三项待选按推荐默认：大招每次充满 1 电·时（白天只用太阳能富余，夜里才用储能）；第 2 组蓄电池 80M；指挥模式 Tab，用透明遮罩接住鼠标避免误触普攻。
- 停在坞里的机器人不占算力，算力只分给离坞干活的机器人。
- 太阳能板（用户确认）：按瓦片格子放，一块占一格、下面要有实心砖，地面/屋顶/台子都能放；每格木 10、发电 1，开局 4 格（总量与原来 2 块 × 2 相同）。不进瓦片地图、没有碰撞。
- 施工点只要无人机飞到旁边 liftCap 以内就能施工；挖地块要正好露在最上面。
- 地块保护只覆盖小屋两侧、落地设施脚下和太阳能板下面一格。
- 指挥模式下用红色半透明带标出附近还没清场的区域。

## Implementation Map
| Milestone | Files | Done |
|---|---|---|
| M1 逻辑底座 | src/config/homestead.ts（接入 validateTuning）、src/sim/homestead-economy.ts | yes |
| M2 无人机 | src/sim/homestead.ts、src/sim/homestead-terrain.ts、src/sim/photon-system.ts（大招电量）、src/sim/sim-world.ts（每 tick 推进） | yes |
| M3 模式装配 | src/config/app-mode.ts、src/main.ts、src/app/game-app.ts、src/app/homestead-app.ts、src/app/homestead-save.ts、src/render/homestead-view.ts、src/render/tree-view.ts（removeTree）、src/ui/homestead-hud.ts、src/ui/homestead.css、index.html | yes |
| M4 调参与验收 | 配置调参、浏览器试玩 | in progress |

## Known gaps
- 夜里只降了渲染曝光，远景天空是图片，夜色不够暗。
- 界面只有中文；手机布局没有单独适配。
- 砍树后光柱、光照贴图、雨滴仍按原树位置，没有重建。
- 设施是程序化占位，无人机 GLB 未到。
- 外观上的小灌木是装饰，不能采集。

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | 通过 |
| node --test test/homestead-economy.test.ts test/homestead.test.ts | yes | 14/14 |
| npm test | yes | 1830/1830 |
| npm run build | yes | 通过 |
| 浏览器试玩 | yes | 砍树、挖地块、格子太阳能板放置与施工已在浏览器验证；完整 30 分钟流程待人工试玩 |
