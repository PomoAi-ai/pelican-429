import { CLAUDE_MODELS } from './intro-models.ts';

/**
 * 序章 0–20.3 秒：120 BPM，每拍 0.5 秒，每小节 2 秒，全部为真实秒。画面与音乐共用这一张时间表。
 *
 * 曲式：动机（0–2.5）→ 前奏（2.5–5）→ 休止 → GPT 诞生（5.5–9）→ 乐团入席与 Claude Opus 4.x 攀升（9–13.5）
 * → GEMINI 3 属和弦 → Claude Mythos 5 升调至 Opus 5.5（14–15）→ GPT-6 ASTRA 第二峰（15）→ 人机接句（16–18）
 * → VIBE CODING 三记重拍（18、18.5、19）→ 硬停（19.25）→ 标题。
 */
export const OVERTURE_BEAT = 0.5;
const SIXTEENTH = OVERTURE_BEAT / 4;
const THIRTY_SECOND = OVERTURE_BEAT / 8;

/** 乐章动机 E–G–A…C 的节奏：两个八分音符、A 保持一拍，再落到主音。开场与 GPT 诞生复用同一节奏。 */
export const MOTIF_OFFSETS = [0, 0.25, 0.5, 1] as const;

/** 黑场里萤火第一次闪亮，同时是动机前的弱起。 */
export const SPARK_BLINK = 0.5;

/** 代码就是乐谱：大写音名落在动机拍点上，其余语法字符以三十二分音符快速引向下一个音。 */
export const CODE_LINE = 'play(E, G, A, C)';
export const CODE_MOTIF_AT = 1;
export const CODE_TIMES = leadIn(CODE_LINE, CODE_MOTIF_AT);
/** 写完后语法字符散去，四个音名按三十二分音符化作音符升起。 */
export const CODE_RISE_AT = 2.125;
export const CODE_RISE_STEP = THIRTY_SECOND;

function leadIn(line: string, at: number): readonly number[] {
  const notes = [...line].flatMap((char, index) => (/[A-G]/.test(char) ? [index] : []));
  if (notes.length !== MOTIF_OFFSETS.length) {
    throw new Error(`intro-overture: CODE_LINE must hold ${MOTIF_OFFSETS.length} note names, got ${notes.length}`);
  }
  const times: number[] = [];
  let previous = -1;
  notes.forEach((index, k) => {
    const noteAt = at + MOTIF_OFFSETS[k]!;
    for (let i = previous + 1; i < index; i++) times[i] = noteAt - (index - i) * THIRTY_SECOND;
    times[index] = noteAt;
    previous = index;
  });
  const last = times[previous]!;
  for (let i = previous + 1; i < line.length; i++) times[i] = last + (i - previous) * THIRTY_SECOND;
  return times;
}

export type PreludeIgnition = 'terminal' | 'drop' | 'pixels' | 'stones' | 'attention';

/** 智能的前奏：每拍一个词，萤火在拍点上触碰点燃；x、y 为舞台比例坐标。 */
export const PRELUDE_WORDS = [
  { text: 'ELIZA', at: 2.5, ignite: 'terminal', x: 0.3, y: 0.42, terms: ['pattern matching'] },
  { text: 'DEEP BLUE', at: 3, ignite: 'drop', x: 0.68, y: 0.36, terms: ['search'] },
  { text: 'ALEXNET', at: 3.5, ignite: 'pixels', x: 0.34, y: 0.62, terms: ['GPU'] },
  { text: 'ALPHAGO', at: 4, ignite: 'stones', x: 0.66, y: 0.62, terms: ['move 37'] },
  { text: 'TRANSFORMER', at: 4.5, ignite: 'attention', x: 0.5, y: 0.47, terms: ['attention', 'tokens'] },
] as const;
/** TRANSFORMER 的注意力弧线：字母下标对，按三十二分音符依次连上。 */
export const ATTENTION_ARCS = [[0, 4], [2, 9], [1, 6], [5, 10], [3, 7]] as const;
export const ATTENTION_STEP = THIRTY_SECOND;
/** 休止一拍，萤火暗下。 */
export const PRELUDE_REST = 5;

/** 人用动机的前三个音敲下半句（E、G、A 落在 c、d、i 上），光标停顿一拍，机器在主音 C 上补完。 */
export const PROMPT_TEXT = 'code is';
export const PROMPT_TIMES = [5.5, 5.625, 5.75, 5.875, 5.9375, 6, 6.125] as const;
export const PROMPT_NOTE_CHARS = [0, 2, 5] as const;
export const CURSOR_AT = 5.5;
export const MACHINE_AT = 6.5;
export const MACHINE_TOKENS = [' music', '.'] as const;
export const MACHINE_STEP = SIXTEENTH;
/** G、P、T 三拍重击（IV–V–I），T 落在小节强拍，鼓组同时进入，萤火分裂成群。 */
export const GPT_HITS = [7, 7.5, 8] as const;
export const GPT_SUBTITLE = 'Generative Pre-trained Transformer';
export const SWARM_AT = 8;

/** 主词：同一时刻只有一个，位于中心；后一个把前一个推出画面。 */
export const OVERTURE_MAINS = [
  { text: 'CHATGPT', at: 9, entry: 'stream', terms: ['RLHF'] },
  { text: 'GPT-4', at: 9.5, entry: 'slam', terms: ['multimodal'] },
  { text: 'DEEPSEEK-R1', at: 10, entry: 'sonar', terms: ['reasoning'] },
  { text: CLAUDE_MODELS.opus4, at: 10.5, entry: 'bloom', terms: ['agents'] },
  { text: 'GEMINI 3', at: 13.5, entry: 'twins', terms: ['long context'] },
  { text: CLAUDE_MODELS.mythos5, at: 14, entry: 'ascend', terms: [] },
  { text: 'GPT-6 ASTRA', at: 15, entry: 'constellation', terms: [] },
] as const;

/** Claude Opus 4 之后逐拍上行的版本，音乐上是一段上行音阶。 */
export const CLAUDE_CLIMB = [
  { text: 'Opus 4.1', at: 11 },
  { text: 'Opus 4.5', at: 11.5 },
  { text: 'Opus 4.6', at: 12 },
  { text: 'Opus 4.7', at: 12.5 },
  { text: 'Opus 4.8', at: 13 },
] as const;
/** Mythos 到 Opus 的升华段：全曲从 C 大调升到 D 大调。 */
export const KEY_CHANGE_AT = 14;
export const CLAUDE_ASCENT_SUBTITLE = { text: 'BEYOND THE KNOWN', at: 14.25 } as const;
export const CLAUDE_ASCENT_MODELS = [
  { text: CLAUDE_MODELS.mythos51, at: 14.5 },
  { text: CLAUDE_MODELS.opus55, at: 14.75 },
] as const;
/** 萤火群在 Claude 升华段升上高处，ASTRA 前一个八分音符飞向星位，拍点上拼成星座。 */
export const SKY_RISE_AT = KEY_CHANGE_AT;
export const STARS_GATHER_AT = 14.75;
export const ASTRA_AT = 15;

export type VoiceFamily = 'language' | 'image' | 'code';

/** 次要声部：小号字，各由一只新萤火带出，大致按时间先后，落在主词之间的反拍上。 */
export const OVERTURE_VOICES = [
  { text: 'BERT', at: 8.25, family: 'language' },
  { text: 'GPT-2', at: 8.5, family: 'language' },
  { text: 'GPT-3', at: 8.75, family: 'language' },
  { text: 'DALL·E', at: 9.25, family: 'image' },
  { text: 'COPILOT', at: 9.75, family: 'code' },
  { text: 'STABLE DIFFUSION', at: 10.25, family: 'image' },
  { text: 'MIDJOURNEY', at: 10.75, family: 'image' },
  { text: 'LLAMA', at: 11.25, family: 'language' },
  { text: 'GPT-4o', at: 11.75, family: 'language' },
  { text: 'o1', at: 12.25, family: 'language' },
  { text: 'QWEN', at: 12.75, family: 'language' },
  { text: 'GPT-5', at: 13.25, family: 'language' },
  { text: 'KIMI', at: 13.75, family: 'language' },
] as const;

/** CI 当作鼓机：小词落在十六分音符的弱位，从画面边缘飞出；升华与星空段落保持干净。 */
export const CI_WORDS = [
  { text: 'git push', at: 8.375 },
  { text: 'build ✓', at: 8.875 },
  { text: 'lint ✓', at: 9.375 },
  { text: 'test ✓', at: 9.875 },
  { text: 'CI', at: 10.375 },
  { text: 'merge', at: 10.875 },
  { text: 'deploy ✓', at: 11.375 },
  { text: 'PR #429', at: 11.875 },
  { text: 'review ✓', at: 12.375 },
  { text: 'build ✓', at: 12.875 },
  { text: 'test ✓', at: 13.375 },
  { text: 'git push', at: 16.375 },
  { text: 'CI', at: 16.875 },
  { text: 'test ✓', at: 17.375 },
  { text: 'merge', at: 17.625 },
  { text: 'deploy ✓', at: 17.875 },
] as const;

/** 人与 AI 交替接句：每轮从两拍缩到一拍、半拍，最后在 18 秒齐奏。 */
export const DUET_AT = 16;
export const DUET_LINES = [
  { who: 'human', text: 'world = new Island()', at: 16 },
  { who: 'ai', text: 'island.grow(grass)', at: 16.5 },
  { who: 'human', text: 'add(pelican)', at: 17 },
  { who: 'ai', text: 'pelican.fly()', at: 17.25 },
  { who: 'human', text: 'test()', at: 17.5 },
  { who: 'ai', text: '✓ pass', at: 17.625 },
  { who: 'human', text: 'ship()', at: 17.75 },
  { who: 'ai', text: '✓ live', at: 17.875 },
] as const;
/** 人与 AI 的萤火从各自的相位逐渐同步，18 秒起完全齐闪。 */
export const SYNC_FROM = DUET_AT;
export const SYNC_AT = 18;

/** 三记齐奏重拍：VIBE（人，青色）、CODING（AI，金色）、整句。 */
export const TUTTI_HITS = [18, 18.5, 19] as const;
export const TUTTI_WORDS = ['VIBE', 'CODING'] as const;
/** 萤火群塌缩成一点，音乐硬停。 */
export const OVERTURE_CUT = 19.25;
export const OVERTURE_TITLE = { text: 'GRASSY', subtitle: 'A NIGHT OF RAIN & SNOW', at: 19.4 } as const;
/** 序章总长（真实秒），标题淡出后交给下一段。 */
export const OVERTURE_DURATION = 20.3;

export interface DrumHit {
  readonly at: number;
  readonly accent: number;
}

/** 按小节内位置取力度（0 表示不击打）；小节从偶数秒开始。 */
function pattern(from: number, to: number, step: number, accents: readonly number[]): DrumHit[] {
  const hits: DrumHit[] = [];
  for (let at = from; at < to; at += step) {
    const accent = accents[Math.round((at % 2) / step) % accents.length]!;
    if (accent > 0) hits.push({ at, accent });
  }
  return hits;
}

// 乐团段（八分音符网格）：kick 在 1、2 拍后半和 3 拍，snare 在 2、4 拍，反拍 hat 更重。
const KICK_GROOVE = [1, 0, 0, 0.7, 0.85, 0, 0, 0];
const SNARE_GROOVE = [0, 0, 0.8, 0, 0, 0, 0.95, 0];
const HAT_GROOVE = [0.45, 0.8, 0.45, 0.8, 0.45, 0.8, 0.45, 0.8];
// 接句段（十六分音符网格）：四拍 kick，snare 从 2、4 拍滚成十六分音符渐强。
const KICK_BUILD = [1, 0, 0, 0, 0.8, 0, 0, 0, 0.9, 0, 0, 0, 0.85, 0, 0, 0];
const SNARE_BUILD = [0, 0, 0, 0, 0.7, 0, 0, 0, 0.6, 0, 0.7, 0, 0.75, 0.8, 0.9, 1];
const HAT_BUILD = [0.5, 0.25, 0.7, 0.25, 0.5, 0.25, 0.7, 0.25, 0.5, 0.3, 0.7, 0.3, 0.55, 0.35, 0.75, 0.4];
const SOFT_HAT = [0.3, 0.2];

export const OVERTURE_KICKS: readonly DrumHit[] = [
  ...pattern(SWARM_AT + 0.25, KEY_CHANGE_AT, 0.25, KICK_GROOVE),
  ...pattern(DUET_AT, SYNC_AT, SIXTEENTH, KICK_BUILD),
];
export const OVERTURE_SNARES: readonly DrumHit[] = [
  ...pattern(SWARM_AT + 0.25, KEY_CHANGE_AT, 0.25, SNARE_GROOVE),
  { at: DUET_AT - 2 * SIXTEENTH, accent: 0.5 },
  { at: DUET_AT - SIXTEENTH, accent: 0.7 },
  ...pattern(DUET_AT, SYNC_AT, SIXTEENTH, SNARE_BUILD),
];
// Claude Opus 4.x 攀升的后半段 hat 加密到十六分音符；升华段只留轻 hat，星空段完全去掉鼓。
export const OVERTURE_HATS: readonly DrumHit[] = [
  ...pattern(SWARM_AT + 0.25, 12, 0.25, HAT_GROOVE),
  ...pattern(12, KEY_CHANGE_AT, SIXTEENTH, HAT_BUILD),
  ...pattern(KEY_CHANGE_AT, ASTRA_AT, 0.25, SOFT_HAT),
  ...pattern(DUET_AT, SYNC_AT, SIXTEENTH, HAT_BUILD),
  { at: TUTTI_HITS[0] + 0.25, accent: 0.6 },
  { at: TUTTI_HITS[1] + 0.25, accent: 0.6 },
];
