# FIX -- 单按 S 下平台

## Status: done
## Task: 183
## Related: N/A
## Baseline Commit: 3a35077

## Problem
单按 S 不能下平台。用户要求去掉空格加 S 的组合键要求。

## Root Cause
`src/entities/pelican-controller.ts` 下穿逻辑放在跳跃缓冲分支内，必须先按跳跃才检查 S。

## Fix Plan
- [x] 单按下方向即可下穿单向平台，双形态和骑车共用；实心地面不穿透。
- [x] 同步中英文键盘和触屏下方向提示。

## Verification
- [x] 四种形态/骑车组合先全部复现失败；修复后 controller、ride、swim 测试共 95/95 通过。
- [x] npm run typecheck：通过。
- [x] npm test：首跑 1691/1692；唯一失败为架构检查加载时拒绝同期加入的 story-app 动态导入。测试运行中架构规则发生更新，构建后单独复核 `node --test test/architecture.test.ts` 21/21 通过，未修改无关代码或断言。
- [x] npm run build：通过（6.49 秒）。日志 `/tmp/pelican-s-{typecheck,test,build}.log` 与 `/tmp/pelican-s-architecture-recheck.log`。
- [x] 浏览器仅按 S 250ms，主线骑车由 y=30 高台下落到下层通道；操作提示显示 S 下平台。临时 localhost 存档已恢复，用户 127.0.0.1 存档未修改。
- [x] Diff Guard：仅下穿触发条件、中英文提示及行为回归，无新增防御或接口；diff --check 通过。
