# PLAN -- NPC 身高与点击对话

## Status: done
## Task: 155
## Related: 154, 150
## Baseline Commit: 3a35077

## Goal
Sam、Tibo 与人形主角视觉身高一致，保留各自模型。点击附近角色打开几句对白，只能翻页和关闭，不再称为向导或自动冒出帮助提示。

## Non-goals
任务、商店、奖励、传送与模型资产重制。

## Acceptance Criteria
- 两位 NPC 固定形象，显示身高对齐主角，碰撞尺寸与人形一致。
- 点击角色打开有姓名的对话框；下一句、结束、关闭与 Escape 正常。
- 对话期间暂停游戏，不触发游戏按键；关闭后恢复。

## Decisions
- 沿用此前探索与本轮逐文件追踪，探索和设计输出已完整，跳过重复代理探索。
- 模型包装层静态归一化，不修改共享原始资产。
- 原生 dialog 加投影到屏幕的角色点击区域；不添加依赖。
- NPC 仅保留环境巡游、招呼；移除 Tibo 专属 help 行为及过时测试。
- UI 与外观浏览器验收，不编写复述 DOM/网格实现的测试。无设计审批停止条件。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/npc/wanderer-view.ts | 对齐身高、移除向导与提示 | — | yes |
| 2 | src/entities/wanderer.ts | 统一人形碰撞、删除 help | — | yes |
| 3 | src/sim/free-world-npcs.ts | 出生空隙遵循碰撞身高 | 2 | yes |
| 4 | test/free-world-npcs.test.ts | 删除过时帮助行为用例 | 2 | yes |
| 5 | src/ui/npc-dialogue.ts | 点击角色与对白 | — | yes |
| 6 | src/ui/npc-dialogue.css | 对话框与交谈入口样式 | 5 | yes |
| 7 | src/app/game-app.ts | 装配与暂停恢复 | 5 | yes |
| 8 | index.html | 加载样式 | 6 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器交谈、翻页、关闭、身高核对 | yes | yes |
| 同线程 subagent review | yes | yes |

## Results
- NPC 原有模型静态归一化至主角身高；移除自动帮助文案与向导称呼。
- Sam / Tibo 各三句中英对白，点击角色开启，翻页/结束/关闭；原生 modal 暂停游戏。
- 浏览器实测 Sam、Tibo 点击，三句对白，结束、关闭、Escape，Space 开启/翻页/关闭；对话中 F 不触发变身。野外和堡垒显示正常。
- 同线程审查 Approved：修复 GM 松键释放与原生 Space 按钮激活冲突。
- npm test 全量 1641 项，首次 1640 通过、1 项 UI 分层失败；改为逻辑层仅类型导入后，node --test test/architecture.test.ts 21/21 通过。未重跑未受影响的全量测试。
- 最终 npm run typecheck / npm run build 通过；构建仅有包体积提示。NPC 定向测试 2/2 通过。
- 未新增 UI/模型细节测试、无依赖、无提交与推送；保留仓库其他并行改动。
- 浏览器验收截图：evidence/npc-dialogue.png。
