# FIX -- 死亡提示错误归因冷却液

## Status: done
## Task: 184
## Related: N/A
## Baseline Commit: 3a35077

## Problem
被怪物击败也显示“触碰冷却液”。

## Root Cause
`src/ui/facility-chapter-hud.ts` 根据通用 respawning 状态展示面板，却把死亡标题写死为冷却液。死亡状态本身没有提供具体原因。

## Fix Plan
- [x] 中英文统一使用通用“已死亡 / YOU DIED”，不凭空推断死亡原因。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1712/1712 通过，无失败或跳过。
- [x] npm run build：通过（4.48 秒）；日志 `/tmp/pelican-death-message-{typecheck,test,build}.log`。
- [x] 浏览器调用真实死亡面板进入 respawning 状态，中英文分别显示“已死亡 / 正在返回前哨入口…”与“YOU DIED / Returning to the outpost entrance…”。临时页面已关闭；未新增文案断言测试。
- [x] Diff Guard：仅替换现有双语标题，无新增状态或防御逻辑。
