# PLAN -- 第十二套终版乐章

## Status: done
## Task: 028
## Related: 027
## Baseline Commit: 无 HEAD

## Goal
把既有开局中最有表现力的元素穿插为独立第12套，形成统一动机、发展、双峰高潮与收束的完整乐章，并接入已完成的第一章故事。

## Acceptance Criteria
- 独立URL与显著入口，编号12，保留已有版本。
- 融合元素有因果和连续的视觉主线，动画可任意拖动恢复。
- GPT诞生、Claude 4.x至5升华、Gemini3、ASTRA金色峰顶、人AI合奏与收束清晰可读；音乐和画面共用时刻。
- 使用英文演出、无年份/文字卡片，高潮通过节拍与力度推进。
- 最后接雨雪夜及共享降级/封号反转，保留暂停、重播、静音与场景跳转。

## Constraints
- 复用已确认图片和现有音源/播放器，不新增运行时依赖。
- 另方正在制作的第11套intro-overture保持独立，不修改其文件或跨会话联系。
- 不提交或推送。仓库无HEAD，按明确文件范围审查。

## Decisions
- 按用户语境将“12”解释为独立第12套终版，而非重做12个新方案；直接推进可回退实现。
- 使用dev流程，探索/设计由子代理完成，音轨独立模块与播放器共用调度基础。
- 探索与架构设计已完成，用户需求可直接裁决无停止条件；选定24秒/120BPM四音E–G–A–C动机，光线从代码→谱线→图纸→潮波→星轨→显示器。
- 音画共用真实秒时刻：GPT3.5/4/4.5，问答5.25/6，Claude构建7.5–12，Gemini感知12–16.5，Claude5升调16.5，ASTRA第二峰18.5，接句19.5–20.5，齐奏21/21.5/22，静默22.5–23，23–24进入房间。
- 独立演奏接口复用原音源/包络/seek逻辑；终版单独安排曲式，休止同时切断干声、混响和环境声。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/intro-finale.ts | 音画共用时间表与字幕 | Yes |
| src/render/intro-finale.ts + intro-finale-geometry.ts | 连续主线与各段画面 | Yes |
| src/app/intro-finale-score.ts | 独立24秒完整曲式 | Yes |
| src/config/intro-editions.ts + src/render/intro-editions.ts | 第12套入口与分发 | Yes |
| src/app/intro-score.ts + intro-audio.ts | 演奏接口/转调/静默/故事衔接 | Yes |
| src/app/intro-app.ts + intro-gallery.ts + src/ui/intro.css | 终版封面、显著入口与目录 | Yes |

## Validation
| Check | Required | Done |
|---|---|---|
| npm run typecheck | yes | Yes |
| npm test | yes | Yes（1478 tests / 303 suites，全部通过） |
| npm run build | yes | Yes（既有大包体积提示） |
| 浏览器关键拍点/宽窄屏/暂停拖动恢复/共享故事衔接 | yes | Yes |

## Review
- 子代理只读审查通过；临时 Web Audio 边界模拟覆盖 92 个播放起点，包含旧十套，音高/采样偏移/暂停计时有效，22.5–23 秒三条音频总线全静默。
- 浏览器在 390×844、默认 776×985、1440×900 检查代码、GPT、Claude 构建、Gemini、多声部、双峰、齐奏、停拍、房间衔接与第二幕；修正宽屏桌腿与代码字幕重叠后复查通过。
- 实测暂停、继续、重播、静音、场景跳转和目标入口；旧 dialogue 版仍正常起播和进入共享剧情。没有新增视觉自动测试，未主观试听音频。
- 全量测试日志：$TMPDIR/pelican-finale-tests.log；构建日志：$TMPDIR/pelican-finale-build.log。未提交或推送。
