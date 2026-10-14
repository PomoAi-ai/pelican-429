# FIX — 工作站 Mac 桌面配色

## Status: done
## Task: 416
## Related: 415
## Baseline Commit: d2d72f4

## Problem
用户要求电脑桌不显示蓝色科幻 UI，改为 Mac 风格 UI 配色。

## Root Cause
src/render/workstation-display.ts 的桌面背景、窗口、边框与共用投影光都偏蓝青，工厂与建造页还默认自动轮播，会重新显示蓝色界面。

## Fix Plan
- [x] 共享桌面改用中性灰白窗口、石墨文字、暖色渐变背景和彩色 Dock；投影光改柔白。
- [x] 共享默认模式为 Mac 桌面，同步模型、控件与住宅重建状态；保留既有三态选择和动画。
- [x] 同步家具文字说明；不改 2×2.5×1 占格、桌面高度或存档。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 已执行，1902 项中 1901 通过；仅既有 architecture 文案 window 误报失败，见下方限制。
- [x] npm run build — 通过，已有大 chunk 提示。
- [x] 浏览器白天/夜晚默认 Mac 桌面和手动切换检查，保存截图；无浏览器 error 日志。
- [x] 子代理调用方检查与 diff-guard — 无发现；只比较 /private/tmp/workstation-mac-start 本轮基准。git diff --check 通过。

## Decisions
- 采用 fix 局部修复流程；纯表现配色与默认选择调整，不新增渲染细节断言测试。
- 不重绘历史原画，不删除上一轮三态功能，不修改已有存档。

## Evidence / Remaining Limit
- 实景图片：assets/concepts/ai-city-residence/workstation-mac-colors-day.png、workstation-mac-colors-detail.png、workstation-mac-colors-night.png。
- 日志：/private/tmp/workstation-mac-tests.log、/private/tmp/workstation-mac-build.log。
- 测试唯一失败仍是 test/architecture.test.ts:232 将 src/config/art-library.ts 英文资料描述中的 window 视为 DOM；本轮未修改该文件，与上一轮已确认的既有失败相同。
- 未测试手机性能，未提交或推送；当前相关行为检查通过，既有架构误报留在其原范围处理。
