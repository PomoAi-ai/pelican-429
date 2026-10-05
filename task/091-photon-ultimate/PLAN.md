# PLAN -- 光子大招

## Status: validating
## Task: 091
## Related: N/A
## Baseline Commit: 无 HEAD；仓库文件全部未跟踪

## Goal
让鹈鹕召唤光子聚光蓄势，随后从四面八方发出绚丽光束攻击附近敌人。

## Non-goals
不替换四种嘴囊武器；不修改 vendor；不加入新依赖；不提交推送。

## Acceptance Criteria
- 独立按键 E 触发，冷却期间不能重复释放；操作提示与冷却状态可见。
- 光子聚光后产生全方向光束与粒子冲击，普通和高画质均能辨认；暂停时冻结。
- 固定步长内按圆形范围对左右及上下敌人结算一次伤害，不伤自己；音画与伤害时点对应。
- 游戏与展示场复用同一光子模型和大招特效。

## Constraints
- 逻辑层不依赖 three/DOM/实时钟/随机数；渲染层不决定伤害。
- 保持现有武器槽与按键；渲染动画靠浏览器验收。

## Decisions
- E 为独立大招键，不挤占数字键 1–4。
- 先聚光 0.45 秒，再爆发全方向光束；半径 12 格，伤害 30，冷却 12 秒。固定步长为 60Hz。
- 新大招事件驱动光子共享特效；不把光子变成实体。
- 无不可回退或仓库外变更，直接实现。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | 输入/模拟/战斗相关模块 | 键位、冷却、蓄势、径向伤害与事件 | — | yes |
| 2 | 光子共享渲染和展示场 | 聚光、光束、粒子、冲击波和预览 | 1 | yes |
| 3 | 游戏 HUD/帧循环 | 冷却提示、事件接线 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | blocked：并行序章改动引用未定义的 `counterpoint`，报错均在 intro 文件 |
| node --test --test-concurrency=4 'test/**/*.test.ts' | yes | 1535/1535 通过 |
| npm run build | yes | 通过 |
| 浏览器检查游戏和展示场 | yes | E 键触发、HUD 倒计时、假人掉血；光束、光圈和核心可见，背景正常 |
