# FIX -- Tibo 待机台词替换

## Status: done
## Task: 269
## Related: 263
## Baseline Commit: 8a8fe8c

## Problem
将 Tibo 旧待机台词统一替换为“别急，智商正在等额度重置!”。

## Root Cause
台词集中在 `src/render/npc/npc-effects.ts` 的共享字幕，游戏和展示场、两种形态共同使用。

## Fix Plan
- [x] 替换唯一中文台词及对应英文，更新相关记录。
- 保留原来的触发时机、动作、字号和淡入淡出。

## Verification
- [x] `npm run typecheck`、`npm test`、`npm run build -- --outDir /private/tmp/pelican-tibo-wording-build` 通过。
- [x] 全仓文本搜索确认旧中英文台词没有遗漏；相关 diff 检查通过。
- 纯文案替换，不新增测试。
- 未重新进行浏览器视觉验收；旧任务截图保留为历史记录。未提交、未推送。
