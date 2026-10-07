# PLAN -- 首页与紧凑页面导航

## Status: done
## Task: 323
## Related: 322
## Baseline Commit: 2a5455a

## Goal
首页保持独立介绍导航；其他页面紧凑、可折叠，游戏使用已有导航开关。一级入口为首页、资源、场景、自由世界、开始或继续游戏、帮助关于，保留三个社交链接。

## Acceptance Criteria
- 资源与场景分别下拉，手机展示归场景；资源总览与帮助关于可访问。
- 非首页导航紧凑，普通页面折叠后仅把手；游戏无额外把手。
- 开始与继续共用入口，重头开始二次确认，取消保留存档。
- 手机和桌面文字对齐；GitHub、X、微信目的地不变。

## Decisions
- 基于已有导航、原生 popover/details 实现，复用现有目录页样式。
- 子代理探索与导航实现并行；本线程负责资源总览、帮助页和重开边界。已有导航探索覆盖结构设计，无需额外设计代理。
- 不涉及不可逆外部操作，不需设计审批。不新增 UI 自动测试。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| index.html / src/ui/navigation.css / src/main.ts | 导航结构、紧凑布局与折叠 | yes |
| src/config/app-mode.ts / src/ui/site-pages.ts | 总资源与帮助页面 | yes |
| src/app/story-app.ts | 重开确认 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器桌面、手机、折叠与重开取消验收 | yes | yes |

## Results
- 非首页44px单行导航，手机横向滚动；资源/场景/游戏下拉与文字对齐。首页独立品牌布局，原三社交目的地不变。
- 重开使用页面内HTML dialog，不调用系统confirm；取消与Esc不清除存档，默认焦点在取消。
- 子代理审查指出游戏按钮缩进与总览文案漏翻译，已修复。
- 全量测试其余1787项通过，初次架构文件失败（动态导入ui）；改静态导入后架构21/21通过。最新typecheck/build通过。
- 浏览器验证390px手机、桌面、资源目录、帮助中英文、折叠零占位、游戏无额外把手、内置确认与Esc取消。未点击清档确认。
- 本地预览端口5190；未提交或推送。
