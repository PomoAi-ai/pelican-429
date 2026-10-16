# FIX -- 电脑桌靠近显示软件界面

## Status: done
## Task: 433
## Related: N/A
## Baseline Commit: 64ef4a38

## Problem
- 玩家进入桌子外围 2 格立即显示软件界面并保持；连续离开满 3 秒恢复全息轮播。
- 离开期间再次靠近取消计时，楼上玩家不能隔层触发。

## Root Cause
- `src/render/workstation-display.ts` 根据是否被镜头渲染重置轮播，没有玩家距离与离开计时。
- 共享家具更新没有收到玩家身体，住宅、透视与家园需要下传相同信息。

## Fix Plan
- [x] 共享纯状态逻辑计算桌子标准占格 2×3 与玩家身体的最短二维距离，并管理离开计时。
- [x] 显示器接入状态切换；保留现有展开动画和闲置轮播。
- [x] 住宅、透视、家园接入真实玩家身体，建造幽灵传空玩家。

## Verification
- [x] `node --test test/workstation-display-state.test.ts`：5/5 通过。
- [x] `npm run typecheck` 通过。
- [x] `npm test`：1919/1919 通过。
- [x] `npm run build` 通过，只有现有大 chunk 提示。
- [x] 浏览器：玩家 x=62.3,y=2 处于桌边 2 格内，停留超过一个轮播周期仍保持软件界面；移动到 x=59.4,y=2 后最初保持软件界面，随后恢复轮播。浏览器错误日志为空。精确 2.99/3 秒与返回取消计时由纯状态用例覆盖。
- [x] 子代理对照本轮改前快照完成 diff-guard 审查，无新增问题；`git diff --check` 通过。

## Outcome
- 靠近立即触发现有约 0.64 秒的收束/展开动画，持续靠近时锁定软件界面。
- 离开 3 秒后从地球仪重新开始全息轮播，重复进出独立计时。
- 住宅、房间透视、大场景透视和家园共用距离与状态逻辑，建造幽灵不响应玩家。
- 实景截图：`/private/tmp/workstation-near-software.png`。
