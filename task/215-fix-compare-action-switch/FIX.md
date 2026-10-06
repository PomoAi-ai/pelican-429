# FIX -- 画质对比切换动作卡在旧姿态

## Status: verifying
## Task: 215
## Related: 206
## Baseline Commit: 8a8fe8c

## Problem
Grassy 在画质对比页从待机切换跑步后，时间条持续前进，五栏仍显示待机姿态。

## Root Cause
对比页按绝对时间采样，frameDt 固定为 0；共享动作系统切换动作后的姿态过渡需要 frameDt 推进，过渡因此始终停在旧姿态。游戏及展示场正常传递帧时间，不存在同一调用问题。

## Fix Plan
- [x] 浏览器复现待机 → 跑步并播放，角色仍停在待机。
- [x] 与现有 NPC 对比采样一致，复用 motionPose.reset，在每次绝对时间采样前清除过渡状态。
- [x] 仅修改对比页采样，不改变游戏动作过渡；不新增渲染实现细节测试。
- [x] 类型检查、全量测试、构建及浏览器验收均已执行。

## Verification
- npm run typecheck：通过。
- npm run build：通过，保留已有大于 500kB chunk 提示。
- npm test：1750/1751 通过；唯一失败为 worldgen.test.ts 的世界生成耗时门槛，实测中位数 547ms，高于 250ms。
- node --test test/worldgen.test.ts：单独复查仍未通过耗时门槛，未修改该用例或世界生成代码。保留 verifying 状态，明确全量检查未全绿。
- 浏览器：复现修复前从待机切跑步、时间条前进但五栏维持待机；修复后跑步、行走和待机反复切换正常，播放推进、暂停切换及时间轴从 0.2s 回拖至 0.05s 均显示对应姿态，五栏同步。控制台无 warning/error。
- 独立子代理审查通过：reset 仅清除对比取样的过渡状态，游戏和展示场原有过渡不受影响。
- 验收截图：grassy-run-synchronized.png。未提交、推送。
