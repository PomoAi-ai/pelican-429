# PLAN -- 无人机真实作业入口

## Status: done
## Task: 502
## Related: 499
## Baseline Commit: c292d188

## Goal
家园中点击真实无人机进入砍树、挖掘、修建，实际改变世界。
## Non-goals
不向普通自由世界强制注入家园经济，不新增建筑种类。
## Acceptance Criteria
真实机体位置和电量同步；明确采集类型；修建复用太阳能板与仓库；非家园不生成假任务。
## Constraints
保留工作区原有改动；不提交推送；不增加 UI 自动测试。
## Decisions
- 已完成 explorer 只读探索和方案设计，按同一上下文继续实现，不重复派工。
- 使用现有家园模拟、指挥覆盖层、GLB；展示场通过明确入口进入家园。
- 新增选择语义用例捕获挖掘被树抢占、砍树误挖地；既有闭环测试验证实际世界变化。
## Validation
| Command | Required | Done |
|---|---|---|
| node --test test/homestead.test.ts | yes | 19/19 passed |
| npm run typecheck | yes | passed |
| npm test（主代理执行） | yes | 1982/1982 passed |
| npm run build（主代理执行） | yes | passed，保留大包体积提示 |
| 浏览器真实作业验收（主代理执行） | yes | passed，真实菜单进入施工；木材 16→6，施工结束发电 5→6，回到待命 |

## Result
- 独立审查未发现必须修复的问题；git diff --check 通过。
- 已验收实际砍树、挖掘与施工；新测试覆盖显式挖掘不会被树冠抢占。
- 游戏截图：assets/concepts/follow-drone-modeling-v4/game-work-orders.png。
- 作业范围为家园模式；修建支持现有太阳能板和仓库。普通世界入口引导进入家园，不注入另一套经济。
- 未提交或推送，保留原有工作区改动。
