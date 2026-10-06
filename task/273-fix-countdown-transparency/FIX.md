# FIX -- 倒计时遮罩半透明

## Status: verifying
## Task: 273
## Related: 272
## Baseline Commit: 8a8fe8c

## Problem
全屏倒计时背景过于不透明，游戏场景几乎不可见。

## Root Cause
story-countdown 的高不透明背景与 backdrop 暗色叠加。

## Fix Plan
- [x] 窗口背景改为 50% 不透明，backdrop 透明；文字阴影保证可读性。

## Verification
- [ ] 浏览器检查背景透出和文字可读性。
- [ ] npm run typecheck
- [ ] npm test
- [ ] npm run build
- [x] 只修改样式；无新增自动 UI 测试。
