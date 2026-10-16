# FIX -- 工作站两秒轮播与离开恢复

## Status: done
## Task: 435
## Related: N/A
## Baseline Commit: 64ef4a38

## Problem
闲置应每两秒切换，玩家在附近保持浅色桌面窗口，离开立即恢复。

## Root Cause
src/render/workstation-display-state.ts 中原有十秒周期和离开三秒等待。

## Fix Plan
- [x] 缩短周期并删除离开延迟，保留现有显示动画与距离判定。
- [x] 更新现有状态转换用例，捕捉周期不正确、离开延迟及恢复后计时不断重置的问题。

## Verification
- [x] 定向测试（修改前先确认失败）
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 限定改动审查

## Results
- 修改前定向测试 4 项失败，修改后 5 项全过。
- typecheck 通过；全量 1925 项测试通过；build 通过（已有大包体积提示）。
- 对照修改前文件完成限定 diff 审查，无新增依赖、防御分支或异常兜底。
- 本次只改状态计时，未重新进行浏览器动画观感验收；现有 0.64 秒过渡动画保留。
