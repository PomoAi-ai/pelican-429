# FIX -- 冷却液快速持续伤害

## Status: done
## Task: 175
## Related: N/A
## Baseline Commit: 3a35077

## Problem
冷却液接触即死，没有逃脱机会。

## Root Cause
sim-world的touchLethalCoolant检测重叠后直接调用beginPlayerRespawn。

## Fix Plan
- [x] 冷却液每秒扣30生命，满血约3.3秒耗尽；每模拟步只结算一次。
- [x] 接触时不打断移动/跳跃/飞行，不施加击退，脱离立即停伤，生命归零沿用重生清理。
- [x] 普通水体无伤、冷却液不受战斗无敌帧保护，主线/自由世界共用。

## Verification
- [x] 定向冷却液/游泳/主线测试（先红后绿）：36/36通过，随后补真实逃脱回归交全量验证
- [x] typecheck / npm test / build：类型与构建通过；全量1700项仅旧即死时序失败，更新后对应16项全部通过，未重复全量
- [x] 浏览器观察掉血与逃离，diff检查

- 浏览器实测深处停留约1秒100→71HP；液面主动向左跳飞后98HP离开池区，仍可行动。隔离localhost测试已还原存储并关闭，用户存档未动。
- 全量发现facility-level旧用例仍要求2秒内触液死亡，按新需求改为2秒持续掉血但仍存活，随后浸泡至死并重生；`node --test test/facility-level.test.ts`16/16通过。
- Diff Guard检查本次增量：未引入新状态、依赖或防御性兜底；复用原重生流程，仅改变环境伤害结算。
- 最终检查日志`/tmp/pelican-coolant-{typecheck,test,build}.log`；构建仅既有chunk体积/插件耗时提示。新增真实输入飞离回归在全量通过。
