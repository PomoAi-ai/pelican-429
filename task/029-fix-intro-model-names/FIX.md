# FIX -- 序章模型名称与 Claude 里程碑

## Status: done
## Task: 029
## Related: 028, 027, 024
## Baseline Commit: 无 HEAD；相关文件快照位于 $TMPDIR/pelican-model-names-before

## Problem
序章把具体型号省略成 Claude 4.x / Claude 5，将 Fable、Mythos 与 Opus 系列混在一起，遗漏 Opus 4.6，并未以用户指定的 Opus 5.5 结束 Claude 段落。

## Root Cause
src/render/intro-finale.ts 的 CLIMB、ascension，以及各套开局的独立文字列表没有按一手发布记录核实，也没有共用准确型号名称。

## Decisions
- 以 Anthropic 官方发布页核实具体系列与版本。保留无年份演出；选择里程碑，不穷举所有型号。
- Claude 3.5 Sonnet、Claude Opus 4.5、Claude Opus 4.6、Claude Opus 4.8 构成终版构建主线。
- Claude Mythos 5.1 与 Claude Fable 5.1 是同一个底层模型的不同防护/提供形式；不能写成泛称 Claude 5，也不能表达成 Fable 升级为 Mythos。
- 16.5 秒明确显示 Claude Mythos 5.1，17.5 秒切入 Claude Opus 5.5，18.5 秒保留 ASTRA 剧情伏笔；音乐总长不变。
- Opus 5.5 是用户选择的 Claude 段落压轴，不宣称它是截至今日最后发布的 Claude 型号（Sonnet 5.5 已发布）。
- 修正本地各套序章同类名称；不联系其他会话，不调整其他游戏功能。不为文案写字符串断言测试。

## Official Sources
- https://www.anthropic.com/news/claude-3-5-sonnet
- https://www.anthropic.com/news/claude-opus-4-5
- https://www.anthropic.com/news/claude-opus-4-6
- https://www.anthropic.com/news/claude-opus-4-8
- https://www.anthropic.com/news/claude-fable-5-mythos-5
- https://www.anthropic.com/claude-fable-and-mythos-5-1
- https://www.anthropic.com/claude-opus-5-5
- https://www.anthropic.com/claude-sonnet-5-5
- https://openai.com/index/gpt-6-astra/
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/models/gpt-4o-mini
- https://blog.google/products-and-platforms/products/gemini/gemini-3-collection/
- https://api-docs.deepseek.com/news/news250120/

## Fix Plan
- [x] 统一具体型号名称，修正终版主画面与字幕。
- [x] 同步各套开局，补入 Opus 4.6、Mythos、Opus 5.5，检查完整名称可读性。
- [x] 浏览器核对终版与旧版关键时刻。

## Verification
- [x] npm run typecheck
- [x] npm test（1479 tests / 303 suites，全部通过）
- [x] npm run build（保留既有大包体积提示）
- [x] diff-guard（子代理核对快照差异、来源和音频索引，通过）
- [x] Bug is fixed

## Results
- 1280×720 与 390×844 实际检查终版 10.4 秒 Opus 4.6、16.9 秒 Mythos 5.1、17.9 秒 Opus 5.5，画面与辅助字幕一致。
- 窄屏复查 melody 三列、compiler 标题、dream 终端长名称；完整型号没有越界。已恢复浏览器默认尺寸。
- 萤火序章本轮校正源文件及类型检查；该方案尚未接入当前目录，未宣称已做其浏览器验收。
- INTRO_WORDS 原 9 个节点及所有时刻保持不变，原配乐固定索引不受名称修改影响；未新增文案断言测试。
- 日志：$TMPDIR/pelican-model-names-tests.log、$TMPDIR/pelican-model-names-build.log。未提交、推送。
