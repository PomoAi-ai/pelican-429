# PLAN -- 鹈鹕与主角双向变身

## Status: done
## Task: 113
## Related: N/A
## Baseline Commit: 无（仓库尚无提交；src/test 修改前副本位于 $TMPDIR/pelican-transform-baseline）

## Goal
实现鹈鹕与正式 Grassy 主角的双向变身，在游戏中可操作，并在角色展示场直接演示两个方向。

## Non-goals
不重新制作角色模型，不扩展完整的人形四技能战斗系统，不修改光子轮子与爆裂效果，不提交或推送。

## Acceptance Criteria
- F 可双向切换同一玩家，血量与技能冷却连续；暂停、重播、死亡和传送不会残留变身。
- 羽毛螺旋收拢遮住模型，在羽茧最密处换形，再展开显现；不显示人脸与鸟喙混合形态。
- 人形复用正式 Grassy 模型与移动、骑行、飞行动画；展示场复用游戏视图与模拟逻辑。
- 展示场有两个方向的自动演示、暂停和手动变身入口。
- 必需的逻辑行为验证、类型检查、全量测试、构建和浏览器视觉验收完成。

## Constraints
- 沿用二维模拟、three 表现分层；vendor 不修改。
- 不增加渲染细节测试，不加入依赖，不改共享模型材质。

## Decisions
- 逻辑和渲染探索由两个子代理完成：保留玩家实体 id/kind，形态是运动状态之外的独立状态。
- 正式 Grassy 资源在场景启动时预载；单实例释放不清共享资源缓存。
- 动画沿用已有羽化概念：白羽与青色流光遮挡，避免几何硬切和怪异混合脸。
- 本次人形复用公共移动物理，身体普通攻击接入已有近战判定与键盘动作；光子技能共用，鸟类身体技能仅鹈鹕施放。
- 架构子代理确认：72 tick 变身、第 36 tick 切形态；正式人形保持 3.1 格，切换时同步碰撞高度，起手与中点检查头顶及实体空间。
- 变身状态推进放在 sim 层，以复用传送的空间检查；控制器负责缓冲与动作屏蔽，保留重力和碰撞。
- game-app、showcase-app、facility-app 在已有异步启动入口预载正式主角，共享同步场景工厂；缓存最后释放。
- 需求明确且全部为本地可回退改动，无需设计审批，已进入实现。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/player-form.ts | 共享形态类型与变身时间轴 | — | yes |
| 2 | src/entities/entity.ts、pelican-controller.ts、src/sim/player-transform.ts、player-space.ts | 状态机、输入缓冲、动作互斥、形态攻击映射与空间检查 | 1 | yes |
| 3 | src/config/keybindings.ts、src/input/action-map.ts | F 输入 | 1 | yes |
| 4 | src/sim/player-teleport.ts、sim-world.ts | 传送和死亡中断 | 2 | yes |
| 5 | src/render/player-view.ts、player-transform.ts、grassy/grassy-rig.ts | 共用玩家视图、正式人形动作、羽茧变身 | 1,2 | yes |
| 6 | src/app/scene-wiring.ts、game-app.ts、showcase-app.ts、facility-app.ts | 共享视图接线与资源生命周期 | 5 | yes |
| 7 | src/config/showcase.ts、src/app/showcase/pelican.ts、src/ui/hud.ts 等 | 双向展示入口与操作说明 | 2,5 | yes |
| 8 | test/player-transform.test.ts、test/core.test.ts | 公开接口行为验证 | 2,3,4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | passed |
| npm test | yes | 1556/1557；唯一失败的 worldgen 文件单独复跑 29/29 通过 |
| npm run build | yes | passed |
| 浏览器双向变身、暂停、正式双卡并排显示并保存截图 | yes | passed |
| 子代理审查与 diff-guard | yes | passed |

## Validation notes
- 变身相关公开行为与既有控制器/武器/传送/架构检查：235 项通过。
- 子代理审查通过；已修复羽毛 InstancedMesh 缓冲释放遗漏。
- 双卡浏览器验收发现主角共享材质被两个世界光照重复注入；createGrassyRig 现为每个实例克隆材质并按生命周期释放，模型几何和贴图仍共享。修复后双卡与并行固定帧控制台均无渲染错误。
- `evidence/transformation.png`：两个正式展示场实例同时渲染的原形、羽茧中点、新形态六帧。`evidence/showcase.png`：正式展示场双卡暂停画面。
- 验证期间并行敌人迁移曾导致旧 maintenanceBot 导入失败；迁移完成后类型检查和构建已通过。
- 迁移完成后的完整测试在并行构建和浏览器渲染负载下 1556/1557 通过，唯一失败是世界生成耗时阈值（中位数 457.4ms）；停止额外预览负载后复跑，不修改断言。
- 最新完整测试：1556/1557 通过，世界生成中位数 416.9ms 超过 250ms；随后单独执行 `node --test test/worldgen.test.ts`，29/29 通过，耗时检查亦通过。未修改测试或性能阈值。
- 游戏入口实测完成：F 变为主角、移动/普攻、F 变回鹈鹕；普通攻击、技能可用状态和形态 HUD 正确切换，浏览器无错误。截图 `evidence/game-human.png`。
- 临时验收 HTML 与浏览器标签已清理。
- 最终 `npm run typecheck` 与 `npm run build` 均通过；构建保留现有大分块提示，没有构建错误。
