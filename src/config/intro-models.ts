/** 具体型号保留系列名；来源记录见 task 中的模型名称核实记录。 */
export const CLAUDE_MODELS = {
  sonnet35: 'Claude 3.5 Sonnet',
  sonnet37: 'Claude 3.7 Sonnet',
  opus4: 'Claude Opus 4',
  opus41: 'Claude Opus 4.1',
  opus45: 'Claude Opus 4.5',
  opus46: 'Claude Opus 4.6',
  opus47: 'Claude Opus 4.7',
  opus48: 'Claude Opus 4.8',
  opus5: 'Claude Opus 5',
  fable51: 'Claude Fable 5.1',
  mythos5: 'Claude Mythos 5',
  mythos51: 'Claude Mythos 5.1',
  opus55: 'Claude Opus 5.5',
} as const;

/** 当前演出选用的已发布型号；官方核实来源记录于任务文档，不表示能力排名。 */
export const FINALE_MODELS = {
  gemini: 'Gemini 3.8 Flash',
  gpt: 'GPT-6 Astra',
} as const;

/** 各型号许可证不同，因此演出统一标注开放权重。 */
export const OPEN_WEIGHT_MODELS = [
  'DeepSeek-V4.1-Flash', 'Qwen3.8-2.4T-A95B', 'GLM-5.3',
  'Kimi-K3', 'MiniMax-M3', 'Llama 4 Maverick',
  'Mistral Medium 3.5', 'Gemma 4 31B', 'gpt-oss-120b',
] as const;

/** 旧版各声部共用精选节点，进度为各自序奏的比例；不表示全行业发布时间排序。 */
export function claudeMilestoneAt(progress: number): string {
  if (progress < .34) return CLAUDE_MODELS.sonnet35;
  if (progress < .42) return CLAUDE_MODELS.opus45;
  if (progress < .54) return CLAUDE_MODELS.opus46;
  if (progress < .64) return CLAUDE_MODELS.opus48;
  if (progress < .71) return CLAUDE_MODELS.mythos51;
  return CLAUDE_MODELS.opus55;
}
