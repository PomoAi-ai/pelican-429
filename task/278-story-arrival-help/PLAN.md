# PLAN -- 主线落地操作与任务提示

## Status: done
## Task: 278
## Related: 276
## Baseline Commit: 8a8fe8c

## Goal
进入主线后在玩家落地时显示半透明提示，说明下车、技能和任务，关闭后开始游戏。

## Non-goals
不改变存档结构、战斗机制或后续阶段提示，不增加 UI 自动测试。

## Acceptance Criteria
- perimeter 阶段每次进入游戏只显示一次；黑洞计时结束且落地后才显示，死亡不重复弹窗。
- 提示暂停游戏，按钮或 Escape 关闭后清除输入、恢复焦点与游戏。
- 提示包含上下车、移动跳跃、四技能、Tibo 后解锁人形以及主线目标。
- 半透明适中宽度，中文英文与小屏均可读。

## Constraints
遵循现有 storyHud 暂停流程，复用技能槽资料，不修改 vendor、CI 或存档。

## Decisions
- 探索和设计由实施子代理直接完成：主线程已定位既有 HUD、暂停接口和落地条件，无需重复派工。
- 启动时记录 perimeter 状态，覆盖已有外围存档；只在本次实例落地后提示一次，后续阶段不弹。
- 新建专用入场提示模块，避免现有 story HUD 超过函数长度限制；不引入通用弹窗框架。
- 无审批停止条件，直接实现；浏览器验收和全量检查由主线程执行。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/ui/weapon-hud.ts | 导出既有技能槽资料 | — | yes |
| 2 | src/ui/story-intro-hud.ts | 落地帮助对话框 | 1 | yes |
| 3 | src/ui/story-hud.ts | 接入更新、暂停与销毁 | 2 | yes |
| 4 | src/ui/story.css | 半透明适中宽度与小屏滚动 | 2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器检查落地、暂停、关闭恢复与小屏 | yes | yes |

## Results
- typecheck 和 build 通过，构建保留既有大 chunk 提示。
- 全量测试 1790 项：1789 通过，1 项发现新模块运行时导入违反 UI 分层；改为 type-only 导入并使用既有实体读取方式后，受影响 architecture 测试 21 项全通过。
- 浏览器验证落地触发、暂停时 R 不误操作、点击关闭恢复焦点、关闭后 R 下车及空格关闭；844×390 小屏标题至按钮完整可见。
- 审查子代理发现空格受游戏按键捕获影响，已在按钮本地处理并实测修复。
- 未新增 UI 自动测试；浏览器原存档和尺寸已恢复，未提交或推送。
