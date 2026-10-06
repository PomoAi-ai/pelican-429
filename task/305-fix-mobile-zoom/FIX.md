# FIX -- 手机缩放与默认视窗

## Status: done
## Task: 305
## Related: N/A
## Baseline Commit: a2f1a9283f1e1cde2432a6139b028150db3b482a

## Problem
手机需要允许玩家缩放，并采用合适的默认视窗。

## Root Cause
src/render/camera-rig.ts 的跟随距离固定为 camera.distance；src/ui/control-surface.ts 没有镜头缩放入口，手机与桌面共用同一默认视野。

## Fix Plan
- [x] 相机支持统一缩放，取景边界与坐标投影跟随变化。
- [x] 手机默认 125%，桌面默认 100%；菜单提供 75%–200% 滑杆和恢复默认。
- [x] 画布支持双指捏合，摇杆与攻击按钮不参与缩放手势。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 通过。
- [x] npm run build — 通过；有产物 chunk 大于 500 kB 提示。
- [x] diff-guard — 本次改动无新增多余校验、静默降级或低价值测试；git diff --check 通过。
- 手机真机双指手势与视觉手感需用户验收；不新增 UI / 渲染自动测试。
