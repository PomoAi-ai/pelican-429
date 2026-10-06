# FIX -- 玩家脱战自动回血

## Status: done
## Task: 187
## Related: 184-monster-health-drops
## Baseline Commit: 3a35077

## Problem
玩家脱离战斗后，每秒恢复 0.7 点生命。

## Root Cause
`src/sim/sim-world.ts` 目前只结算伤害与血包回血，没有脱战恢复。

## Fix Plan
- [x] 复用敌人追击、Boss、玩家出招和弹体状态判定战斗；连续脱战每满一秒恢复 0.7，满血停止、死亡禁止。
- [x] 受伤、hitstop 和死亡清除计时，避免溺水或冷却液伤害被回血抵消；不发送每秒飘字。
- [x] 在既有 combat 测试中通过真实 stepSim 验证节奏、上限、战斗中断及环境伤害。

## Verification
- [x] `node --test test/combat.test.ts test/health-pack.test.ts test/player-breath.test.ts`：33/33 通过；新增三例先失败后通过。
- [x] `npm run typecheck`：通过。
- [x] `npm test`：运行 1722 条，首次 1716 通过；5 条旧测试需要允许新脱战回血，1 条世界生成性能超限。同步旧断言后，`node --test test/enemy.test.ts test/facility-chapter.test.ts test/player-transform.test.ts test/combat.test.ts` 105/105 通过；世界生成耗时用例单独重跑通过。未重复运行已通过的其余测试。
- [x] `npm run build`：通过，已有 chunk 大小和插件耗时提示。
- [x] diff-guard：独立子代理审查通过；相关文件 `git diff --check` 通过。

## Decisions
- 同会话子代理只读探索了所有战斗路径，复用既有组件，不引入通用战斗状态机或新的恢复配置。
- “1秒恢复0.7”按每连续一秒脱战结算一次处理，不额外增加三秒等等待。
- 旧炸弹与铝热剂测试继续校验首次准确扣血和重复伤害事件；允许脱战后的生命恢复。冷却液离开第 60 tick 应回血，变身与未变身的等时对照比较生命，保证不会重置计时。
- 新测试的无效 `attackHeld` 字段由类型检查发现后移除，连续 `attackPressed` 已覆盖出招；复查类型通过。最终补强炸弹命中当帧伤害断言后，对应单例重跑通过。
- 独立子代理对实现和五条旧断言更新的两次审查均通过。未修改渲染或 UI，不额外执行浏览器视觉验收；未提交、未推送。
