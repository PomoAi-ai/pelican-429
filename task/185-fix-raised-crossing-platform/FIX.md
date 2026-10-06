# FIX -- 缺口上方两格悬浮平台

## Status: done
## Task: 185
## Related: 176
## Baseline Commit: 3a35077

## Problem
入口第二段应保留下方缺口，在其上方约两格设置悬浮平台，而非与两侧铺成同高的连续桥。

## Root Cause
共享 steppingStones 配置把第二段 y 设置为 20，与两侧地面相同。

## Fix Plan
- [x] 第二段平台由 y=20 抬至 y=22，保留 x=29..38 覆盖范围；渲染与碰撞共用配置。
- [x] 骑车通过普通跳跃落到高台并抵达对岸。
- [x] 分层守卫断言限定机房内部楼层，入口辅助跳台不作为新增战斗层。

## Verification
- [x] 关卡路线行为回归：修改前高台落地断言失败；修改后两个关卡测试文件共 29 项通过。
- [x] npm run typecheck
- [x] npm test：1717/1718 通过，唯一失败为世界生成性能中位数 410.9ms 超过 250ms；构建结束后独立运行 node --test test/worldgen.test.ts，29/29 通过（含该性能项），没有调整阈值。
- [x] npm run build：通过。
- [x] 浏览器检查平台高度和下方缺口；使用隔离存档预览，验证后恢复原值并关闭临时页。
- [x] Diff Guard：生产代码仅调整共享平台高度，没有新增抽象或防御分支；相关文件 diff --check 通过。
