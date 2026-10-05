# PLAN -- 模型版本核实与科幻群星开场

## Status: done
## Task: 063
## Related: 062
## Baseline Commit: 无 HEAD；配置修改前快照位于 $TMPDIR/pelican-model-refresh/。渲染文件快照因同名被配置文件覆盖，渲染审查限于本任务新函数和关联调用修改；更早渲染快照在 $TMPDIR/pelican-intro-finale-before.ts。

## Goal
核实万声归一开场的模型版本，补充知名开放权重模型，并增强下方神经网络的科幻视觉。

## Non-goals
不更新其他历史开场版本、不修改音乐长度和游戏逻辑、不添加依赖、不提交推送。

## Acceptance Criteria
- 模型使用可核实的官方名称；当前代表与历史里程碑区分，开放权重不混同无限制开源许可。
- 开放模型拥有明确版本与可读出场，不再只是三条一闪而过的角落文字。
- 下方神经网络具有纵深、能量汇聚与节拍同步，主标题与操作区保持可读。
- 24 秒序奏、暂停、拖动、重播、目录预览继续共用渲染。

## Constraints
遵循项目层次及视觉人工验收要求，不新增复述模型名字或 Canvas 实现的测试。

## Decisions
- 使用 dev 流程；研究与视觉探索交由当前任务子代理完成。
- 以官方模型页、模型卡或官方仓库核实版本与开放属性，来源记录在本任务中。
- 保留主声部既有历史演进，当前 Gemini 与开放模型代表单独核实。
- 探索与设计结论：原底部二维图缺少纵深，开放模型仅以12px短暂闪现；直接替换同一 Canvas 函数为透视神经核心，九个开放模型分三组在12.5/14/15.5秒出场。无需新增依赖或改变24秒音轨，无需用户裁决的方案分歧。
- 设计复用探索子代理给出的完整函数级方案，未另启架构代理；渲染实现由该代理执行，配置与来源由主代理完成。
- Claude 构建精选节点更新为 Opus 4.5 → Opus 4.8 → Sonnet 5 → Opus 5；升华保留 Mythos 5.1、Opus 5.5，并补 Fable 5.1；这是叙事选段，不是完整模型发布时间表。
- 九个开放模型全名保留；Llama 4 Maverick与Gemma 4 31B使用可读的官方产品名称，其下载仓库精确ID见下方来源。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/intro-models.ts | 已核实的模型名称 | — | yes |
| 2 | src/config/intro-finale.ts | 开放模型出场时间与字幕 | 1 | yes |
| 3 | src/render/intro-finale.ts | 神经计算阵列与模型接力演出 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器画面、暂停/拖动与控制台 | yes | yes |
| core-review + diff-guard | yes | yes |

## Results
- 子代理研究确认九个品牌的准确版本与开放权重属性；视觉代理完成同一 Canvas 内的透视阵列、球形核心、旋转断弧、节拍光束与模型卡片。
- 只读审查无功能阻断，发现窄屏三卡收成单卡时硬切换；唯一修复轮次在切换中点淡出至零后淡入。主代理复核该公式及390×844下16.7/16.9秒画面。
- 浏览器检查12.9/14.4/15.9秒三组型号、20.1秒窄屏高潮与对话避让、22.8秒静默；暂停/拖动正常，控制台无错误或警告。临时viewport已恢复。
- 最终 typecheck 通过；全量测试一次，1501/1501通过（304 suites，约116.4秒）；build通过（4.23秒，仅现有chunk体积提示）。最终opacity小修后仅补跑typecheck再构建，无重复全测。
- 未添加依赖、自动视觉测试、默认兜底或任务外修复；未提交推送。日志位于 $TMPDIR/pelican-model-refresh/，预览位于 $TMPDIR/pelican-open-models.jpg。

## Official Sources

核实日期：2026-10-05。开放权重代表由研究子代理核对官方模型卡；主代理复核主要官方页面。

| 演出名称 | 官方来源 |
|---|---|
| Claude Opus 4.5 / 4.8 / Sonnet 5 / Opus 5 / Opus 5.5 | https://www.anthropic.com/system-cards |
| Claude Fable 5.1 / Mythos 5.1 | https://www.anthropic.com/claude-fable-and-mythos-5-1 |
| Gemini 3.8 Flash | https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash |
| GPT-6 Astra | https://developers.openai.com/api/docs/models/gpt-6-astra |
| DeepSeek-V4.1-Flash | https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash |
| Qwen3.8-2.4T-A95B | https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B |
| GLM-5.3 | https://huggingface.co/zai-org/GLM-5.3 |
| Kimi-K3 | https://huggingface.co/moonshotai/Kimi-K3 |
| MiniMax-M3 | https://huggingface.co/MiniMaxAI/MiniMax-M3 |
| Llama 4 Maverick | https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct |
| Mistral Medium 3.5 | https://docs.mistral.ai/models/mistral-medium-3-5-26-04 |
| Gemma 4 31B | https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/ |
| gpt-oss-120b | https://developers.openai.com/api/docs/models/gpt-oss-120b |

这些模型采用 MIT、Apache 2.0 或各自社区许可证；统一写 OPEN WEIGHTS，不声称全部属于同一种开源许可证。Fable 5.1是一般可用版本，Mythos 5.1采用受信任访问计划，两者均不纳入开放权重阵容。
