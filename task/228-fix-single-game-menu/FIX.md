# FIX -- 合并手机导航入口

## Status: done
## Task: 228
## Related: 224, 225, 226
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
手机同时出现顶部导航把手和右上菜单按钮，入口重复。

## Root Cause
导航把手仅在 desktop 隐藏，菜单与顶部导航状态联动也仅在 desktop 启用。

## Fix Plan
- [x] 所有游戏操作布局隐藏导航把手。
- [x] 手机与 PC 共用菜单和顶部导航展开状态，回到画布一起收起。

## Verification
- [x] 浏览器手机操作页及 PC 菜单展开、收起、画布点击通过；两布局把手均隐藏，菜单和导航状态同步。
- [x] npm run typecheck、npm test、npm run build 通过；1759 个测试通过，0 失败。
- [x] 本轮 diff-guard 及 git diff --check 通过，只修改两处状态联动条件及一条隐藏规则。

UI 使用浏览器验收，不新增自动测试；未提交或推送。
