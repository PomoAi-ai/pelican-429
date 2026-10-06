# FIX -- 堡垒底层实心地面与手机 Boss 难度

## Status: done
## Task: 291
## Related: N/A
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
堡垒最底层不能下穿，避免误入冷却液死亡。手机 Boss 血量和防御为 PC 原值的 1/3。

## Root Cause
src/world/facility-level.ts 将全部工业地板设为单向 TILE_BRANCH，包含冷却液上方的底层主路。Boss 生成统一使用 PC 配置，没有按操作模式调整。

## Fix Plan
- [x] 堡垒主路及入口连接面改为实心地板，上层平台保持下穿。
- [x] 手机 Boss 血量和防御调整为原值 1/3，PC 不变。

## Verification
- [x] 底层持续下落和下加跳跃不穿地、不掉血；冷却液伤害仍有效。
- [x] 手机 Boss 行为测试：子代理相关 49 项通过，覆盖伤害/破韧、主线存档恢复及 Boss 场召唤。
- [x] npm run typecheck：通过
- [x] npm test：1800 项中 1799 项通过，1 项旧弹体测试仍把新实心底层当作单向平台；将该用例移至实际单向上层后，node --test test/enemy.test.ts 全部通过（断言行为未改变）。
- [x] npm run build：通过（已有大 chunk 提示）
- [x] diff-guard / git diff --check：通过

## Final Decisions
手机/电脑沿用操作模式；现存 Boss 切换模式时保留血量和破韧进度比例。减伤比例而非受伤倍率除以 3；破韧门槛同样除以 3。存档继续保存标准血量尺度，协议不变，防止重复读档累计缩减。

视觉和手机真机验收未执行；逻辑通过内存关卡与真实模拟接口验证。
