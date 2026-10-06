# FIX -- Chrome 原生安装入口与事件时序

## Status: verifying
## Task: 303
## Related: 300, 301
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
电脑 Chrome 的安装按钮消失或点击只出现手动说明，用户要求核对 MDN、GitHub 与 npm 的标准做法。

## Root Cause
- control-surface.ts 将浏览器窗口 fullscreen 误判为已安装，即使已收到可用安装事件也隐藏入口。
- 原生安装事件晚到时，已打开的引导没有可安装动作；调用前清除事件还会丢失尚未展示就失败的安装机会。
- home-screen-install.ts 在没有安装 UI 的首页也取消默认安装推荐。
- 实测局域网 HTTP 的 Chrome 安装诊断为 not-from-secure-origin；同服务 127.0.0.1 返回零安装错误且有 beforeinstallprompt。两者不能当成同一个安装测试环境。

## Fix Plan
- [x] 仅在安装入口挂载时接管默认推荐；保留早期事件缓存。
- [x] 原生安装事件优先显示；fullscreen 不再单独证明已安装，用 manifest 启动来源辅助隐藏独立应用入口。
- [x] 引导内增加事件就绪后可点击的原生安装动作，等待原生结果时禁用重复触发，旧回调不清除新事件。
- [x] HTTP 环境明确显示安装不可用原因，本机与跨设备测试地址要求分开说明。

## Research
- https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent/prompt
- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app
- https://github.com/khmyznikov/pwa-install （npm 0.7.0）；旧 @pwabuilder/pwainstall 仓库已归档。
- 不引入组件或 Service Worker；async 本身合法，当前 prompt() 返回值处理也符合接口。
- launch=pwa 仅是 UI 来源提示，不存成安装凭证；复制网址、旧安装和丢失参数的导航仍有限制。

## Verification
- [x] 真实 Chrome 游戏页：本机地址安装诊断零错误，捕获真实事件；窗口 fullscreen 时安装入口可见。前台 visible/hasFocus 下真实点击调用接口并等待原生选择，页面未报错。
- [x] 独立浏览器组件检查：HTTP 原因提示、安装事件晚到后弹窗出现立即安装、重复触发禁用、取消时保留新事件、拒绝时恢复按钮并展示错误；这些时序案例使用浏览器事件替身，不宣称验证原生弹框。
- [x] npm run typecheck 通过。
- [x] npm test：1806 通过，0 失败。
- [x] npm run build 通过；保留现有 chunk 大小提示。
- [x] Diff Guard：独立子代理复查本次三个代码文件增量，无高置信度回归。
- [ ] Chrome 原生安装弹框目视验收：整窗读取被自动审批拒绝（含无关标签），chrome://web-app-internals 被浏览器协议策略阻止；已请用户在本机测试地址确认。不能以 Promise pending 代替弹框成功证据。
