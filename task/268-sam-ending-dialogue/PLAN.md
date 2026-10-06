# PLAN -- Sam 阶段结束对话

## Status: done
## Task: 268
## Related: N/A
## Baseline Commit: 8a8fe8c

## Goal
降智风暴告一段落时，以半屏 Sam 对话让玩家选择继续探索或进入自由世界；继续后顶部保留下一阶段入口。

## Non-goals
不新增关卡，不修改战斗、资源或存档格式。

## Acceptance Criteria
- restored 阶段出现半屏 Sam 对话和两个选择。
- 继续探索关闭对话，顶部保留随时进入下一阶段的提示与入口。
- 自由世界沿用现有存档与跳转流程；支持中英文及小屏。

## Constraints
保留工作区既有改动；UI 不新增自动测试；不提交或推送。

## Decisions
- 下一阶段沿用已有自由世界入口。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1787 passed |
| npm run build | yes | yes |

- 探索与设计由同一 explorer 子代理完成：现有 NPC dialog、头像和 frame 暂停分支足够复用，设计无分歧，不再单独派设计代理。
- 使用原生模态窗口；对话关闭后恢复画布焦点；Escape 等同继续探索。
- 不改变存档格式；每次加载已完成的堡垒仍展示对话。
- 工作区已有大量未提交文件，使用任务开始时的文件快照核对本次差异。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/ui/story-hud.ts | Sam 对话、选择与收起提示 | - | yes |
| 2 | src/ui/story.css | 居中半屏与小屏布局 | - | yes |
| 3 | src/app/game-app.ts | 对话暂停与焦点恢复 | 1 | yes |

## Browser Verification
- 1280×720：Sam 对话约半屏高度，头像、台词、双选项完整。
- 844×390：小屏横向布局及两个按钮完整可见。
- 继续探索与 Escape 均关闭对话并恢复画布焦点，顶部保留随时进入下一阶段入口。
- 对话直接进入自由世界，以及继续后通过顶部入口进入自由世界，均实际加载成功。
- 浏览器控制台未发现 error；临时测试存档已还原并确认一致。
- 截图：dialogue.jpg、continue.jpg、dialogue-small.jpg。
- UI 按项目规则未新增自动测试；英文文案已实现，未单独进行英文视觉验收。

## Review
- 独立验证子代理审查本次三文件差异通过，无需修复的问题。
- npm test：1787 项通过，0 失败、0 跳过；build 通过，仅大包体和插件耗时提示。
- 三文件 diff 空白检查通过；未提交、推送。
