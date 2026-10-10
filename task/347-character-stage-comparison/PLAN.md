# PLAN -- 统一角色比较面板与场景摆放

## Status: done
## Task: 347
## Related: 345
## Baseline Commit: 975f136

## Goal
所有角色与怪物复用同一紧凑面板；标题和动作按钮同排，模型版本单独下拉，去除空白条。恢复男性 Grassy 的目录身份，支持在场景直接拖动角色以方便比较。

## Acceptance Criteria
- 动作以按钮展示，标题同排；模型版本和视角控件使用统一行布局，按能力展示功能。
- 普通攻击、技能与其它动作共用按钮栏和播放控制；所有目录角色都使用相同视角控件。
- Grassy 目录展示男性原角色，D1 仍是独立女性；不清除游戏捏人存档。
- 拖角色改变角色位置，拖空白仍平移镜头，缩放/视角切换保持可用。
- 切动作后角色位置保留，新增/删除其它角色不重排已移动角色。

## Decisions
- 沿用 dev 与 Ponytail 工作流；已有展示场结构分析可直接复用，UI 探索和设计合并。
- 三个子代理分别负责动作/模型选择、男性资源身份、拖动摆放；主代理统一布局和浏览器核验。
- 不更改模型几何或用户外观存档，不添加运行时依赖，不提交推送。
- 操作均为可回退本地变更，无需额外批准；位置先作为当前展示会话状态，不扩展持久化需求。
- 用户澄清“攻击条”为“工具条”：统一角色与怪物的工具条布局，攻击保持为该角色适用的动作按钮。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/ui/showcase-panel.ts | 动作按钮和模型版本选择分离 | yes |
| src/ui/character-stage-panel.ts、character-stage.css、showcase-language.ts | 标题动作同排与统一控件布局 | yes |
| src/app/showcase/human-session.ts 等共享资源装配 | 恢复男性目录身份、统一角色与怪物的视角控制 | yes |
| src/app/character-stage-app.ts、stage-drag-controls.ts | 直接拖动摆放、镜头手势协调及位置保持 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass |
| npm test | yes | 1842/1842 pass |
| npm run build | yes | pass；保留已有大包体积警告 |
| 浏览器男女角色、怪物面板、拖动和切动作后位置实测 | yes | pass |
| diff 与独立审查 | yes | pass |

最终复核：新增视角容器及鹈鹕转身修正后再次通过 typecheck、53 项关联测试与 build；浏览器核对 Grassy 男性外观、D1 和 Sam 共享工具条、视角选择、拖动角色及空白平移、切动作/模型位置保持，控制台无错误。未测试实体触屏，位置仅保留于当前页面会话。
