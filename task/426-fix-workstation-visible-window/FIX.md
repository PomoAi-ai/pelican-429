# FIX -- 电脑桌进入视野时显示窗口界面

## Status: done
## Task: 426
## Related: 425
## Baseline Commit: d2d72f4

## Problem
玩家看见电脑桌时，应先切换到现有 Mac 风格全息窗口，随后继续自动轮播；移出镜头再进入时重新显示窗口。

## Root Cause
src/render/workstation-display.ts 的轮播仅以首次 update 为时间起点，电脑桌在屏幕外也持续轮播，没有进入视野的触发条件。

## Fix Plan
- [x] 在共享全息显示模块记录实际渲染可见状态；进入视野时重置轮播起点，沿用现有约0.64秒窗口切换动画。
- [x] 保持原有显示内容、配色、尺寸、供电和展示场复用链不变。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：已运行，1906/1907通过；唯一失败仍是此前已有的architecture.test.ts将art-library.ts文案里的window误判为DOM引用，本次未改动相关文件。
- [x] npm run build：通过，仅有既有大chunk提醒。
- [x] 浏览器：实际走近桌子、保持在画面中轮播到地球仪、走远至桌子完全出画面、返回后切回窗口；控制台无错误。证据：/private/tmp/workstation-visible-verification/reentered-window.png。
- [x] 聚焦差异检查通过；子代理确认四条共享调用链、供电顺序、阴影与多pass不误触发，无确定问题。

渲染效果按项目规范在浏览器验收，不新增渲染结构测试。修改前快照：/private/tmp/workstation-visible-start/workstation-display.ts。

“看见”按进入相机画面处理，未新增墙体遮挡检测；窗口停留10秒后继续既有轮播。未提交、推送。
