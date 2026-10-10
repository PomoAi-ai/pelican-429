# FIX -- 统一薄门框构件与概念资料

## Status: done
## Task: 352
## Related: N/A
## Baseline Commit: 975f136b617b223f5a2a6256d179d4b13d732f68

## Problem
门沿通行方向占满一格，形成厚通道；线框方案与实际预览不一致。

## Root Cause
src/render/building-kit.ts 的门零件使用归一化 X=[0,1]；src/config/building-kit.ts 将门宽定义为1。

## Fix Plan
- [x] 门X方向整体缩至0.14，保持Y高3、Z跨度1.4以及原有开闭行为。
- [x] 同步资源目录、概念页面和尺寸/房间图；明确模型修改不等于接入门碰撞。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1842 项通过，0 失败。
- [x] npm run build：通过；存在大于 500 kB 的 chunk 提示。
- [x] 浏览器检查门的开闭状态和观察角度：正面为薄边，斜侧门框与屏障对齐，开启时仅屏障隐藏。
- [x] diff-guard：无新增兜底、内部防御或复述实现的测试。

## Remaining Limits
门洞净高仍约 2.64 格，小于角色碰撞高度 2.8 格；本次保持高度不变，未接入门的通行碰撞。地形深度 1.5 格也未修改。
