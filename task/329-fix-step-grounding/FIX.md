# FIX -- 一格台阶悬浮与停步稳定性

## Status: done
## Task: 329
## Related: N/A
## Baseline Commit: 53b8be3b86c1949c60a2c6d8e6c2735f2aa82c28

## Problem
角色上下一格台阶时，不能用持续悬浮替代抖动；停步必须有真实地面支撑。

## Root Cause
`src/physics/tile-collision.ts:84` 的 `stepRampSupport` 在台阶外侧生成不可见的斜坡，水平移动提前抬升，竖直碰撞持续承托。实际地形没有该坡面；显示层的斜坡下沉补偿最多 0.28 格，无法消除悬浮。

## Fix Plan
- [x] 共享碰撞恢复真实砖面踏阶，删除虚拟坡面与对应支撑分支。
- [x] 显示层仅短暂平滑踏阶高度变化，最多 120ms 归零，不改变物理支撑；整砖台阶边不再使用斜坡下沉。
- [x] 物理回归覆盖双向踏阶、停步与下落；替换原先要求空气坡停步的断言。

## Verification
- [x] 先运行新增回归，旧实现失败：未接触台阶时脚底高度 1.4，真实地面为 1。
- [x] `node --test test/physics-slopes.test.ts test/swim.test.ts test/render-fish.test.ts`：59 项通过。
- [x] `npm run typecheck`：通过。
- [x] `npm test`：1812 项中 1811 项通过；唯一失败是未涉及的世界生成性能用例（中位数 386.5ms）。单独运行 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 通过，未修改其代码或断言。
- [x] `npm run build`：通过，保留原有大 chunk 提示。
- [x] 浏览器临时夹具直接复用游戏模型、地形与碰撞：台阶前 x=7.33 时脚底高度 1；上阶显示高度单调由 1 到 2；下阶按重力连续下降至 1，停步稳定。
- [x] core-review / diff-guard 子代理复核通过；本次四个代码与测试文件 `git diff --check` 通过。
