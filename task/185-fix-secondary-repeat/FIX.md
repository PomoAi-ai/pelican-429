# FIX -- 右键技能节奏与连续释放

## Status: done
## Task: 185
## Related: N/A
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
右键动作节奏偏慢，按住不连放，提前点击可能被丢弃。

## Root Cause
src/input/action-map.ts 仅向模拟传递技能按下事件；src/entities/pelican-weapons.ts 在冷却中提前消耗缓冲。人形技能持续 96 tick，鱼群冷却 72 tick。

## Fix Plan
- [x] 人形技能改为 42 tick，9 tick 起手；鱼群冷却改为 36 tick。
- [x] 传递右键按住状态，松开后仅完成当前动作；保留结束前 12 tick 的点击。
- [x] 人形光弹伤害 7→3、鱼群单发伤害 12→6，持续理论伤害接近原值。
- [x] 共享人形动画与展示场同步新节奏；起手、连射、收招三段映射到原动画时点，避免截断。
- [x] 通过空场景真实输入/模拟验证连放、松开与点击缓冲；调整原中断测试，确保中断发生在新起手结束前。

## Verification
- [x] 新增两项行为测试在修改前失败，复现无法连放与接续。
- [x] npm run typecheck — 通过。
- [x] node --test test/weapons.test.ts test/human-combat.test.ts — 45/45 通过。
- [x] npm test — 1717/1718 通过，唯一失败为世界生成性能中位数 881.1ms 超过 250ms；当时有多套全量测试并行运行。
- [x] node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts — 单独重跑通过；未改阈值、未跳过用例。
- [x] npm run build — 通过，存在大 chunk 和插件耗时提示。
- [x] diff-guard 审查本次增量 — 无新增防御性检查、异常兜底或实现细节测试；定向 git diff --check 通过。
- [x] Bug is fixed — 连放、松开与提前点击均通过真实模拟行为验证；动画手感保留浏览器人工验收。

工作区已有大量未提交改动；本次以修改前备份核对增量，仅调整右键技能相关文件，未提交或推送。
