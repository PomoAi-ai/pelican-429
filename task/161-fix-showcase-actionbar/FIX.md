# FIX — 角色控制改为顶部横向操作栏

## Status: done
## Task: 161
## Related: 149, 158
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
角色上方展开的浮动菜单不方便连续操作。点击控制后，应在界面顶部显示“角色名 → 动作按钮”的横向操作栏。

## Root Cause
character-stage-panel.ts 将控制内容放在角色浮层内，character-stage.css 将内容绝对定位为有高度限制的滚动弹层。

## Fix Plan
- [x] 复用现有动作和设置控件，移动到场景上方的固定操作区；角色标签保留控制入口。
- [x] 操作按钮横向平铺并换行，图片资料按需展开，切换角色与删除实例同步清理。
- [x] 浏览器验收横向按钮、角色切换、动作切换、移除及窄屏（1360×900 / 390×844）。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1655/1655 通过。
- [x] npm run build：通过，有构建插件耗时及包体积提示。
- [x] 浏览器验证与 diff-guard 检查：通过，无新增问题；顶部动作持续可点，移动端动作条横向滚动。
- [x] Bug is fixed

## Decisions
- 使用 fix/core-dev/core-test 和已加载的 Ponytail Full，不新增 UI 自动测试。
- 保持横版侧视和默认单角色，不提交、不推送。
- 顶部操作区复用当前角色原有控件，只展示一个角色的操作；切换动作保持展开，移除当前角色时收起并释放其控件。
- 效果截图：`evidence/top-actionbar.jpg`。
