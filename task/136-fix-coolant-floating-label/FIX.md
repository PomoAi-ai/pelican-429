# FIX -- 移除冷却液悬浮文字

## Status: done
## Task: 136
## Related: 134-fix-fortress-stone-transition
## Baseline Commit: 无 HEAD；改前快照 $TMPDIR/pelican-coolant-label-before

## Problem
用户要求移除截图中“致命冷却液 · 沿踏台跳过”的悬浮提示。

## Root Cause
src/ui/facility-chapter-hud.ts 为堡垒固定创建冷却液警告，并每帧投影到崖边。

## Fix Plan
- [x] 删除警告节点、中英文文案、每帧定位及无用样式/导入。
- [x] 仅删除指定悬浮提示，沿用其他 HUD 及冷却液行为。

## Verification
- [x] 浏览器确认提示已移除，保存截图
- [x] npm run typecheck
- [x] npm test -- --test-concurrency=2
- [x] npm run build
- [x] diff-guard：仅删除代码与样式，无新增逻辑、兜底或测试
- [x] Bug is fixed

## Decisions
- 按 fix 局部修复，纯显示删除不新增文案/源码测试。
- 浏览器进入堡垒游戏，悬崖边已无指定浮动警告，画面正常；截图 output/chapters/fortress-coolant-label-removed.jpg。
- 验证子代理执行三个命令各一次，退出码均 0：typecheck 0.84 秒；1596/1596 项测试、301 suites、121.615 秒；build 403 模块、5.55 秒，仅现有产物体积与 prepare-out-dir 耗时提示。日志 $TMPDIR/pelican-coolant-label-{typecheck,tests,build}.log。
