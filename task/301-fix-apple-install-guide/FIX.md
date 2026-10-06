# FIX -- Apple 主屏幕与程序坞安装适配

## Status: done
## Task: 301
## Related: 300, 298
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
安装引导将所有非 iOS 设备视为安卓，Mac Safari 没有正确的程序坞步骤；普通网页全屏状态被误作安装状态。

## Root Cause
control-surface.ts 仅按 iOS/其它二分，按钮名称没有随平台改变；display-mode:fullscreen 检测没有排除临时元素全屏。

## Research
- https://github.com/khmyznikov/pwa-install ：读取 src/utils.ts、src/logic.ts，参考 Apple 平台手动引导与原生安装事件分离、独立运行检测。
- https://github.com/pwa-builder/pwa-install ：旧仓库已归档并迁移；不采用旧实现作为最新 Apple 行为依据。
- https://support.apple.com/zh-cn/104996 ：macOS Sonoma 14+，Safari 文件/共享→添加到程序坞。
- https://support.apple.com/zh-cn/guide/iphone/iphea86e5236/ios ：主屏幕添加与网页 App 模式。

## Fix Plan
- [x] iOS、Mac Safari、安卓、其它桌面分别提供入口名和指引，iPad 桌面 UA 不误判 Mac。
- [x] 有原生安装事件则优先使用；Apple 显示准确手动步骤。不根据事件缺失推断已安装。
- [x] 独立启动/真实安装后隐藏；普通元素全屏不视为安装。浏览器自身全屏与 fullscreen 启动模式仍不能仅凭媒体查询可靠区分。
- [x] 参考开源模式但不引入新依赖、不复制其音频/WebGL猜测系统版本逻辑。

## Verification
- [x] npm run typecheck、npm test（1802通过）、npm run build 通过；首轮元组类型错误已修复后重跑。构建保留 chunk 大小提示。
- [x] Chrome 中复用实际组件模拟 Mac Safari、iPad 桌面 UA、iPhone Chrome、Mac Chrome：入口文字和程序坞弹窗检查通过。模拟显示模式限定为普通标签页；不代表 Apple 真机安装验收。截图 /private/tmp/pelican-mac-dock-guide.png；临时覆盖已清理。
- [x] Diff Guard：没有引入依赖或错误吞噬；UA 只选择指引，未拦截原生全屏 API。
