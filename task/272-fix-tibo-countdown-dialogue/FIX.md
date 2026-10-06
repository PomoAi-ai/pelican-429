# FIX -- Tibo 战后全屏倒计时提示

## Status: done
## Task: 272
## Related: 268, 271
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
击败第一个 Boss 后需要全屏提示，并显示 Sam 抵达倒计时。

## Root Cause
src/ui/story-hud.ts 的 countdown 阶段仅在顶部 HUD 显示提示，没有战后全屏窗口。

## Fix Plan
- [x] 全屏窗口显示 Tibo 已击败、人形恢复、变身已解锁与现有 Sam 倒计时。
- [x] 复用模拟计时，保持推进；结束自动关闭、清输入并恢复焦点，Escape 不可跳过。
- [x] 从 countdown 存档进入同样显示；不新增 UI 自动测试。

## Verification
- [x] npm run typecheck — 通过。
- [x] npm test — 1789 通过，0 失败、0 跳过。
- [x] npm run build — 通过，仅大包体与插件耗时提示。
- [x] 浏览器检查全屏布局；28→23 秒持续推进，Escape 无法跳过；归零自动收起并进入 Sam 战斗，画布恢复焦点。控制台无 error，原存档已还原。截图 countdown.jpg。
- [x] diff-guard 无新增问题；git diff --check 通过。
