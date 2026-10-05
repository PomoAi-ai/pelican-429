# PLAN -- 多路线 AI 协奏序章

## Status: done
## Task: 026
## Related: 022, 023, 024
## Baseline Commit: 无 HEAD，工作目录已有其他场景开发成果

## Goal
将短序章升级为代码构建世界、多模型声部接力、最后音乐自行继续的叙事动画。GPT开场，Claude多段推动编程，Gemini持续展开感官，DeepSeek/Llama/Qwen参与扩散。保留无年份、英文、裸文字、节奏高潮且画面有秩序的要求。

## Non-goals
不批量制作十份近似演示；将已提出方案02/09/10组合为完整版本。不重写既有20秒后的四幕故事，不改变49秒完整故事时长，不提交推送。

## Acceptance Criteria
- 前20秒有代码、语言、编程、多模态与合奏的视觉发展，非中央词语轮播。
- Claude和Gemini各有持续声部与多次主导节点，其他模型有合理位置，无年份或排名宣称。
- 音乐有可辨声部、和谐动机与节奏递进，停键后仍继续的情节与羽毛预兆。
- 已有故事画面、场景跳转、暂停恢复与音频清理正常。
- 静态检查/全量测试/构建通过；浏览器检查关键帧、完整衔接及窄屏。

## Decisions
- 采用 Canvas 2D 与 Web Audio 继续现有表现层，配色/音色为艺术隐喻，不宣称品牌性能排名。
- 主代理完成配置、播放器界面及验收；视觉与配乐由两个实现代理并行完成；探索代理核对新增故事接口。完成后另行审查。
- 既有前奏采用乐谱秒，1.6倍对应真实秒；新声部拍位按真实84到约156BPM设计，后续故事仍用真实秒。
- 统一保留 INTRO_SCENES / INTRO_DURATION 及后续场景常量。现有完整故事比早期25秒版新增，不回退它。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/intro.ts | 多模型节点、声部、代码输入与统一节拍 | Yes |
| src/render/intro-canvas.ts | 构建世界、多声部图形与梦境衔接 | Yes |
| src/app/intro-audio.ts + src/app/intro-score.ts | 三声部音乐和高潮、停止输入后仍播放 | Yes |
| src/app/intro-app.ts | 开始界面、乐段与旁白更新 | Yes |
| src/ui/intro.css | 序章封面与控件细节 | Yes |

## Validation
| Check | Required | Done |
|---|---|---|
| npm run typecheck | yes | Yes |
| npm test | yes | Yes |
| npm run build | yes | Yes |
| browser visual / controls / transition / narrow screen | yes | Yes |

## Exploration and references
- 已核对新增故事渲染/音频接口：drawStory使用真实秒，scheduleStoryAudio host.from/at也使用真实秒。intro-story从intro-canvas导入绘制辅助，重写必须保留导出。
- 复用上一轮架构与已明确的三方案组合，不再重复设计批准；探索代理完成新增故事衔接检查。配置和app初审通过。
- 关键节点仅作为创作主线，无年份、榜单或性能排名：
  - https://www.anthropic.com/news/claude-3-5-sonnet
  - https://www.anthropic.com/news/claude-3-7-sonnet
  - https://www.anthropic.com/news/claude-4
  - https://blog.google/innovation-and-ai/products/google-gemini-next-generation-model-february-2024/
  - https://blog.google/innovation-and-ai/models-and-research/google-deepmind/gemini-model-thinking-updates-march-2025/
  - https://deepseek.com/en/news/deepseek-r1/

## Validation results
- typecheck通过；完整npm test 1471项中1470通过，唯一失败为config中英文window被既有架构正则判作DOM。只将文案改为view，未更改测试规则；受影响architecture.test.ts 21/21复测通过。
- 最终npm run build通过，保留既有大包提示；没有新增运行时依赖。
- 子代理音频复审确认buffer速率/seek采样位置/包络/暂停清理/静音时钟和20秒后故事时间契约无新增问题。
- 浏览器发现两处标题交接和提示行垂直间距问题，已修正并截图复核。宽屏1280x720与窄屏390x844均可读，25秒旧版没有回退覆盖现有49秒故事。
- 未生成新图片或视觉自动测试；音色为原生WebAudio合成，未进行主观试听。

## Delivery
- 浏览器已查看 GPT/Claude/Gemini 关键画面、修正后的自主输入段、羽毛及首幕，连续播放至49秒目标页；重播回到起点、暂停、拖动、静音切换正常，浏览器warn/error日志为空。
- 音画/生命周期最终复审 Approved，无剩余审查问题。
- 预览保留在 /?mode=intro 开始页；横屏证明截图 output/intro-ensemble/claude-world.png。
- 未提交、推送或部署。
