# PLAN -- 全站统一顶部导航

## Status: done
## Task: 318
## Related: 317
## Baseline Commit: 2a5455a964e5b71781c766c36abb5245c5f3e903

## Goal
所有页面复用同一顶部导航，以首页品牌和资源下拉菜单为基础统一入口、样式、语言和当前页指示。

## Non-goals
不改游戏逻辑、资源模型、发布模式限制，不提交推送。

## Acceptance Criteria
- 首页、资源目录、角色/历史/对比/场景/声音/序章/游戏共用一个导航 DOM。
- 资源和场景入口保留，首页锚点在其他页可返回首页对应章节。
- 手机可操作；游戏保留收起能力；页面工具条不与导航重叠。
- 语言与生产模式入口过滤继续生效。

## Constraints
工作区已有大量其他任务改动，按当前内容增量修改；UI 不新增自动测试。

## Decisions
- 同会话 explorer 子代理已探索并给出共享 DOM 设计；保留 dev-navigation/game-navigation/.dev-links 和 data-page，兼容游戏菜单克隆和场景定位。
- 直接迁移首页导航为全局唯一 header；资源菜单容纳原开发导航入口，页面专用工具栏保留。
- 语言固定在共享 header，不再随首页/剧情搬移；序章中的折叠把手保持可访问。
- 共享导航高度由 CSS 变量计算，自由世界和世界地点工具按实际存在追加高度；手机沿用两行布局。
- 无不可逆操作或需要用户裁决的设计分歧，直接实现。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | index.html | 唯一共享顶部导航与完整资源菜单 | - | yes |
| 2 | src/main.ts | 统一启动导航/高亮/过滤和目录复用 | 1 | yes |
| 3 | src/ui/dom-language.ts | 语言按钮固定挂载 | 1 | yes |
| 4 | src/app/game-app.ts | 删除剧情搬移语言入口 | 3 | yes |
| 5 | src/ui/navigation.css | 共用桌面/手机导航与高度 | 1 | yes |
| 6 | src/ui/homepage.css | 删除独立导航样式并调整页面偏移 | 5 | yes |
| 7 | src/ui/free-world.css | 工具栏随共享导航高度 | 5 | yes |
| 8 | src/ui/story.css | 删除独立语言按钮定位 | 3 | yes |
| 9 | src/ui/control-surface.css | 序章可展开导航 | 5 | yes |
| 10 | src/ui/control-surface.ts | 游戏导航面板只复用页面入口 | 1 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes：1808/1808 |
| npm run build | yes | yes |
| 浏览器检查多个页面、资源菜单、手机、游戏收起 | yes | yes |

- core-review/diff-guard 子代理审查通过；实测修正768px英文按钮越界，统一900px以下两行导航。
- 浏览器已检查目录、角色、历史、画质对比、场景资源、场景功能、声音、机房、序章和自由世界；游戏展开及收起popover正常。
- 发布版实测过滤开发页面后菜单无空组；剧情序章可展开共享导航、切换语言；跨页首页角色锚点跳转正常。
- 320px/768px/1280px/1440px中英文布局已检查；样式调整与导航翻译后重跑typecheck/build通过。
- 截图：/tmp/pelican-unified-navigation.jpg。没有新增UI自动测试、依赖或防御逻辑，未提交推送。
