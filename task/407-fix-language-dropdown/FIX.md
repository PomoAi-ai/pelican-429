# FIX -- 自定义语言下拉

## Status: verifying
## Task: 407
## Related: N/A
## Baseline Commit: d2d72f4dc50da560b61b71ebeadda6bdbedcec64

## Problem
语言下拉不再使用系统原生选择菜单，统一采用站内深色菜单。

## Root Cause
`src/ui/dom-language.ts:99` 与 `src/ui/settings-panel.ts:127` 创建原生 select；CSS 只能改变触发器外观，展开后仍由系统绘制。

## Fix Plan
- [x] 共享语言选择器替换顶栏和设置面板两处 select，沿用语言同步与持久化。
- [x] 自定义菜单提供选中提示、键盘操作、外部点击关闭，并处理游戏快捷键与设置面板关闭。
- [x] 保留导航现有布局，用 Popover 避免滚动容器裁切。
- [x] 首页导航空间不足时允许横向滚动，避免英文导航把语言按钮挤出屏幕。

## Verification
- [x] `npm run typecheck` — 通过。
- [ ] `npm test` — 1880 项中 1878 项通过；两项非本次改动范围的失败，详见下方。
- [x] `npm run build` — 通过；保留已有的大 chunk 提示。调整导航 CSS 后重跑构建通过。
- [x] 浏览器检查：首页和游戏设置两处中英文同步、刷新保留选择、方向键/Enter/Space/Home/Esc/Tab、外部点击与关闭设置后收起菜单；390px 窄屏菜单在视口内且未被导航裁切。
- [x] Diff Guard 子代理检查本次增量 — 无确定性问题；`git diff --check` 通过。

全量检查的已有阻碍：
- `test/architecture.test.ts:232` 用单词正则扫描源码，匹配到未在本次修改的 `src/config/art-library.ts:575` 英文文案中的 `window sizes`，误报使用 DOM window。
- 世界生成性能检查全量并行运行时中位数为 414.3ms，超过 250ms。单独执行 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 通过。

本次语言与设置相关既有测试均通过；未修改上述无关代码或断言。功能已实现并完成浏览器验收，跟踪状态保留 verifying，因全量检查仍有已有失败。
