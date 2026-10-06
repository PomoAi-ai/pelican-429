# FIX -- 附近血包补给上限

## Status: done
## Task: 237
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
附近血包已足够回满两次生命时仍持续掉落。

## Root Cause
src/sim/sim-world.ts 的 Boss 受击与普通怪物死亡分支直接生成血包，没有统计附近补给。

## Fix Plan
- [x] 两种来源复用掉落函数，以掉落点为中心统计半径 20 格内未移除血包的回血量。
- [x] 总量达到玩家最大生命值两倍时停止新增；低于阈值仍按原有概率掉落，允许最后一个血包略超阈值。
- [x] 增加真实模拟回归用例，覆盖两种来源、阈值上下、远处与已移除补给。移除上限判断会导致用例失败；修改前已复现失败。

## Verification
- [x] node --test test/health-pack.test.ts：6 项通过。
- [x] npm run typecheck：通过。
- [x] npm test：1766 项通过，0 失败。
- [x] npm run build：通过，有资源分块超过 500 kB 的提示。
- [x] diff-guard：本次变更无额外防御校验、静默兜底或实现细节测试。
- [x] Bug is fixed
