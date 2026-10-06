# FIX -- Tibo 待机台词

## Status: done
## Task: 263
## Related: N/A
## Baseline Commit: 8a8fe8c

## Problem
Tibo 保留吃薯条的待机动作，额外显示“别急，智商正在等额度重置!”。

## Root Cause
`src/render/npc/npc-idle.ts` 只为 Sam 返回待机说话时段，`src/render/npc/npc-effects.ts` 只创建 Sam 的待机字幕。

## Fix Plan
- 保留吃薯条动作，在每轮待机吃完后的空隙淡入淡出新台词。
- 复用游戏和展示场共享字幕，适用于 Tibo 两种形态，补齐英文。

## Verification
- 不为纯视觉字幕新增自动测试。
- [x] `npm run typecheck`、`npm test`（1786/1786）、`npm run build -- --outDir /private/tmp/pelican-tibo-idle-build` 通过。最后字号与位置微调后重跑类型检查和构建通过。
- [x] 浏览器实际看到吃薯条动作和新字幕，缩小字号避开操作条，控制台无错误。截图 `tibo-idle-line.png`。
- [x] 本次改动 diff 检查通过；未新增测试、未提交、未推送。保留同文件并行加入的 Sam 台词改动。
