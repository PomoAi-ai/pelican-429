# PLAN -- AI 乐章开场动画

## Status: done
## Task: 018
## Related: N/A
## Baseline Commit: 无 HEAD；开始时仓库全部文件为 untracked

## Goal
制作可在浏览器播放的开场动画：全黑命令行、裸露律动文字在空间飞舞、AI 乐章从缓慢逐渐狂躁，最后转入已确认的第一幕 Mac Studio 编程场景。

## Non-goals
本次不自动扩展到第二至第四幕，不修改游戏模拟、vendor 模型，不提交或部署。

## Acceptance Criteria
- 独立动画入口可播放完整序列，黑场无开发导航露出。
- 无卡片或方格；文字从少量漂浮变为密集飞掠、旋转、节拍顿挫，音乐同步加密至狂躁，突然收束后转入第一幕。
- 支持暂停、恢复、静音、重播、跳至第一幕，离开页面释放动画和音频。
- 图片加载失败明确报错，遵守浏览器音频启动规则。
- 类型检查、全量测试、构建通过；浏览器检查画面与播放控制。

## Constraints
- 用户已批准开始实现；词语采用宽泛 AI 演进概念，不加入历史年份或含糊原句。
- 使用现有 TypeScript / Vite、Canvas 2D 和原生 Web Audio，不新增运行时依赖。
- 纯视觉动画不写锁定实现的自动测试。

## Decisions
- 探索子代理确认可新增独立 ?mode=intro，避免启动游戏模拟。
- 首幕复用 assets/chapter-one/01-grassy-coding-concept-v3-mac-studio.png，通过 Vite 静态 URL 收集。
- 全黑动画模式隐藏开发导航，覆盖现有 48px 顶部偏移。
- 当前无 Git 基线，不使用 git diff HEAD 作为唯一审查依据，记录本任务修改文件。
- 架构设计发现现有架构测试禁止动态 import；入口改用静态 import，不调整架构规则。
- 推荐总长约 40 秒：0–6 秒黑底命令行；6–15 秒英文术语与音符从终端飞出；15–30 秒文字密集乱飞、节奏加速失控；30–32 秒骤停黑场与章节标题；32–38 秒淡入第一幕；38–40 秒停留房间并保留轻微环境动画。
- 第一幕采用原图缓慢推镜、屏幕辉光和仅窗区雨雪，不宣称实现图片内人物独立骨骼动画；窄屏完整显示图片。
- 音频由点击开始解锁，五声音阶、柔和和弦、键击和雨声共用播放时间；后台自动暂停，重播停止旧节点避免叠音。
- 最终词表全部采用英文 AI / CI 术语，包含 PROMPT、CONTEXT、AGENT、PIPELINE、BUILD、DEPLOY、ROUTE、RATE LIMIT、ACCESS DENIED 与指定模型名。
- 实现共用 config/intro.ts 中的节奏和词语配置，保证画面与音符同步。采用用户手势解锁的音频时钟作为播放时间。
- 用户验看第一版后要求移除卡片，改为乱飞的律动文字，并将平滑梦幻乐章改为由缓慢到狂躁的节奏。视觉和音频同步修改，约30秒突然收束。
- 最新视觉要求：从逐行书写代码开始，字符、AI/CI 英文术语与音符从终端屏幕飞出，逐渐形成狂躁乐章；画面词语只使用英文，不使用中文词语。终端可保留单一屏幕轮廓，单个术语没有卡片。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/showcase.ts | 增加 intro 模式 | — | Yes |
| 2 | src/render/intro-canvas.ts | 绘制代码输入、英文律动文字、音符与首幕转场 | — | Yes |
| 3 | src/app/intro-audio.ts | 与播放时间同步的合成乐章 | — | Yes |
| 4 | src/ui/intro.css | 全黑舞台与控制界面 | — | Yes |
| 5 | src/app/intro-app.ts | 图片预载、时间轴与播放生命周期 | 2,3,4 | Yes |
| 6 | src/main.ts | 静态导入并分发动画入口 | 1,5 | Yes |
| 7 | index.html | 首页与导航入口 | 1 | Yes |
| 8 | src/config/intro.ts | 共享词语与节奏 | — | Yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Yes |
| npm test | yes | Yes |
| npm run build | yes | Yes |
| 浏览器检查代码/高潮/首幕、暂停恢复、静音、重播、跳过、窄屏 | yes | Yes |

## Results
- 最终代码通过 npm run typecheck、npm test（1471 tests / 303 suites，0 失败）和 npm run build。构建保留大体积 chunk 提示，无构建错误。
- 浏览器已查看代码输入、24 秒英文词语与音符高潮、40 秒完整首幕；播放时间推进、暂停、静音切换、重播归零与跳至首幕正常，375px 窄屏完整显示首幕。浏览器 warn/error 日志为空。
- 未进行主观音频试听或真实后台切换验收；音频时间推进已通过浏览器验证，子代理完成音频调度与节点清理复审，结论 Approved。
- 没有新增视觉自动测试，没有修改 CI，没有提交或推送。当前仓库无 HEAD，按文件清单审查本任务范围。
- 预览入口：/?mode=intro；截图：output/intro-preview/english-code-symphony.png。
