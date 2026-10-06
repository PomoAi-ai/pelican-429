# FIX -- 大世界鱼群容量

## Status: done
## Task: 163
## Related: 157
## Baseline Commit: 3a35077

## Problem
大世界种子 392740869 生成 107 条鱼，游戏启动时 fish-view 报超过 64 条容量。

## Root Cause
src/render/fish-view.ts 的共享工厂默认固定分配 64 个实例；world-views 与展示场调用均未传容量。鱼群在世界初始化生成，正常游戏仅移除鱼，没有运行期繁殖。

## Fix Plan
- [x] 默认容量按初始真实鱼群数量分配，保留原最小预留和显式容量约束；不截断鱼群。
- [x] 真实种子三档世界回归覆盖启动更新；改回固定容量即失败，不断言网格或材质细节。

## Verification
- [x] 修复前复现 / 定向测试通过
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器大世界启动与跨区检查
- [x] diff-guard

## Evidence
- 修复前真实中型世界复现 85 > 64（用户先前运行报 107 > 64，同一固定容量根因）；修复后小/中/大完整鱼群 update 均通过。
- node --test test/render-fish.test.ts：10/10通过；npm run typecheck通过；npm run build通过。
- 浏览器中型世界启动成功，堡垒 → 大教堂旅行正常；大型4096×192地图启动并进入湖畔湿地，未出现容量错误。截图 evidence/large-world.png。
- 全量 npm test 1656 项：1655 通过，唯一 worldgen 耗时门槛在两组并行全量运行时失败（576.6ms >250ms）。单独重跑该性能用例 1/1 通过，无鱼群功能回归；未重复全量。
- diff-guard 完成：仅共享默认容量分配与真实世界启动回归，无丢鱼/截断/吞错。
- 未提交或推送。
