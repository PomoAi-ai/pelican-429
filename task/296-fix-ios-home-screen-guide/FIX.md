# FIX -- iPhone 与 iPad 桌面添加引导

## Status: verifying
## Task: 296
## Related: 295
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
补充 iPhone、iPad 添加游戏到桌面的引导。

## Root Cause
原引导隐藏在“全屏”按钮后的错误提示区域，入口及步骤不够明确。

## Fix Plan
- [x] iOS 入口标为“添加到桌面”，点击打开可关闭的原生对话框，逐步说明 Safari 分享、添加到主屏幕与桌面启动。
- [x] 区分桌面图标和浏览器收藏；已独立运行时显示状态。

## Verification
- [x] npm run typecheck、npm test（1802 项通过）、npm run build 通过；构建保留大体积 chunk 提示。
- [x] Diff Guard：无新增依赖、内部防御校验或复述 UI 的测试。
- [ ] iPhone/iPad 真机视觉验收，当前未执行。
