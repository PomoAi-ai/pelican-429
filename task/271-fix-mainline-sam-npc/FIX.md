# FIX -- 主线结束后 Sam 留作 NPC

## Status: done
## Task: 271
## Related: 268
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
玩家选择继续探索后，Sam 应留在堡垒中成为可交谈的人形 NPC。

## Root Cause
src/sim/mainline.ts 的 restored 阶段没有生成居民，src/app/game-app.ts 主线没有加载 Sam 人形资源或装配 NPC 对话。

## Fix Plan
- [x] restored 阶段生成唯一友好 Sam，恢复存档与重复初始化同样生效；复用居民实体与 Boss 转人形视图，不改变存档格式。
- [x] 主线复用人形资源与现有 NPC 对话，结尾对话期间屏蔽交谈入口。
- [x] 回归用例覆盖击败、继续模拟、恢复与重新初始化。

## Verification
- [x] 新用例先失败（居民数 0 !== 1），修复后通过。
- [x] npm run typecheck — 无关并行改动补齐 turning 后重新运行通过。
- [x] node --test test/mainline.test.ts — 7/7 通过。
- [x] npm test — 1788 通过，0 失败、0 跳过。
- [x] npm run build — 通过，仅大包体与插件耗时提示。
- [x] 浏览器确认继续探索后 Sam 人形驻留，显示“与 Sam 交谈”，可打开常驻 NPC 对话；控制台无 error。临时存档已还原。截图 sam-resident.jpg、sam-dialogue.jpg。
- [x] diff-guard 检查无新增问题。
