# PLAN -- 十套完整开局

## Status: done
## Task: 027
## Related: 026
## Baseline Commit: 无 HEAD

## Goal
实现十套独立可选择、可打开、可播放的开局，分别设计开头、视觉叙事、配色、配乐、节奏、时长与进入Grassy故事的转场。不能再合并成一个方案。

## Decisions
- 入口 ?mode=intro 展示十套选择目录；每套有独立URL ?mode=intro&opening=<id>。
- 十套分别为旋律接力、代码创世、终端爵士、光标接力、思想潮汐、编译交响、群星、问答、赋格、梦境失控；画面机制分别实现，不以换色冒充新方案。
- 三名实现代理分别负责3/3/4套Canvas表现；主代理负责共用目录/播放时间换算/音轨分型/集成。
- 复用四张已确认人物与场景图；每套前奏时长独立，后续故事整体平移保持既有音画同步。保留暂停/重播/静音/场景跳转。
- 演出词语英文、无年份；不固定黑屏、单一终端、同一版式或同一乐曲。选择目录使用中文说明方便比较。
- 渲染和UI浏览器验收，不写字面值/源码匹配测试。变更时间映射需验证来回跳转与状态边界。
- 第二幕按新要求表现：金色gpt6-astra（故事25.5）→路由/乱码（27）→gpt5.6luna→降智/乱码（28.5）→gpt4omini→完整空拍（30–30.5）→封号重击（30.5）→眩晕（31）。每次降级配下行滑音。
- 十套高潮均以各自构图建立GPT-6 ASTRA金色峰顶；后续参考增强Claude 4.x→Claude 5与Gemini 3的段落。参考文本中的萤火开局为外部并行工作，不覆盖本任务十套。
- 失控概念图内嵌了封号与模型名字，封号前使用正常房间底图加失真，避免提前泄露反转；封号当拍才切入失控图。
- 配乐分为独立编排：三声部赋格、问答留白、海潮呼吸、星系复节奏、爵士walking bass、梦境停键后自奏等，不只改变同一曲子的音色。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/intro-editions.ts | 十套目录与时长/音乐参数 | Yes |
| src/render/intro-edition-shared.ts | 真实预览共用绘制工具 | Yes |
| src/render/intro-editions-a.ts | 旋律接力/代码创世/终端爵士 | Yes |
| src/render/intro-editions-b.ts | 光标接力/思想潮汐/编译交响 | Yes |
| src/render/intro-editions-c.ts | 群星/问答/赋格/梦境失控 | Yes |
| src/render/intro-editions.ts | 版本分发与故事衔接 | Yes |
| src/app/intro-gallery.ts | 十套真实缩略图及选择入口 | Yes |
| src/app/intro-app.ts | 单套封面/时长/播放集成 | Yes |
| src/app/intro-audio.ts + intro-score.ts | 各套节奏/动机/配器/音画换算 | Yes |
| src/ui/intro.css | 目录与十套独立封面 | Yes |
| src/config/intro.ts + src/render/intro-story.ts + src/app/intro-story-audio.ts | ASTRA两次降级/空拍/封号反转 | Yes |

## Validation
| Check | Required | Done |
|---|---|---|
| npm run typecheck | yes | Pass，最终整仓检查通过；intro-app完整依赖链范围检查亦通过 |
| npm test | yes | Pass，1471 tests / 303 suites，0失败/跳过/取消，54.547s |
| npm run build | yes | Pass，最终300模块；保留既有大包体积提示 |
| 十套独立打开、抽取代表帧、播放/回退/转场/窄屏 | yes | Pass，逐套实测起播/暂停/转调后继续/第一幕跳转；10套高潮代表帧、第二幕5阶段和结尾目标已看；390px目录10项无横向溢出 |

## Review
- 三名实现/复核代理完成不同renderer、独立编排、故事反转与只读审查，结论Approved，未发现实质回归。
- 临时内存验证70份音频调度、4134音源启动、90个跨转调点长音：时刻/缓冲偏移合法且升调正确；未增加视觉/常量/源码匹配测试。
- 最终模型标签/升调修改后复查typecheck/build，未重复已经通过且与这次渲染音频改动无关联用例的全量测试。
- 外部并行intro-overture首次有类型错误，最终已由其工作方修正；本任务未改该文件。
- 浏览器演出与控件已验收；音频检验覆盖调度与实际起播，未以技术验证代替主观试听评判。
- 预览截图：output/intro-preview/ten-openings/gallery.png、account-ban.png。
