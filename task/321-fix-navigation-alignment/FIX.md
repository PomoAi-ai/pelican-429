# FIX -- 导航按场景分开并修正对齐

## Status: done
## Task: 321
## Related: 320-fix-primary-navigation
## Baseline Commit: 2a5455a964e5b71781c766c36abb5245c5f3e903

## Problem
首页不应强制使用游戏内菜单。顶部普通链接、资源按钮、社交区、语言选择器与游戏按钮高度不一，下拉菜单向左伸出不贴合触发按钮。

## Root Cause
navigation.css 各控件独立padding/line-height且popover按右侧锚定；共享DOM没有页面场景的展示规则。

## Fix Plan
- [x] 首页与游戏/资源页面使用不同入口布局，共享链接不强制共享展示。
- [x] 顶部控件高度统一、菜单左沿与触发按钮对齐，紧凑手机布局。

## Verification
- [x] npm run typecheck：通过
- [x] npm test：1807/1808；仅世界生成性能中位数288.2ms超阈值250ms，单独复跑1/1通过，未修改用例。
- [x] npm run build：通过
- [x] 浏览器首页/游戏/资源菜单对齐与手机布局：桌面、320px英文通过；游戏菜单左沿偏差0px、间隔8px。
- [x] diff-guard审查：未新增防御逻辑、依赖或UI自动测试。

- 浏览器测量：首页所有顶层控件height=40px、top=15.5px；菜单左沿偏差0px、按钮底部间隔8px。
- 320px英文首页与资源页面已验证，文字换行保持40px高度；窄屏资源页面保留logo返回首页入口。
- 子代理实现导航分场景和基础对齐，主代理实测补正窄屏英文；测试子代理完成检查。最终CSS补改后构建退出码0。
- 验收截图：/tmp/pelican-home-nav-aligned.jpg、/tmp/pelican-game-nav-aligned.jpg。未提交推送。
