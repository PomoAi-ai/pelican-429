# PLAN -- 中英文界面补全

## Status: done
## Task: 165
## Related: N/A
## Baseline Commit: 3a35077

## Goal
检查当前全部正式入口的语言表现，补齐中英文切换遗漏，包括动态文案、页面标题和无障碍标签。

## Non-goals
不改 vendor、不翻译工程日志和历史独立资源页面、不改变玩法、不提交推送。

## Acceptance Criteria
- 首页、游戏、主线、展示场、场景资源、声音库和设置使用现有中英文选择。
- 切换语言后动态文案保持正确，刷新保留选择。
- 类型检查、现有测试和构建通过。

## Constraints
保留工作区已有更改；复用现有语言模块；不新增依赖，不为字面文案增加测试。

## Decisions
- 现有语言为 zh/en，沿用中文和英文。
- 按游戏与展示入口分派只读探索，设计后分别修复。

- 探索确认声音库整体缺译、分类状态依赖可翻译文字、展示搜索缺英文、NPC Canvas 字幕未接语言、主线标题未跟随切换。
- 设计沿用现有精确字典与动态翻译，不新增 i18n 依赖；声音与展示搜索同时索引两种语言，分类使用稳定数据值。
- DOM 原文缓存可正确识别模块自己的文本更新，无需新增节点标记体系。
- 画布字幕在共享创建函数订阅语言并重绘同一纹理，释放时退订。渲染层不依赖 UI，将纯语言状态置于 core、浏览器存储适配保留 UI。
- 无需用户裁决的方案分歧或仓库外操作，直接实现。文案与渲染不新增镜像实现测试，保留既有语言行为测试。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/ui/sound-language.ts | 声音库文案与动态翻译 | — | yes |
| 2 | src/app/sound-gallery.ts | 双语搜索和稳定分类选择 | 1 | yes |
| 3 | src/ui/showcase-language.ts | 补充展示词条并递归翻译组合 | — | yes |
| 4 | src/ui/dom-language.ts | 接入声音字典，统一属性翻译路径 | 1 | yes |
| 5 | src/ui/character-stage-panel.ts | 角色英文搜索 | 3 | yes |
| 6 | src/ui/showcase-panel.ts | 资源英文搜索 | 3 | yes |
| 7 | src/ui/settings-panel.ts | 切换错误提示语言 | — | yes |
| 8 | src/ui/game-audio-panel.ts | 声音库入口双语 | — | yes |
| 9 | src/render/intro-story.ts | 序章剧情字幕双语 | — | yes |
| 10 | src/core/language.ts | 纯语言状态供表现层共享 | — | yes |
| 11 | src/ui/language.ts | 浏览器语言适配 | 10 | yes |
| 12 | src/render/npc/npc-effects.ts | 技能字幕实时双语 | 10 | yes |
| 13 | src/render/facility-kit.ts | 设施标牌实时双语 | 10 | yes |
| 14 | src/app/game-app.ts | 页面标题响应语言变化 | — | yes |
| 15 | src/ui/facility-chapter-hud.ts | 场景提示双语 | — | yes |

| 16 | index.html | 英文设置选项按文字最小宽度换行 | — | yes |
| 17 | test/language.test.ts | 组合翻译优先级与嵌套插值回归 | 1, 3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |

## Results
- npm run typecheck：首次发现新增词条重复，删除重复项后重跑通过。
- npm test：1663 / 1663 通过，301 suites，0 失败、0 跳过，耗时 92.9 秒。
- npm run build：通过，4.65 秒；存在 Vite chunk 大小提示，无构建错误。
- git diff --check：本次相关文件通过。
- 浏览器核对：首页中英切换；角色英文搜索 Photon；资源完整变体计数；声音库 63 项英文、分类状态、英文搜索和播放中切中文；游戏标题/按钮；已显示的种子错误双向切换。刷新保留所选语言，结束恢复中文。
- NPC Canvas 与设施标牌共享绘制路径由子代理复核了初始化、订阅和纹理释放；未逐个技能做截图验收，不新增渲染自动测试。
- 子代理复核发现声音拆分抢先完整模式的真实缺陷，修正优先级并补进现有组合翻译行为用例；最终无未解决审查问题。
- 截图：evidence/sound-en.jpg、evidence/sound-zh.jpg。
- 保留全部既有未提交更改；未提交、推送或部署。
