# FIX -- 倒计时提示改为半透明上半屏

## Status: done
## Task: 274
## Related: 272, 273
## Baseline Commit: 8a8fe8c

## Problem
倒计时提示需放在屏幕上半部分并透出游戏场景。

## Root Cause
story-countdown 仍使用 100dvh 占满整个屏幕。

## Fix Plan
- [x] 仅修改 story.css：贴顶、高度50dvh，沿用现有50%透明底色和透明backdrop，收紧字号与间距以适配小屏。
- [x] 保留原倒计时与自动开战逻辑；不新增样式自动测试。

## Verification
- [x] 1280×720、844×390浏览器实测：提示贴顶占上半屏，游戏场景透出，下半屏完整显示；倒计时结束顶部任务提示恢复，Sam开战。截图desktop.jpg、small.jpg；原存档已还原。
- [x] npm run typecheck — 通过。
- [x] npm test — 1789通过，0失败、0跳过。
- [x] npm run build — 最终样式构建通过，仅已有包体/插件耗时提示。
- [x] diff-guard 与空白检查通过，仅修改本次样式。

- 视觉验收发现旧HUD文字重叠，添加仅倒计时窗口显示时隐藏旧HUD的CSS规则，随后重新构建。
