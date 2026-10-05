# PLAN -- AI 发展乐章

## Status: done
## Task: 022
## Related: 018
## Baseline Commit: 无 HEAD，仓库文件未跟踪

## Goal
将序章改为有秩序的 AI 发展乐章，突出 GPT 诞生，以节奏、和声层次与重拍推进高潮；所有演出文字英文。

## Non-goals
不修改后续故事场景、游戏模拟、CI，不提交推送。

## Decisions
- 复用上一任务完整探索结果，文件职责不变，无需重复探索代理。设计已明确为时间节点、固定旋律轨迹和共享节拍，无待批准分歧。
- 0–6 秒终端书写，6–12 秒技术序曲（神经网络、深度学习、2017 Transformer）；12 秒突出 2018 GPT 诞生，随后 GPT-2、GPT-3、ChatGPT、GPT-4、GPT-4o，最后未标年份的创作/编程主题。30 秒结束音乐，32 秒进入原首幕。
- 以 GPT 为主线的节选，不宣称完整 AI 通史。年份以原始论文及 OpenAI 发布资料核对。
- 删除随机词云与异常/路由词，主标题逐一出现；音符沿稳定曲线流动，伴随统一节拍加速。音乐采用和谐旋律、低音、打击层次，删除失谐与三全音。
- 视觉变更人工检查，不添加源码/常量断言类测试。实现由主代理负责视觉配置，子代理负责音乐；复审和命令验证由子代理执行。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/intro.ts | 发展节点与共用节拍 | Yes |
| src/render/intro-canvas.ts | 有序音符、节点与 GPT 诞生重点演出 | Yes |
| src/app/intro-audio.ts | 从 GPT 开始层层推进高潮 | Yes |
| src/app/intro-app.ts | 乐段名称与节点说明 | Yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | Yes |
| npm test | yes | Yes |
| npm run build | yes | Yes |
| 浏览器检查 GPT、高潮、首幕和播放控件 | yes | Yes |

## Results
- npm run typecheck、npm test（1471 tests，303 suites，0 失败）、npm run build 全部通过。构建存在原有 chunk 大小提示。
- 复审子代理 Approved；共享拍位逆函数误差约 7.1e-15 秒，音频 seek/暂停/截止调度无新增问题。
- 浏览器检查 GPT 诞生、高潮、首幕；继续播放时钟推进，暂停/进度定位、静音切换、跳至首幕正常，warn/error 日志为空。已保存 gpt-birth.png 与 ai-crescendo.png。未做主观音频试听。
- 无新增测试或防御兜底，未提交推送。

## Historical references
- Transformer (2017): https://arxiv.org/abs/1706.03762
- GPT (2018): https://openai.com/index/language-unsupervised/
- GPT-2 (2019): https://openai.com/index/better-language-models/
- GPT-3 (2020): https://openai.com/index/language-models-are-few-shot-learners/
- ChatGPT (2022): https://openai.com/index/chatgpt/
- GPT-4 (2023): https://openai.com/index/gpt-4/
- GPT-4o (2024): https://openai.com/index/hello-gpt-4o/
