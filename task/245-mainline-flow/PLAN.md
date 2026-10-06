# PLAN -- 主线流程自然衔接

## Status: blocked
## Task: 245
## Related: N/A
## Baseline Commit: 8a8fe8c

## Goal
检查从首页进入主线、序章、角色接管及关卡推进的路径，减少切换和重复确认，自然进入可操作状态。

## Non-goals
不改变剧情内容、战斗平衡，不修改资源或 vendor，不提交或推送。

## Acceptance Criteria
- 序章跳过直接进入主线，无需片尾再次确认。
- 序章画面保持到游戏准备好，再平滑交接，避免再次展示独立加载页。
- 正常播放、跳过、继续存档、移动端入口均保持可用；接管后键盘焦点进入游戏。
- 类型检查、全量测试和构建通过。

## Constraints
基于当前有大量未提交改动的工作区，只修改本任务相关内容。UI 与动画由浏览器验收，不添加源码文本或渲染细节测试。

## Decisions
- 主线当前已同页启动游戏，优先修正生命周期和交接，不引入路由框架或复制场景。

- 已完成探索与方案选择，无需用户裁决的分歧；同页首帧回调交接即可，无需重构路由或提前创建第二个完整世界。
- 序章暂停音画并释放资源，保留 Canvas 最后一帧作为覆盖层；首帧就绪后淡出，随后开始模拟并清空输入、聚焦画布。
- 自动播放受阻也允许直接跳过；显式处理关闭音频时未完成的 resume，不能等待用户先播放。
- 主线阶段已经由模拟连续推进，不改战斗规则；新增初入场景的简短操作指引，通关默认继续探索，删除无效的“留在这里”确认。
- UI/动画不写自动测试；如调整音频取消逻辑则复用现有音频行为测试验证不会在关闭后调度。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/intro-app.ts | 跳过直入、交接状态、末帧淡出 | — | yes |
| 2 | src/app/intro-audio.ts | 取消等待音频解锁的播放 | — | yes |
| 3 | src/app/story-app.ts | 将交接回调传递给游戏 | 1 | yes |
| 4 | src/app/game-app.ts | 首帧后交接再启动模拟，清空输入 | 3 | yes |
| 5 | src/ui/intro.css | 交接覆盖层及控件状态 | 1 | yes |
| 6 | src/ui/story-hud.ts | 到达/操作指引，通关默认继续 | — | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | 失败：既有 weapon-system.ts:83 字面量类型错误 |
| npm test | yes | 1769/1770通过；既有 showcase ultimate 命中数断言失败 |
| npm run build | yes | yes |
| 浏览器检查主线交接与操作 | yes | yes |

## Validation Notes
- 实现与审查子代理分别完成生命周期改动与检查；审查发现的取消后序章加载迟到失败问题已修复。工作区同期资源延迟加载更新按最新内容保留。
- 音频取消检查：`node /tmp/pelican-mainline-audio-check.mjs` 通过；受阻 resume 可以取消，迟到恢复不再调度，真实错误仍传播。没有新增 UI 或源码断言测试。
- 全量测试日志：`/tmp/pelican-mainline-test.log`。唯一失败为 `test/showcase.test.ts:160`，ultimate 实际命中1目标，预期6；该路径未经过本次修改模块。
- 最终类型检查：`/tmp/pelican-mainline-typecheck-final.log`，`src/sim/weapon-system.ts:83` 的已有工作区修改将 distance 推断为字面量18，不能赋入number；没有修改此文件。
- 最终构建日志：`/tmp/pelican-mainline-build-final.log`，构建通过；本次文件 `git diff --check` 通过。
- 浏览器已验证自动播放受阻时直接跳过、画布焦点、跳跃响应、继续存档直接进入；稳定构建下完整63秒序章自动交接通过；390×844触控视口下主线跳过、横屏iframe、移动提示与画布焦点通过，已恢复浏览器视口。

- 实现与浏览器验收完成；因两个任务外既有失败，不能标记全部交付检查通过。按仓库范围约束未修改武器或展示场实现，也未跳过测试或调整断言。未提交或推送。
