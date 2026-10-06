# FIX -- 全屏按钮遮挡与 iOS 桌面引导

## Status: verifying
## Task: 290
## Related: 289
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
全屏按钮与其他按钮冲突，Chrome 点击没有全屏效果。iOS 应提醒添加到桌面。

## Root Cause
index.html:176 的设置按钮与 src/ui/control-surface.css 的全屏按钮同时占用右上角 12px，设置按钮 z-index 更高且触控区域外扩 8px，遮住全屏按钮。

## Fix Plan
- [x] 菜单与全屏用 flex 排列，右侧为设置按钮及外扩点击区留出空间，文字变长时不重叠。
- [x] 非 iOS 继续由点击直接调用宿主浏览器 requestFullscreen / exitFullscreen。
- [x] iOS 点击显示 Safari 分享、添加到主屏幕、从桌面打开的说明；已独立运行时明确显示当前状态。

## Verification
- [x] npm run typecheck：通过
- [x] npm test：1796 项全部通过
- [x] npm run build：通过（已有大 chunk 警告）
- [ ] 浏览器验证：Chrome 连接反复报 Unable to load browser request-header policy；原生窗口操作被 user changed 保护中止，未确认实际全屏效果。iOS 真机未验证。
- [x] diff-guard / git diff --check：通过
