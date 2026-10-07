# FIX -- 瞄准提示与游戏 UI 风格统一

## Status: done
## Task: 318
## Related: 315
## Baseline Commit: 2a5455a

## Problem
新增青色瞄准光束与游戏已有暖金边框、深色半透明操作盘不一致。

## Root Cause
src/ui/control-surface.css 的瞄准样式使用独立的青色霓虹配色、宽光束、发光触点和高亮白色圆环，偏离现有控件视觉语言。

## Fix Plan
- [x] 仅修改瞄准相关 CSS：暖金细描边、深色半透明窄箭杆、镂空箭尖；取消霓虹、斜纹和起点圆圈；按钮进度环和拖动触点沿用操作盘颜色与阴影。
- [x] 保留方向型技能限制、拖动长短反馈和原有释放逻辑，不添加自动化 UI 测试。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1808 项通过，0 失败。
- [x] npm run build：通过；保留既有 chunk 体积提示。
- [x] Chrome 844 × 390 手机横屏视觉核对：暖金窄箭杆、镂空箭尖和按钮进度环，截图见 aim-preview.png。
- [x] diff-guard 自查：本次仅调整瞄准 CSS，无新增逻辑、依赖或测试。
