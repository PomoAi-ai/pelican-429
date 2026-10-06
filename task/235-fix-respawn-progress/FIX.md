# FIX -- 复活保留 Boss 血量与主线进度

## Status: done
## Task: 235
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
玩家复活后保留 Boss 剩余血量和游戏进度，避免反复重打。

## Root Cause
- src/sim/mainline.ts 的 restoreMainlinePlayer 在恢复玩家时同时重建满血 Boss。
- src/sim/mainline-progress.ts 死亡期间不保存 Boss；src/app/story-save.ts 拒绝玩家死亡且 Boss 存活的快照。

## Fix Plan
- [x] 玩家复活只恢复玩家，保留 Boss 对象、剩余血量及战斗进度。
- [x] 死亡等待期间保存存活 Boss，存档边界接受此状态，重载后只复活玩家。
- [x] 更新既有复活测试，并通过保存、读取、恢复链路验证死亡存档。

## Verification
- [x] 修改前两项回归测试失败：Boss 被恢复为 5250 血，死亡存档 Boss 为 null。
- [x] node --test test/mainline.test.ts test/mainline-progress.test.ts test/story-save.test.ts：14 项通过。
- [x] npm run typecheck：通过。主线进度测试使用当前 startTeleport 接口构建闪现状态。
- [x] npm test：最终 1764 项通过，0 失败。首次运行遇到工作区并行变化引发的 6 项非主线失败，当前对应专项 29 项及最终全量均通过。
- [x] npm run build：通过，存在分块体积提示。
- [x] diff-guard 检查：没有新增防御逻辑或实现细节测试。子代理复核死亡取消回血施法但保留 Boss 血量与回血冷却。

## 补充排查
用户反馈血条几乎不动。真实模拟确认 Tibo 下车啄击扣 10（约 0.27%），Sam 人形近战扣 14（约 0.27%），Codex 七发扣 21（0.4%）；HUD 直接读取实际 HP。骑车时 J 被既有骑行规则取消，水弹仍可造成伤害。尚未确认用户所用攻击方式，本次未进一步调整数值或骑行规则。

未进行浏览器人工验收；未提交或推送。
