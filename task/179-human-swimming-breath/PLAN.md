# PLAN -- 人形游泳脱困与氧气溺水

## Status: done
## Task: 179
## Related: N/A
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Goal
修复人形落入栈桥下只能下沉、无法上浮或跳出的死路；增加入水气泡氧气条、缺氧扣血与死亡重生。

## Non-goals
不更改世界地形，不增加新模型或重做角色资源，不修改其他正在开发的功能。

## Acceptance Criteria
- 人形能水平游动、按住跳跃上浮、水面重新按跳跃跃出并站上单向栈桥；松开后仍下沉。
- 头部在水下耗氧，露出水面恢复；氧气耗尽后扣血并进入现有死亡重生流程。
- 变身不刷氧气，命中停顿和战斗无敌帧不阻止溺水，重生恢复氧气。
- 入水显示气泡条，缺氧有明显提示，离水回满后隐藏，中英文与移动布局可用。

## Constraints
保留工作区已有改动；逻辑分层、确定性与本地测试规则遵循 AGENTS.md；不提交、不推送。

## Decisions
- 根因在 pelican-controller 的水中跳跃分支：只允许鹈鹕调用 waterJump，同时人形无浮力，导致水底无法离开。
- 扩展为跨层功能后采用 dev 工作流；已有探索覆盖控制器与物理，子代理独立完成移动、氧气、HUD 的详细探索和实现。
- 复用水中受力、水中跳跃、生命值与重生流程；15 秒氧气、露头 3 秒补满、缺氧每秒 20 生命值。
- 设计无需要用户决定的分歧、迁移或外部副作用，直接实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/entities/pelican-controller.ts | 持续划水、脱离水面 | — | yes |
| 2 | test/swim.test.ts | 复现并保护水底上浮和栈桥脱困 | 1 | yes |
| 3 | src/config/player-form.ts, src/entities/entity.ts | 氧气参数与状态初始化 | — | yes |
| 4 | src/sim/player-breath.ts, src/sim/sim-world.ts | 氧气、溺水扣血和重生衔接 | 3 | yes |
| 5 | test/player-breath.test.ts | 耗氧、恢复、变身和死亡回归 | 4 | yes |
| 6 | src/ui/hud.ts, index.html, src/ui/control-surface.css | 气泡条和操作说明 | 3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| node --test test/swim.test.ts test/player-breath.test.ts | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | 1707/1708；唯一旧文案断言移除后，受影响的 29 项重跑通过 |
| npm run build | yes | yes |
| 浏览器检查气泡条、泳动和界面 | yes | yes |
| core-review + diff-guard 仅审查本次增量 | yes | yes |

## Results
- 修改前新增人形上浮与栈桥脱困回归失败；修复后 swim 21 项通过。
- 氧气定向覆盖自然浮起、真实水面、满氧耗尽、变身、无敌帧、停帧、死亡与重生；与变身、机房环境伤害、分层检查合计 50 项通过。
- npm run typecheck 通过；npm run build 通过（452 modules，原有大包体积提示）。
- npm test 执行一次：1708 项中 1707 项通过；唯一失败是旧“水中操作”文案的字面值断言。按 AGENTS.md 移除这条低价值文案断言，保留同一用例的冷却行为和边界断言。随后执行 node --test test/render-camera-hud.test.ts test/swim.test.ts test/player-breath.test.ts，29/29 通过。未重复全量。
- 独立子代理 core-review + diff-guard 结论 Approved；实测双形态从满氧 900 tick 到首次伤害、1200 tick 进入重生。最终 diff --check 通过。
- 浏览器使用实际种子 392740869 的渔屋栈桥，通过键盘事件完成下穿、上浮、再次跳跃落桥；确认氧气 70.4% → 0%，缺氧扣血时 HP 71/100，随后上浮返回桥面并恢复氧气。横屏窄视口检查氧气条未与既有状态条重叠，已恢复默认视口。
- 证据：water-oxygen.png、drowning.png、pier-exit.png。没有新增模型/动作资源，没有提交或推送。
