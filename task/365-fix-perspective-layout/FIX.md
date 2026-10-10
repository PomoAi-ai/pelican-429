# FIX -- 透视页面整体布局整理

## Status: done
## Task: 365
## Related: 362, 363
## Baseline Commit: 975f136

## Problem
三排横向控制占据场景高度，长说明、操作提示和技能悬浮遮挡场景，控件缺乏明确层级。

## Root Cause
room-scene-preview.ts 的控件集中在 header，说明和提示覆盖 canvas；对应 CSS 用整行换行及绝对定位。

## Fix Plan
- [x] 顶栏收敛为标题状态、游玩开关和面板入口。
- [x] 左侧场景目录与说明，中间场景与底部技能，右侧独立视角/显示/太阳/帮助分组，可收起。
- [x] 适配窄屏，保留所有事件绑定和交互状态；家具比较与分层观察点也进入控制面板。

## Verification
- [x] npm run typecheck：通过；验证期间并行分层实现的接口补齐后复验通过。
- [x] npm test：1859 项通过，0 失败。
- [x] npm run build：通过，保留已有大 chunk 提示。
- [x] 桌面与 390×844 窄屏浏览器验收，页面无横向溢出；视角、太阳滑杆、技能、面板收起后行走均通过，分层页观察点和图层控件正常，控制台无错误。
- [x] diff-guard 与 git diff --check：通过；视觉改动未增加源码匹配或渲染细节测试。

## Result
- 场景说明和操作提示退出画面，技能栏拥有独立底部空间，右侧面板可收起或按组折叠。
- 桌面截图 `/tmp/perspective-layout-desktop.jpg`。未提交推送部署；未进行手机真机触摸测试。
