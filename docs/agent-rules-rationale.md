# AGENTS.md 规则的依据

本文写给维护者，说明 `AGENTS.md`、`docs/coding-guidelines.md` 和 `docs/testing-guidelines.md` 为什么这样写。AGENTS.md 不引用本文，模型不需要读它。

调研时间：2026-10。对象：GPT-6 Astra（Codex）在本仓库中的两种倾向，一是防御式编程，二是写过多测试、做过多验证。

## 1. 问题来源

- **官方已确认会过度测试。** OpenAI 的 GPT-6 指南写道：“For coding tasks, the model tends to be thorough in testing before considering a task complete. For smaller tasks, this can result in broader tests than the task requires.” 来源：https://developers.openai.com/api/docs/guides/latest-model
- **旧提示会放大问题。** 官方博客指出：以前的模型需要提醒才会去跑测试，Astra 自己就会跑；如果继续保留“要跑测试”的指令，就会导致不必要的测试。同一篇文章还提到，措辞强硬的边界语言会被 Astra 过度执行。来源：https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra
- **Astra 对 AGENTS.md 更敏感。** 相互冲突或含糊的指令会让它提前停下，或者花推理去调和这些指令。来源：同上 latest-model 指南。
- **吞异常的成因。** HN 上普遍认为，RL 训练按“通过测试”给奖励，吞掉异常偶尔能多拿分，却很少被扣分，Karpathy 将其形容为 “mortally terrified of exceptions”。来源：https://news.ycombinator.com/item?id=45530486 、https://news.ycombinator.com/item?id=46736969
- **已失效的需求被当成永久约束。** OpenAI 社区有人反馈：被取代的旧需求被保留成负面约束，进而长出多余的校验、兼容层和回归测试。来源：https://community.openai.com/t/codex-gpt-5-6-sol-retains-superseded-requirements-as-negative-constraints-causing-project-bloat/1388093
- **AGENTS.md 越长越不好。** ETH 的研究发现，冗长或不必要的要求会让 agent 跑更多测试，成本上升 20% 以上，成功率下降。来源：https://arxiv.org/abs/2602.11988

## 2. 采用的做法与对应规则

| 做法 | 来源 | 本仓库的落地位置 |
|------|------|------------------|
| 不为“可逆、低影响、测试只复述实现”的改动写测试；测试通过后，只有出现新改动或新疑点才扩大范围 | OpenAI latest-model 指南 | AGENTS.md “测试”“验证” |
| 禁止宽泛的 catch 和看似成功的兜底（原文 “No broad catches or silent defaults … success-shaped fallbacks”） | OpenAI Codex prompting guide（openai-cookbook） | AGENTS.md “编码” |
| 文档按场景引用（“涉及 X 时参考 Y”），不要求每次改动前通读 | Astra 博客 | AGENTS.md 中对 docs/ 的引用方式 |
| 明确授权运行本地测试，不必逐步请示 | Astra 博客 | AGENTS.md “命令” |
| 声明本文件在测试范围上优先于通用 skill，消除指令冲突 | latest-model 指南 | AGENTS.md 开头 |
| 规则附上理由；使用正反例；语气平实，不用全大写 | Astra 博客、GPT-5 prompting guide、https://rulestack.hashnode.dev/agents-md-how-to-write-the-one-rules-file-most-coding-agents-now-read | 全部文档 |
| 不保留兼容层或 fallback 路径来替代完整迁移 | https://raw.githubusercontent.com/managedcode/MCAF/main/docs/templates/AGENTS.md | AGENTS.md “编码” |
| 测试范围按改动大小分级，全量测试只在改公共模块时运行 | https://codex.danielvaughan.com/2026/06/05/why-always-run-tests-agents-md-makes-things-worse/ | testing-guidelines §5 |
| 声明历史任务文档不构成当前约束 | 上述 OpenAI 社区帖 | AGENTS.md “目录与分层” |

## 3. 有人反馈无效的做法（本仓库刻意避免）

- **罗列十几条 “Do not …”。** 有人反馈模型读了之后照样违反。所以本仓库的规则尽量写成“应该怎么做”，并说明理由；反例放在 docs/ 里，配上具体代码。
- **“Always run tests”/强制 TDD 流程。** 有研究观察到这会提高回归率。
- **全大写、强硬措辞。** 在 GPT-5 和 Astra 上会导致过度执行。

## 4. 可选的工具化兜底（尚未实施）

仅靠文档不能完全约束模型行为。下面两项需要新增依赖或改动配置，是否实施由用户决定：

- **ESLint `@typescript-eslint/no-unnecessary-condition`。** 能自动标出类型已经排除的 `?.`、`??` 和恒真判断，参考 https://github.com/tupe12334/eslint-config-agent/issues/351 。按 CI 规则，它只能作为静态检查加入，不能执行测试。
- **变异测试（Stryker）。** 一个变异体都杀不掉的测试可以考虑删除，参考 https://tianpan.co/blog/2026/05/17/test-agent-wrote-that-tests-nothing 。适合在开发机上偶尔手工运行一次，用来清理存量测试。

## 5. 维护

每次换模型，或者发现 AGENTS.md 里的某条规则已经不再需要时，删掉它，不要只追加。也可以让模型对照本文审计 AGENTS.md。
