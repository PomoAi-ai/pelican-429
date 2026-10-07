# FIX -- 帮助与关于的内容与布局

## Status: done
## Task: 327
## Related: N/A
## Baseline Commit: 2a5455a964e5b71781c766c36abb5245c5f3e903

## Problem
帮助页面缺乏可用信息，标题过大、内容堆叠，缺少清晰的浏览层次。

## Root Cause
src/ui/site-pages.ts:38 — 仅提供概括性段落，将实际操作说明转交游戏内界面；复用首页大标题样式，未提供帮助页面的独立布局。

## Fix Plan
- [x] 补齐中英文键鼠、触屏、存档、常见问题和项目介绍，提供直接可用的入口。
- [x] 使用现有游戏图片与配色，增加分区目录、操作表和原生问答折叠区，适配窄屏。

## Verification
- [x] npm run typecheck
- [x] npm test：1808 项中 1807 项通过，唯一失败为 CSS 导入违反架构约束；改用 index.html 的样式入口后，node --test test/architecture.test.ts 21/21 通过。其余测试未重复运行。
- [x] npm run build：成功，保留已有的大 chunk 体积提示。
- [x] 浏览器检查布局、锚点、问答和语言切换。
- [x] diff-guard 检查。

浏览器：1280px 桌面与 390px 手机视口，中英文来回切换、目录锚点、问答折叠、微信弹层正常，手机内容无横向溢出。截图：help-desktop.jpg。

Diff guard：仅补充静态 UI 与独立样式入口；没有新增依赖、防御性检查或复述实现的测试。子代理只读核对按键、触屏与存档说明，修正原有设置页包含操作说明的误导。
