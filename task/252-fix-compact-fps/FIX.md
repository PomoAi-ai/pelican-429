# FIX -- 头像下简洁帧率

## Status: verifying
## Task: 252
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
默认在头像下显示简洁帧率，点击显示完整信息；仅显示文字，去掉背景。

## Root Cause
src/ui/perf-panel.ts 原先仅支持隐藏或完整信息，且不接收收起状态下的帧率。

## Fix Plan
- [x] 性能面板收起时显示 FPS，按钮点击展开或收起，保留快捷键与设置控制完整信息。
- [x] 帧循环始终刷新简洁帧率，只有展开时进行完整分段计时。

## Verification
- [ ] npm run typecheck：现有 src/render/player-view.ts:137 引用 Health.overloadInvulnTicks 不存在，未修改该处。
- [x] npm test：全量通过。
- [x] npm run build：通过（现有大分块提示）。
- [x] diff-guard 检查本次改动，无新增防御性校验或低价值测试。
- UI 位置与交互待浏览器人工验收。
