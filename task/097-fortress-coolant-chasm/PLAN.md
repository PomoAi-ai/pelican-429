# PLAN -- 堡垒冷却液断崖

## Status: done
## Task: 097
## Related: 096
## Baseline Commit: 无 HEAD，改前快照 $TMPDIR/pelican-coolant-chasm-before

## Goal
将堡垒入口的连续石桥改成可跳过的断崖，底部有冒泡冷却液，落入死亡；用悬空踏台控制跳跃距离。

## Acceptance Criteria
- 断崖有真实缺口，两块可下穿踏台与可见模型相符，短距离跑跳可穿越。
- 冷却液持续冒泡，液面与致死范围相符，提示危险；普通水和其他场景保持原行为。
- 接触冷却液死亡，输入不能在死亡期间逃脱，短暂停留后回起点继续探索。
- 游戏/独立预览共享模型，小地图显示缺口、踏台与危险池。

## Decisions
- 延续 dev 工作流；子代理探索死亡/重置和实际跳跃距离，另一个子代理制作断桥/液体视图。
- 复用既有地图与粒子实例机制，冷却液作为固定危险池单独表示，不作为普通可游泳格子水。
- 外围总跨度16格，两踏台为 [24,29)、[31,36)，三个缺口各2格，保留普通方块深度与平台下穿。实测普通走跳约2.3格，3格缺口会落崖；最终三跳通过且不消耗飞行能量。
- 自动回到出生点以保持当前自由探索能继续，无敌人或通关限制。
- 液面最终设在 y15（踏台下5格），确保默认镜头在岸边就看得到池面和气泡；危险矩形同步采用同一配置。
- 触液判定先于输入/hitstop并在移动后再次执行；死亡期间72 tick冻结动作，再复用实体工厂重建玩家组件，保留玩家身份。
- 原堡垒连续步行测试的前提已被用户明确修改：保留从对岸x38到出口的安全通路测试，新增实际三次普通跳跃通过断崖与触液死亡/重复重生测试。
- 子代理审查 Approved；新增逻辑按公开 stepSim 验证，不添加渲染实现细节测试。

## Implementation Map
| File | Intent | Done |
|------|--------|------|
| config/facility-structure.ts, config/facility-scenes.ts, world/facility-level.ts | 共享危险池和跳跃踏台布局 | yes |
| world/level.ts, sim/sim-world.ts | 接触死亡与重生状态 | yes |
| render/facility-approach.ts, render/facility-coolant.ts | 断桥与冒泡冷却液 | yes |
| ui/facility-chapter-hud.ts, ui/facility-chapter.css, app/frame-loop.ts, ui/facility-minimap.ts | 危险提示/死亡提示/地图 | yes |
| test/facility-level.test.ts, test/facility-chapter.test.ts | 缺口、真实跳跃、死亡和重生行为 | yes |
| README.md | 场景操作说明 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes；最终调整后通过 |
| npm test -- --test-concurrency=4 | yes | yes；1538 tests / 305 suites 全通过；液面调整后相关24例通过 |
| npm run build | yes | yes；最终调整后通过，既有大包提示 |
| 浏览器断崖、冒泡、死亡和重生验收 | yes | yes；真实方向键走落断崖，捕获死亡提示，松键后回入口继续，console无错误/警告 |
| 子代理审查 | yes | yes；Approved |

截图：output/chapters/fortress-coolant-chasm.jpg、output/chapters/fortress-coolant-death.jpg。
