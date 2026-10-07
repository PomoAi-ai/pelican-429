# FIX -- 放大两侧倒计时文字
## Status: blocked
## Task: 331
## Related: 330
## Baseline Commit: 2a5455a
## Problem
左右两处倒计时文字偏小。
## Root Cause
共用状态标签字号为 12px。
## Fix Plan
- [x] 共用字号改为 16px，内边距 5px 12px、圆角 13px；两处同步生效。
## Verification
- [ ] 类型检查、构建与 diff 检查通过；全量测试长时间没有新输出，已中断，未计为通过。本次仅字号、内边距与圆角调整，未新增测试或重做浏览器验收。
- [x] diff-guard：仅样式，无新增逻辑或测试。
