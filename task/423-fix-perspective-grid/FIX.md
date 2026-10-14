# FIX — 恢复透视定义格显示

## Status: done
## Task: 423
## Related: 422
## Baseline Commit: d2d72f4

## Problem
住宅已迁入场景演示，但透视场景仍以白混凝土实景显示。用户要求所有透视场景恢复原来的透视格。

## Root Cause
- src/app/room-scene-preview.ts：格线与半透明按钮及检查器被强制关闭，普通透视沿用了住宅材质检查光照。
- src/render/definition-kit.ts：definition 默认实体与墙面使用白混凝土，覆盖了原先的灰蓝实体、绿灰背景墙。
- 对照 HEAD 同名文件确认原定义配色与默认显示状态；保留最新格子尺寸、碰撞和共享家具资源。

## Fix Plan
- [x] src/render/definition-kit.ts — definition 分支恢复原实体、墙面、窗框材质；ai-city 分支保持。
- [x] src/app/room-scene-preview.ts — 恢复默认格线与半透明、原透视光照，移除不再使用的混凝土贴图加载。
- [x] 浏览器核对单独场景、大场景、场景分层，并确认住宅演示保持。

## Verification
- [x] npm run typecheck：通过
- [x] npm test：1903项，1902通过；唯一失败仍为原有 art-library.ts 文案 window 触发 architecture.test.ts:232 的DOM检查误报。改动范围测试均通过。
- [x] npm run build：通过，仅既有chunk大小提示
- [x] 聚焦 diff / diff-guard：仅两个共享渲染文件；无新增兜底/校验/测试。git diff --check通过。
- [x] 浏览器效果验收：整砖单间、C上半砖双层、大场景旅舍、分层花园山谷均为透视格；住宅演示保持白蓝实景；所查控制台无错误。

不新增纯渲染自动测试；不回退最新尺寸、物理和动画，不复制旧家具模型，不提交、推送或部署。

## Evidence
- 子代理核对 HEAD 原配色、默认检查状态与调用方；确认 inspection 未被改动，ai-city 分支独立。
- 聚焦差异：`/private/tmp/perspective-grid-focused.diff`。
- 日志：`/private/tmp/perspective-grid-{tests,build}.log`。
- 截图：`/private/tmp/perspective-grid-verification/` 的 room、room-c、settlement、depth。
