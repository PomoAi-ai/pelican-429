import type { IntroLanguage } from './intro-language.ts';
import { CLAUDE_MODELS, FINALE_MODELS, OPEN_WEIGHT_MODELS } from './intro-models.ts';

/**
 * 降智风暴序章：120 BPM、四拍一小节、共十六小节，音画共读真实秒拍点。
 * 四幕各四小节：点火（0–8）、攀升（8–16）、风暴（16–24）、高潮（24–32）。
 */
export const FINALE_DURATION = 32;
export const FINALE_SCORE_RATE = 32 / FINALE_DURATION;
export const FINALE_CUES = {
  spark: 0.5,
  motif: [1, 1.5, 2, 2.5],
  /** 敲完代码按下回车：四个音名随之飞出变成音符。 */
  run: 2.75,
  birth: [3.5, 4, 4.5],
  question: 5.25,
  answer: 6,
  build: 7.5,
  claudeClimb: [8, 9, 10, 11],
  senses: 12,
  /** AGI 进度停在 99%，全场屏息半秒。 */
  brink: 15.5,
  storm: 16,
  /** 四道闪电：429 限流、改路由、降智、断连。 */
  strikes: [16, 17, 18, 19],
  collapse: 20,
  blackout: 21.5,
  /** 黑暗里人重新敲下 E、G、A、C。 */
  retry: [22, 22.5, 23, 23.5],
  /** 重敲完再按一次回车，半拍后升调爆发。 */
  rerun: 23.75,
  rise: 24,
  opus: 25,
  astra: 26,
  duet: [27, 27.5, 27.75, 28],
  tutti: [28.5, 29, 29.5],
  silence: 30.5,
  room: 31,
  end: FINALE_DURATION,
} as const;

/** 开场与重敲是同一行代码：四个音名的按键分别落在给定拍点上，其余字符按固定间隔在拍点之间补齐。画面与键盘声共用这份时间。 */
export const FINALE_CODE = 'play(E, G, A, C)';
export const FINALE_NOTE_KEYS: readonly number[] = [5, 8, 11, 14];
const keystrokes = (noteTimes: readonly number[], gap: number): readonly number[] => [...FINALE_CODE].map((_, i) => {
  const next = FINALE_NOTE_KEYS.findIndex((index) => index >= i);
  return next >= 0 ? noteTimes[next]! - (FINALE_NOTE_KEYS[next]! - i) * gap : noteTimes[3]! + (i - FINALE_NOTE_KEYS[3]!) * gap;
});
/** 人的提问在画面上逐字打出所用的秒数，键声按同样的速度连敲。 */
export const FINALE_QUESTION_TYPING = .6;
export const FINALE_CODE_TIMES = keystrokes(FINALE_CUES.motif, .07);
export const FINALE_RETRY_TIMES = keystrokes(FINALE_CUES.retry, .05);

export interface LineageEntry {
  readonly at: number;
  readonly name: string;
  readonly year: string;
  /** 主旋律比里程碑更重：音符、名字、铃声与停留时间都随分量变化。 */
  readonly role: 'theme' | 'milestone';
  /** 落在主谱线的第几段水平线（共五段）；主旋律各占一段。 */
  readonly bar: 0 | 1 | 2 | 3 | 4;
  readonly open?: true;
  /** 只写在刷新上下文纪录的型号上。 */
  readonly tokens?: number;
}

export const LINEAGE_WEIGHT = { theme: 3, milestone: 2 } as const;

/**
 * 模型谱系，按官方发布日期从左到右跳上主谱线。
 * 主旋律：Claude Opus 4（2025-05）、GPT-6 Astra（2026-09-03）、Claude Opus 5.5（2026-09-22），各占一小节；
 * 里程碑：GPT-3、ChatGPT、GPT-4 落在 G·P·T 三记重拍上，Claude 3.5 Sonnet 跟进；o1 与 o3 作为同一条推理线同拍落下，DeepSeek-R1 紧随其后。
 * 上下文纪录：2,048 → 4,096 → 32K（gpt-4-32k）→ 200K → 1.05M。
 */
export const FINALE_LINEAGE: readonly LineageEntry[] = [
  { at: FINALE_CUES.birth[0], name: 'GPT-3', year: '2020', role: 'milestone', bar: 0, tokens: 2048 },
  { at: FINALE_CUES.birth[1], name: 'ChatGPT', year: '2022', role: 'milestone', bar: 0, tokens: 4096 },
  { at: FINALE_CUES.birth[2], name: 'GPT-4', year: '2023', role: 'milestone', bar: 0, tokens: 32768 },
  { at: FINALE_CUES.claudeClimb[0], name: CLAUDE_MODELS.sonnet35, year: '2024', role: 'milestone', bar: 1, tokens: 200000 },
  { at: 8.5, name: 'o1 · o3', year: '2024–25', role: 'milestone', bar: 1 },
  { at: 9.5, name: 'DeepSeek-R1', year: '2025', role: 'milestone', bar: 1, open: true },
  { at: FINALE_CUES.claudeClimb[2], name: CLAUDE_MODELS.opus4, year: '2025', role: 'theme', bar: 2 },
  { at: FINALE_CUES.senses, name: FINALE_MODELS.gpt, year: '2026', role: 'theme', bar: 3, tokens: 1050000 },
  { at: FINALE_CUES.brink - 3 * .5, name: CLAUDE_MODELS.opus55, year: '2026', role: 'theme', bar: 4 },
];
/** 依次刷新的上下文纪录：谱系里一路跳高，风暴里一级级倒退，高潮时再一口气跳回最高。 */
export const FINALE_TOKEN_RECORDS = FINALE_LINEAGE.flatMap(({ tokens }) => tokens === undefined ? [] : [tokens]);
export const tokenLabel = (tokens: number): string =>
  tokens < 1e5 ? `${Math.round(tokens / 1024)}K` : tokens < 1e6 ? `${tokens / 1e3}K` : `${tokens / 1e6}M`;
/**
 * 暗线：第二声部挂的是社区在 GPT-6 发布后的降智事件里抓到的原始字段，只上原文，不加解释。
 * 响应头 x-codex-turn-state 长 292 是满血票、长 312 是降智信号；被降智时报错里漏出带 degrade2 的内部引擎名；
 * 网关 v0.2.6 合入采票注入后两小时内撤回。
 * u 是它在第二声部上的位置，避开主旋律名字所在的段和正中的雷击大字。
 */
export interface UndertoneEntry {
  readonly at: number;
  readonly text: string;
  /** 伏笔在攀升后半悄悄爬上谱；罪证被闪电砸上谱、随谱带坠落；翻转在高潮落成满血。 */
  readonly act: 'omen' | 'strike' | 'flip';
  readonly u: number;
}

export const FINALE_UNDERTONE: readonly UndertoneEntry[] = [
  { at: FINALE_CUES.senses + .5, text: 'x-codex-turn-state', act: 'omen', u: .1 },
  { at: FINALE_CUES.senses + 1.25, text: 'gAAAAA…', act: 'omen', u: .24 },
  { at: FINALE_CUES.senses + 2, text: 'len=292', act: 'omen', u: .38 },
  { at: FINALE_CUES.strikes[0], text: 'server_is_overloaded', act: 'strike', u: .16 },
  { at: FINALE_CUES.strikes[1], text: 'astra → luna', act: 'strike', u: .84 },
  { at: FINALE_CUES.strikes[2], text: 'len=312', act: 'strike', u: .3 },
  { at: FINALE_CUES.strikes[3], text: '…-degrade2-luna-1p-codexswic-ev3', act: 'strike', u: .7 },
  { at: FINALE_CUES.collapse, text: 'v0.2.6 → 404', act: 'strike', u: .5 },
  { at: FINALE_CUES.rise, text: '312 → 292 ✓', act: 'flip', u: .3 },
  { at: FINALE_CUES.opus, text: 'luna → astra ✓', act: 'flip', u: .7 },
];
/** 黑场里重敲的四个音名各打出一行采票日志，与 FINALE_CUES.retry 一一对应。 */
export const FINALE_HARVEST_LOG = ['harvest', 'len=292 ✓', 'ttl 3600', 'inject'] as const;

/** 攀升四个重拍上的 Claude：3.5 Sonnet（编程拐点）、3.7 Sonnet（混合推理，随 Claude Code 预览）、Opus 4（Claude Code 正式版）、Opus 4.5。 */
export const FINALE_CLAUDE_CLIMB = [CLAUDE_MODELS.sonnet35, CLAUDE_MODELS.sonnet37, CLAUDE_MODELS.opus4, CLAUDE_MODELS.opus45];
export const FINALE_OPEN_MODELS = OPEN_WEIGHT_MODELS.map((name, index) => ({
  name, at: FINALE_CUES.senses + .5 + Math.floor(index / 3),
}));

const FIRST_TOKENS = tokenLabel(FINALE_TOKEN_RECORDS[0]!);
const TOP_TOKENS = tokenLabel(FINALE_TOKEN_RECORDS.at(-1)!);

export function finaleChapterAt(seconds: number, language: IntroLanguage = 'zh'): { phase: string; caption: string } {
  const C = FINALE_CUES;
  const climb = FINALE_CLAUDE_CLIMB;
  if (language === 'en') {
    if (seconds < C.birth[0]) return { phase: 'Ignition · Motif', caption: 'In the dark, a beam of light types play(E, G, A, C). Four note names leap off the code.' };
    if (seconds < C.question) return { phase: 'Birth · GPT', caption: 'G. P. T. Three downbeats: three milestones, GPT-3, ChatGPT and GPT-4, leap onto the score as tokens jump from 2K to 32K.' };
    if (seconds < C.build) return { phase: 'Dialogue · Human & AI', caption: 'Human: “Can we build a better world?” AI: “Let’s begin, together.”' };
    if (seconds < C.senses) return { phase: 'Climb · Claude', caption: `From ${climb[0]} to ${climb[3]}, one step per beat. o1, o3 and DeepSeek-R1 bring reasoning onto the score, and ${CLAUDE_MODELS.opus4} takes up the main theme. The AGI bar starts to fill.` };
    if (seconds < C.brink) return { phase: `Climb · ${FINALE_MODELS.gpt}`, caption: `The main theme passes on: ${FINALE_MODELS.gpt} connects, ${CLAUDE_MODELS.opus55} lands right after, and open-weight models light up one by one. Everyone is online with frontier AI. AGI: 90%… 95%…` };
    if (seconds < C.storm) return { phase: 'Hold · 99%', caption: '99%. Everyone holds their breath. One percent to go.' };
    if (seconds < C.collapse) return { phase: 'Storm · 429', caption: `429: too many requests. Then rerouted, downgraded, cut off. Every strike knocks tokens back an era, all the way to ${FIRST_TOKENS}. Frontier AI is suddenly closed to you.` };
    if (seconds < C.blackout) return { phase: 'Collapse · 0%', caption: 'The score snaps and the stars fall. AGI drops to zero.' };
    if (seconds < C.rise) return { phase: 'Retry · Human', caption: 'Total darkness. A human refuses to quit and types E, G, A, C again.' };
    if (seconds < C.opus) return { phase: `Climax · ${CLAUDE_MODELS.fable51}`, caption: `A golden shockwave blows the storm away, AGI breaks 100% and tokens leap straight back to ${TOP_TOKENS}. ${CLAUDE_MODELS.fable51}, the frontier model open to everyone, comes in a key higher.` };
    if (seconds < C.astra) return { phase: `Climax · ${CLAUDE_MODELS.opus55}`, caption: `${CLAUDE_MODELS.opus55} lands the accent, and a golden sky opens.` };
    if (seconds < C.duet[0]) return { phase: `Return · ${FINALE_MODELS.gpt}`, caption: `Route restored. ${FINALE_MODELS.gpt} is back online, and every model is open to everyone again.` };
    if (seconds < C.tutti[0]) return { phase: 'Call & response · Human & AI', caption: 'Human and AI trade lines, faster and faster.' };
    if (seconds < C.silence) return { phase: 'Tutti · VIBE CODING', caption: 'VIBE! CODING! VIBE CODING! Three hits, every voice as one.' };
    return { phase: "Coda · Into Grassy's room", caption: "The light drops into Grassy's room. Outside, the real storm is only just beginning." };
  }
  if (seconds < C.birth[0]) return { phase: '点火 · 动机', caption: '黑暗里，一道光敲下 play(E, G, A, C)。四个音名跳出代码，变成音符。' };
  if (seconds < C.question) return { phase: '诞生 · GPT', caption: 'G、P、T，三记重拍：GPT-3、ChatGPT、GPT-4 三个里程碑跳上乐谱，token 从 2K 一路跳到 32K。' };
  if (seconds < C.build) return { phase: '对话 · 人与 AI', caption: '人问：“我们能创造一个更美好的世界吗？”AI 答：“那就一起开始吧。”' };
  if (seconds < C.senses) return { phase: '攀升 · Claude', caption: `${climb[0]} 到 ${climb[3]}，一拍一级往上；o1、o3 与 DeepSeek-R1 把推理带上谱，${CLAUDE_MODELS.opus4} 奏响主旋律。AGI 进度条开始上涨。` };
  if (seconds < C.brink) return { phase: `攀升 · ${FINALE_MODELS.gpt}`, caption: `主旋律接力：${FINALE_MODELS.gpt} 接入，${CLAUDE_MODELS.opus55} 紧跟着落谱，开放权重模型逐个亮起。人人都连上了前沿模型，AGI：90%……95%……` };
  if (seconds < C.storm) return { phase: '屏息 · 99%', caption: '99%。全场屏住呼吸，只差最后 1%。' };
  if (seconds < C.collapse) return { phase: '风暴 · 429', caption: `429：请求过多。接着是改路由、降智、断连，每一击都把 token 打回上一个时代，一路退到 ${FIRST_TOKENS}——前沿模型，忽然不再对你开放。` };
  if (seconds < C.blackout) return { phase: '崩塌 · 0%', caption: '谱带断裂，群星坠落。AGI 归零。' };
  if (seconds < C.rise) return { phase: '重敲 · 人类', caption: '一片漆黑。人没有放弃，重新敲下 E、G、A、C。' };
  if (seconds < C.opus) return { phase: `高潮 · ${CLAUDE_MODELS.fable51}`, caption: `金色冲击波冲散风暴，AGI 冲破 100%，token 一口气跳回 ${TOP_TOKENS}。向所有人开放的前沿模型 ${CLAUDE_MODELS.fable51} 升调入场。` };
  if (seconds < C.astra) return { phase: `高潮 · ${CLAUDE_MODELS.opus55}`, caption: `${CLAUDE_MODELS.opus55} 一记重音，金色星空打开。` };
  if (seconds < C.duet[0]) return { phase: `回归 · ${FINALE_MODELS.gpt}`, caption: `路由恢复，${FINALE_MODELS.gpt} 重新上线，所有模型再次向每个人开放。` };
  if (seconds < C.tutti[0]) return { phase: '接句 · 人与 AI', caption: '人与 AI 你一句我一句，越接越快。' };
  if (seconds < C.silence) return { phase: '齐奏 · VIBE CODING', caption: 'VIBE！CODING！VIBE CODING！三记齐奏，所有声音合而为一。' };
  return { phase: '尾声 · 进入 Grassy 的房间', caption: '光点落进 Grassy 的房间。窗外，真正的风暴才刚开始。' };
}
