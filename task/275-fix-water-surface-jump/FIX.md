# FIX -- 按水深起跳与露头渐进回氧

## Status: done
## Task: 275
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
水中上浮卡在水面；浅水应正常跳跃接飞行，深水出水不要过高过快。头部高出水面半格才开始恢复氧气，不能瞬间回满。

## Root Cause
水中起跳只读取已被深水划水消费的按键缓冲；原来的跳高从水下脚底计算。浅水蹬地也套用游泳出水的跳高和飞行重按限制。呼吸判定在鼻尖刚露出时就开始恢复，缺少半格间距。

## Fix Plan
- [x] 深水持续按住跳跃，上浮至近水面连续跃出，净跳高调整为 1.5 格并相应降低起跳速度。
- [x] 浅水踩底沿用正常地面跳高，持续按住可接飞行；深水游泳出水保留重新按键飞行。
- [x] 鼻尖露出停止耗氧；头部高出水面半格后按原有 3 秒回满速度逐步恢复。
- [x] 更新既有游泳和氧气用例，覆盖双形态实心岸落稳、浅水接飞行和半格恢复阈值。

## Verification
- [x] 修复前回归用例失败：浅水无法正常起跳接飞行，头部未高出半格就恢复氧气。
- [x] node --test test/swim.test.ts test/player-breath.test.ts（28/28）
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] diff-guard / git diff --check：无新增防御检查、无实现细节测试。
- [x] Bug is fixed

未执行浏览器人工手感验收。仅修改本任务相关代码，未提交或推送。

Final validation: typecheck passed; targeted tests 28/28; full tests 1790/1790; build passed with a chunk-size warning.
