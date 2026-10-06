# REVIEW -- 序章与当前堡垒衔接核对

## Status: done
## Task: 214
## Related: N/A
## Baseline Commit: 8a8fe8c

## Scope
- Focus: 当前工作区序章最后一幕、章节文案、落地动画、进入游戏路径与当前堡垒的一致性。
- Files: src/app/intro-app.ts、src/render/intro-story.ts、src/render/intro-story-hud.ts、src/config/intro.ts、src/config/intro-language.ts、src/app/intro-story-audio.ts，以及 story/game/facility 的对应入口。
- 只读核对实现与现有图片；不修改源代码、配置、测试或资源。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Non-critical | 100 | - | src/app/intro-app.ts:26 | 最后一幕仍加载 04-lost-frontier-game-v2.png：浮空石堡、蓝色传送门、深色云海。当前堡垒为黑洞前哨、冷却液断崖、三层算力机房和城市背景。 | 用当前堡垒资源生成最终场景画面。 |
| Non-critical | 100 | - | src/render/intro-story.ts:670 | VORTEX、FEET 及 world 镜头、扬尘仍按旧图坐标绘制；黑洞本身在旧图中，不使用当前程序化黑洞。 | 更新背景时同步重新定位镜头、落点和特效；不能仅替换图片。 |
| Non-critical | 100 | - | src/render/intro-story-hud.ts:20 | 章节仍显示“01 / 遗落边境 / LOST FRONTIER”，与当前“山体算力堡垒”不一致。 | 同步中英文章节名称；落地提示需与实际入场时点一致。 |
| Non-critical | 100 | - | src/app/story-app.ts:32 | 序章在故事时钟 43.5 秒已表现落地并播放落地声，点击进入后 startGame(..., true) 又触发 beginBlackholeArrival。 | 统一落地交接：选择在序章交给真实坠落，或将序章落地作为最终落地，避免重复。 |
| Non-critical | 100 | - | src/app/intro-app.ts:68 | 独立序章（含 finale）的进入按钮仍指向 mode=game&level=facility&scene=fortress，进入自由预览并默认人形；首页 story 入口才接入主线并重置鹈鹕形态。 | 若独立序章也承诺进入剧情，应复用主线进入流程；若仅作展示，明确标注预览入口。 |

### Filtered by Verification
- 不将 game-app.ts 的默认 human 判为主线错误：initializeMainline → restoreMainlinePlayer 会将新主线重置为骑行鹈鹕。
- “对抗失控的 AI，重新变回人类”仍符合当前主线，不判为过期目标。
- 堡垒仍有雨雪环境，不能只根据晴天概览图认定序章降水本身错误。
- 音效没有独立列为失效项；INTRO_LANDING_AT 同时控制旧落地动画与声音，调整交接时应一起处理。

## Validation Results
| Command | Result | Details |
|---------|--------|---------|
| 源码调用链与图片查看 | 已执行 | 核对当前工作区，不以历史任务文档作为需求。 |
| 图片对照 | 已查看 | 04-lost-frontier-game-v2.png 与 home-fortress-overview.jpg；概览图只作为现有资源参考，当前结构另由源码确认。 |
| 浏览器完整播放 | 未执行 | 结论来自源码与资源检查，未宣称完成运行时视觉验收。 |
| typecheck / npm test / build | 未运行 | 本次只读审查与审查记录，不修改实现。 |

## Conclusion
- Assessment: Approved with notes
- Summary: 发现五项需同步的视觉、文案与入口衔接问题。当前正式 finale 序奏 32 秒，故事段相对标准时钟后移 12 秒，因此旧游戏世界段出现在实际播放约 53.5–63 秒、落地约 55.5 秒、目标面板约 59 秒。此前雨雪夜、失控、羽化和骑行梦境不因堡垒更新而必须重做。仅新增审查记录，无实现改动。

## Resolution
- 五项问题已在相关后续任务 215 完成同步，实施与验证结果见 ../215-intro-fortress-sync/PLAN.md；上表保留为修改前的审查证据。
