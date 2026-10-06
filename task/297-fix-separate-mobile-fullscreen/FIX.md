# FIX -- 分离移动端全屏与主屏幕引导

## Status: verifying
## Task: 297
## Related: 296
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
移动端全屏入口被主屏幕引导替换，独立运行后仍显示添加入口。

## Root Cause
control-surface.ts 根据 iOS UA 提前返回，阻止支持全屏的 iPad 调用 API，也没有隐藏独立模式的安装按钮。

## Fix Plan
- [x] 两个独立按钮；全屏按原生 API 能力同步调用，不按 iOS 身份拦截。
- [x] 独立／全屏显示模式及 navigator.standalone 隐藏主屏幕入口，监听页面模式变化和 pageshow。
- [x] 引导说明实际分享菜单步骤、编辑操作入口，以及从桌面图标重新打开。
- [x] 不支持全屏时明确说明设备限制，不将打开引导当作全屏成功。
- [x] 全屏失败提示只报告 API 缺失或浏览器实际返回的错误，不再导向安装；安装说明支持 Safari 和 Chrome。

## Verification
- [x] npm run typecheck、npm test、npm run build 通过；构建存在大体积 chunk 提示。
- [x] Diff Guard：无新增依赖、静默错误、内部防御校验或 UI 实现复述测试。
- [ ] 真机验收。普通 Safari 标签页无法可靠读取用户是否已在主屏幕安装；这里只检测当前运行模式。
