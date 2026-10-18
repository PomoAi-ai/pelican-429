# FIX -- 无人机穿地与机械跟随

## Status: done
## Task: 510
## Related: 507
## Baseline Commit: c292d188

## Problem
无人机在台阶处穿地；玩家微小移动立即带动两台无人机同步跟随。

## Root Cause
src/ui/drone-locomotion.ts — 每帧直接追逐固定偏移，没有等待范围、启动延迟和速度变化。
src/app/perspective-controls.ts — 选择最近顶面时没有排除埋在其他实体内的地面；无人机固定深度与住宅行走纵深不一致。

## Fix Plan
- [x] 跟随加入等待、追赶与减速，双机错开启动节奏。
- [x] 修正台阶接地和透视深度。

## Verification
- [x] 回归测试：先复现小步立即跟随，再通过；叠块、埋入平台、分离楼层覆盖。
- [x] npm run typecheck：通过
- [x] npm test：1997/1997 通过
- [x] npm run build：通过，既有大 chunk 提示
- [x] 浏览器检查：住宅 2 从左门穿过室内到右侧白台阶，确认轮子停在顶面、玩家保持可见；截图 residence-step.png。
- [x] diff-guard：本次修改无吞错、内部重复校验、实现细节断言；无新增依赖。
