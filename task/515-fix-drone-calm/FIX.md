# FIX -- 降低无人机闲逛频率
## Status: done
## Task: 515
## Related: 512
## Baseline Commit: c292d188
## Problem
宠物无人机闲逛过于频繁。
## Root Cause
src/ui/drone-locomotion.ts 驻留仅2–5秒，每次随机目标跨度较大。
## Fix Plan
- 延长驻留至8–18秒；闲逛限速并限制单次位移，近身让路和远距离追赶保留。
## Verification
- 类型检查、运动测试

- 类型检查通过；运动测试12/12通过。60秒驻留场景验证安静时间超过75%，仍有自主移动且可复现。
- diff-guard自行检查：只调整闲逛节奏/范围，保留追赶避让；没有新增依赖或防御检查。
- 单模块调整未重跑全量、构建及浏览器视觉验收。
