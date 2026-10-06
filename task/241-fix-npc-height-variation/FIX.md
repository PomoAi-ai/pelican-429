# FIX -- NPC 轻微身高差

## Status: verifying
## Task: 241
## Related: 238
## Baseline Commit: 8a8fe8c

## Problem
所有场景已统一比例，进一步让 Sam / Tibo 存在轻微自然身高差。

## Root Cause
共享模型入口此前将两个角色都固定到主角的 3.1 格表现高度，无法保留角色差异。

## Fix Plan
- [x] NPCS 添加唯一表现高度：Sam 3.1 格，Tibo 2.95 格（含头发）；源文件尺寸校验保留。
- [x] 共享模型、姓名标签、对话热区、画质预览读取各自表现高度，全部场景及两种形态同步。
- [x] 身体碰撞高度仍为 2.8 格；武器与攻击世界坐标保持现有契约。

## Verification
- [x] `npm run typecheck` 通过。
- [x] `npm run build` 通过（3.51 秒，已有大 chunk 提示）。
- [ ] `npm test` 1768 项中 1766 通过，2 项光子攻击测试失败，故保留 verifying 状态。
- [x] 浏览器实际 Boss 场检查：Tibo 比主角略矮，武器握点与脚底正常，无控制台错误；证据 tibo-height.png。
- [x] scoped diff / diff-guard 检查：仅新增角色表现高度与同步消费者，无测试细节断言、兜底或重复场景缩放。

仅改可逆的视觉尺寸及依赖定位，不添加常量或渲染实现细节测试。

## Unrelated validation failures
失败位于 test/combat.test.ts:359 和 :385（无目标虫弹发射、初段瞄准方向）。已在 /tmp/npc-height-isolation 复制当前源码/测试，并将本次修改的五个生产文件全部替换为修改前备份；单独执行 combat.test.ts 仍复现相同两项失败和相同 actual/expected。该问题独立于身高调整，未修改光子逻辑或测试断言。
