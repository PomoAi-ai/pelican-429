# PLAN -- 点击角色切换顶部工具条

## Status: implementing
## Task: 351
## Related: 347
## Baseline Commit: 975f136

## Goal
移除场景中每个角色头顶的悬浮条。点击角色后，在场景顶部显示该角色共用工具条，保留暂停、移除、变身和动作功能；拖动仍调整位置。

## Acceptance Criteria
- 场景内没有跟随角色的浮动卡片。
- 点击不同角色只显示对应工具条，重复点击不关闭。
- 顶部工具条占自己的布局空间，不覆盖模型。
- 点击与拖动分离，拖动/取消手势不误切工具条。
- 暂停、动作、视角、移除和 NPC 变身继续可用。

## Decisions
- 复用任务 347 的探索和设计结果，直接改共享卡片装配和既有射线命中逻辑；不新建平行控制系统。
- 主代理调整工具条；子代理调整手势与场景装配，并独立审查。
- 可回退的本地 UI 改动，不触及存档，不提交推送。
- 浏览器验证交互，不新增锁定 DOM 结构的测试。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/ui/character-stage-panel.ts、character-stage.css、showcase-panel.ts | 复用卡片控制，移除悬浮布局，顶部单选工具条 | no |
| src/app/showcase/stage-drag-controls.ts、src/app/character-stage-app.ts | 点击选择、拖动阈值、删除投影定位 | yes |
| src/ui/showcase-language.ts | 更新操作提示 | no |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm run build | yes | no |
| 浏览器点选、拖动、移除及两类角色工具条 | yes | no |
| 定向审查与 diff 检查 | yes | no |
