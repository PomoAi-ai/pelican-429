# FIX -- 堡垒骑车入口与冷却液辨识度

## Status: done
## Task: 176
## Related: 175
## Baseline Commit: 3a35077

## Problem
主线入口骑车容易反复掉落；保留第一处危险缺口，后续用悬浮平台接通。冷却液过于透明。

## Root Cause
`src/config/facility-structure.ts` 的踏板在第一处缺口后仍留下两处缺口；`src/render/facility-coolant.ts` 液体透明度仅 0.28，液面也仅 0.42。

## Fix Plan
- [x] 延长第二块共享悬浮平台至两端相接，碰撞与外观共用配置。
- [x] 加深液体与液面，保留持续掉血和可见气泡。
- [x] 用骑车实际移动验证通过第一跳后可连续骑到对岸。

## Verification
- [x] 骑车通过回归用例先失败、后通过；章节测试 13/13 通过。
- [x] npm run typecheck
- [x] npm test：首跑 1699/1700 通过；唯一失败为世界生成性能用例 253.6ms 超出 250ms 阈值。构建完成后单独重跑 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts`，1/1 通过，未修改阈值或世界生成代码。
- [x] npm run build：通过；保留既有大分块警告。
- [x] 浏览器检查平台与冷却液：从 x=25 骑车向右抵达 x=40.06，HP 保持 100；第一缺口保留，后续踏板连续，池水深绿且气泡可见。临时 localhost 存档已恢复，用户 127.0.0.1 存档未修改。
- [x] Diff Guard 检查本次改动：仅共享平台配置、冷却液材质、既有路线行为用例；无新增防御代码或依赖。
