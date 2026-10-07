# FIX -- 游戏界面屏蔽选择与网页缩放

## Status: done
## Task: 307
## Related: N/A
## Baseline Commit: 9f830d6540b283fbbec4b965541e157d0c731c07

## Problem
长按游戏界面会触发文字选择和浏览器菜单；网页缩放干扰游戏操作。

## Root Cause
src/main.ts 未对游戏页面设置浏览器交互限制；现有 user-select 仅覆盖部分 HUD，viewport 未限制网页缩放。

## Fix Plan
- [x] 游戏、剧情和操作模式启动时设置 viewport 缩放限制，覆盖手机外层与游戏 iframe。
- [x] 游戏界面禁用文字选择和长按菜单；输入框保留编辑能力。
- [x] touch-action 允许菜单滚动，不允许原生双指与双击缩放；保留画布内镜头缩放。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 全部通过。
- [x] npm run build — 通过，保留大于 500 kB 的 chunk 提示。
- [x] diff-guard / git diff --check — 通过；子代理只读审查无明确问题。
- 未运行手机真机验收；不为 CSS / UI 行为新增自动测试。
