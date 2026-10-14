# FIX -- 独立渲染两列流式布局

## Status: done
## Task: 403
## Related: 401, 402
## Baseline Commit: d2d72f4

## Problem
用户要求独立渲染每行两个，全部版本按页面正常向下展开。

## Root Cause
src/ui/d1-render-lab.css 的桌面布局固定视窗高度，gallery绝对定位并固定三行三列；窄屏另外硬编码五行高度。

## Fix Plan
- [x] src/ui/d1-render-lab.css — 所有宽度固定两列，gallery进入正常流，卡片宽度自适应；保留单版聚焦，桌面控制栏吸附。
- [x] src/app/d1-render-lab.ts — 全览关闭画布滚轮缩放并允许触摸纵向滚动，聚焦恢复；旋转速度按单卡高度计算。
- [x] 独立只读复核滚动、scissor坐标及焦点返回；不新增渲染/UI自动测试。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1880 tests / 301 suites全通过，70.4秒。
- [x] npm run build — 通过，原有chunk大小提示。
- [x] full模式实验入口构建，copyPublicDir:false — 通过，输出/tmp/d1-fluid-layout-build。
- [x] 浏览器桌面/窄屏每行两个、滚到最后一行、聚焦/返回、画布对齐 — 1440px、839px、390px检查通过，9版显示，桌面画布上滚动到V9、单版放大与返回V9位置正常，无渲染报错；临时窗口尺寸已恢复。
- [x] diff-guard：仅修改布局和必需的滚动交互，无新增防御或测试分支。

截图保存在evidence/。未增加UI自动测试；移动触屏手势未在真实触屏设备验收。
