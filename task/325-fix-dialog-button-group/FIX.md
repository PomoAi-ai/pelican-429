# FIX -- 确认弹窗等宽按钮组

## Status: done
## Task: 325
## Related: 323
## Baseline Commit: 2a5455a

## Problem
确认弹窗两个按钮按文字长度决定宽度，分离且大小不一致。

## Root Cause
src/ui/navigation.css 使用flex与gap，按钮无统一宽度。

## Fix Plan
- [x] 两列等宽grid，共用圆角边框和中间分隔，按钮统一48px高度。

## Verification
- [x] typecheck/test/build通过，1808/1808测试通过。
- [x] 浏览器桌面两个按钮均190×48px，390px手机视口均146×48px；连体组显示正常。
- [x] diff-guard：仅CSS，不新增逻辑、依赖或镜像测试。
