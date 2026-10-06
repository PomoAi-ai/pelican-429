# FIX -- 黑洞吸附无声音

## Status: done
## Task: 213
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
游戏中的黑洞有吸附效果但没有声音。

## Root Cause
- `src/app/game-audio.ts:166` — 只在 fortress 配乐模式创建黑洞声部，自由世界使用 world 模式而未创建。
- `src/app/blackhole-audio.ts:8` — 距离衰减固定使用独立堡垒坐标，自由世界已对黑洞位置做平移。

## Fix Plan
- [x] 按关卡是否存在黑洞创建声部，并在两种配乐模式下更新。
- [x] 空间混音显式接收黑洞实际位置，声音目录同步传入其预览位置。
- [x] 在现有黑洞测试文件补充位置和播放回归用例。

## Verification
- [x] 回归用例先失败、修复后通过：`node --test test/blackhole-audio.test.ts`，3/3 通过。
- [x] `npm run typecheck`
- [x] `npm test`：1751/1751 通过。
- [x] `npm run build`（有既有大 chunk 提示）
- [x] 按 diff-guard 审查本次增量：没有新增防御性校验、静默兜底或实现文本断言。
- 浏览器主观听感待人工验收。
