# PLAN -- Boss 场与场景测试导航

## Status: done
## Task: 204
## Related: 193
## Baseline Commit: 3a35077

## Goal
新增正常横版游戏 Boss 场。玩家独自入场，顶部 Sam/Tibo 头像召唤，显示 3 秒倒计时后战斗；同步网站开发导航和资源目录。

## Non-goals
不改 Boss 技能数值、GLB 资产，不提交或发布。

## Acceptance Criteria
- 初始场内无 Boss；头像召唤单个 Boss，倒计时期间双方不能提前攻击。
- 使用真实玩家、Boss、技能、粒子及碰撞逻辑；可重新选择开始一轮。
- 胜败可见，重开清理旧弹道/冷却，菜单暂停不消耗倒计时。
- 场景展示改为场景测试，菜单与资源目录均有 Boss 场入口。

## Constraints
复用游戏资源；只在本地验证；保留已有工作区改动。

## Decisions
- 追加用户要求：Sam 平时手持实体短法杖，只有大招升至头顶并回手；普攻射源校准到杖尖，模型路由仍使用独立头顶模型投影。共享渲染同时作用于游戏与展示场。
- 独立审查发现普攻中获胜会遗留 attack 状态，已先用真实攻击回归复现，再调用既有 resolvePelicanState 修复；回归通过。
- 父代理已完整追踪导航、关卡加载、游戏装配、帧循环和模拟，无须重复探索；逻辑子代理核对设计并实现。
- 使用 level=boss-arena，复用 game-app，不新增运行模式。
- 默认场地可移动；召唤后双方冻结 3 秒，固定模拟推进。暂停自然冻结计时。
- 一次一位 Boss，重选重置整轮，胜败停止战斗等待再选。
- 导航资源目录本来由导航链接生成，添加同一入口即可同步。
- 无需用户补充的方案分歧或不可逆操作，直接实现。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/world/boss-arena.ts, src/app/game-level.ts | 固定可碰撞游戏场地与路由 | yes |
| src/sim/boss-arena.ts, src/sim/sim-world.ts | 召唤、倒计时、胜败重开 | yes |
| src/ui/boss-arena-hud.ts, src/ui/boss-arena.css | 顶部头像、血条、倒计时 | yes |
| src/app/game-app.ts | 游戏装配、资源预加载和 HUD | yes |
| index.html, src/main.ts, src/ui/dom-language.ts | 导航和目录同步 | yes |
| test/boss-arena.test.ts | 关键状态回归 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器实际进入、召唤、3秒倒计时、双方战斗、重开、导航 | yes | yes |

## Validation Results
- npm run typecheck：通过；首次发现降水枚举和 CSS 导入方式不符合项目约定，修正后通过。
- npm test：1743/1743 通过。之后新增胜利时攻击状态回归和手持法杖射源修改，对应 node --test test/boss-arena.test.ts test/boss.test.ts test/model-routing.test.ts：35/35 通过。
- npm run build：通过，保留已有大 chunk 和 plugin timing 提示。构建包含最终 Sam 法杖和回归修复。
- 独立逻辑/渲染子代理：真实 GLB 杖尖位置与弹道误差小于弹体半径；待机、移动、跳跃、小技能不升头顶，只有大招升降，双形态与变身通过。
- 浏览器：1280×720 实际空场、Sam/Tibo 召唤、3→2→1、设置暂停保留倒计时、双方真实扣血、失败后重新召唤、目录与场景测试菜单入口通过；截图在 evidence/。尝试窄屏工具未改变实际视口，因此未声称窄屏完成验收。
- 浏览器法杖：怪物大招升杖与归手、人形朝左持杖、变身、skill1 投影与持杖同时存在，通过。
- git diff --check：相关代码通过。没有提交、推送或修改 CI。
