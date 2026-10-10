# FIX -- 非首页顶部导航极简样式

## Status: done
## Task: 367
## Related: 366
## Baseline Commit: 975f136

## Problem
所有非首页顶部菜单需要更窄，仅略高于文字，去掉方框、背景块和圆角。

## Root Cause
src/ui/navigation.css 的非首页导航仍保留44px高度与按钮装饰，透视页面另有32px局部覆盖。

## Fix Plan
- [x] src/ui/navigation.css — 非首页导航统一24px，文字控件20px，去掉边框、背景块和圆角；下拉目录同步紧凑化。保留现有导航功能、焦点样式及首页样式。
- [x] src/ui/room-scene-preview.css — 删除透视页面导航覆盖，复用统一样式。

## Verification
- [x] npm run typecheck — passed
- [x] npm test — 1861 passed
- [x] npm run build — passed，保留现有大体积资源包提示
- [x] 浏览器验证透视、帮助页均24px，文字控件20px且无边框圆角；资源下拉正常展开，首页仍72px与原按钮样式。
- [x] git diff --check / diff-guard — passed；仅CSS展示改动，无新增测试、防御分支或依赖。

## Limitations
未逐个打开所有场景或进行手机真机验证；所有非首页共用同一选择器。未提交或推送。
