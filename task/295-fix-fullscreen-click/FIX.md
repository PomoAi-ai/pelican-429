# FIX -- 同步点击调用浏览器全屏

## Status: verifying
## Task: 295
## Related: 290
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
全屏按钮仍被报告点击无效；要求在点击事件中直接调用浏览器全屏 API。

## Root Cause
尚未确认用户环境的拒绝原因。此前 Chrome 自动化页面返回 `not granted`，前置标签页后请求成功，但浏览器窗口仍显示导航栏。旧代码虽然使用 async，requestFullscreen 前没有 await，不能据此认定 async 是根因。

## Fix Plan
- [x] 点击监听改为同步函数，直接调用全屏 API；Promise 仅处理结果。
- [x] 标准 API 明确传入 navigationUI: hide，保留 iOS 主屏幕引导与错误提示。

## Verification
- [x] npm run typecheck 通过。
- [x] npm test 通过。
- [x] npm run build 通过。
- [x] Diff Guard：无新增测试、静默错误或内部防御校验。
- [ ] 实际浏览器窗口全屏验收；自动化页面状态不足以证明导航栏已隐藏。本轮原验证标签页已失效，尚未完成修改后的窗口验收。
