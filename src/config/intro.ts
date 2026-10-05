import { CLAUDE_MODELS } from './intro-models.ts';

export const INTRO_DURATION = 51;

/** 乐谱时间按 1.6 倍推进，音画共用，音高保持不变。 */
export const INTRO_SCORE_RATE = 1.6;

/** 声部是叙事配器，不表示模型能力排名。时间采用乐谱秒。 */
export const INTRO_VOICES = [
  { id: 'language', label: 'GPT', action: 'LANGUAGE', color: '#99e2cc', at: 5 },
  { id: 'code', label: 'CLAUDE', action: 'CODE', color: '#efbd92', at: 10.5 },
  { id: 'senses', label: 'GEMINI', action: 'VISION / SOUND', color: '#a8b9ff', at: 14 },
] as const;

export const INTRO_WORDS = [
  { label: 'GPT', english: 'A language finds its voice.', family: 'language', at: 5 },
  { label: 'ChatGPT', english: 'One voice becomes a conversation.', family: 'language', at: 7.5 },
  { label: CLAUDE_MODELS.opus46, english: 'Words become working code.', family: 'code', at: 10.5 },
  { label: 'Gemini 3', english: 'A wider view of the world.', family: 'senses', at: 14 },
  { label: 'DeepSeek-R1', english: 'Llama / Qwen / Open weights', family: 'ensemble', at: 17 },
  { label: CLAUDE_MODELS.opus48, english: 'Think. Edit. Run.', family: 'code', at: 20 },
  { label: 'Gemini 3', english: 'Sight, sound and thought converge.', family: 'senses', at: 23 },
  { label: CLAUDE_MODELS.opus55, english: 'A world takes shape.', family: 'code', at: 26 },
  { label: 'CREATE TOGETHER', english: 'Many minds. One unfolding world.', family: 'ensemble', at: 27.5 },
] as const;

export const INTRO_CODE_LINES = [
  { text: 'grassy@studio ~ % compose dream', at: 0.4 },
  { text: 'const world = await imagine();', at: 1.5 },
  { text: 'world.listen();', at: 2.7 },
  { text: 'world.build();', at: 3.5 },
] as const;
export const INTRO_HANDS_OFF_AT = 29;
export const INTRO_MUSIC_END = 31.2;

/** 真实速度从84 BPM起步，Claude出现后渐强至约156 BPM。 */
export function introBeatAt(time: number): number {
  const elapsed = Math.max(0, time - 5);
  const crescendo = Math.max(0, time - 10.5);
  return elapsed * 0.875 + crescendo * crescendo * 0.018;
}

export function introTimeAtBeat(beat: number): number {
  const firstPhrase = 5.5 * 0.875;
  if (beat <= firstPhrase) return 5 + beat / 0.875;
  return 10.5 + (-0.875 + Math.sqrt(0.875 ** 2 + 0.072 * (beat - firstPhrase))) / 0.036;
}

/** 序章之后的故事按真实秒推进；音画共用同一张时间表。 */
export const INTRO_SCENES = [
  { id: 'prelude', label: '序曲', at: 0 },
  { id: 'night', label: '雨雪夜', at: 20 },
  { id: 'glitch', label: '失控', at: 25.5 },
  { id: 'dream', label: '梦境', at: 32 },
  { id: 'world', label: '游戏世界', at: 41.5 },
] as const;

export type IntroSceneId = (typeof INTRO_SCENES)[number]['id'];

export function introSceneAt(id: IntroSceneId): number {
  return INTRO_SCENES.find((scene) => scene.id === id)!.at;
}

export const INTRO_GOAL_AT = 47;

/** 故事段 120 BPM，所有冲击都落在半拍网格上。 */
export const INTRO_STORY_BEAT = 0.5;

/** 键击循环的击键时刻（秒），音频合成键声，画面让屏幕辉光随之闪动。 */
export const INTRO_KEY_TIMES = [0, 0.14, 0.31, 0.44, 0.63, 1.08, 1.24, 1.42, 1.58, 1.74, 2.22, 2.41, 2.54, 2.73, 2.89, 3.08] as const;
export const INTRO_KEY_LOOP = 4;

export const INTRO_ROUTE_AT = 27;
export const INTRO_DOWNGRADE_AT = 28.5;
export const INTRO_BAN_AT = 30.5;

export const INTRO_DIZZY_AT = 31;
/** 心跳每两拍一次「咚-咚」，第二下落在半拍后。 */
export const INTRO_HEARTBEAT_PERIOD = INTRO_STORY_BEAT * 2;
export const INTRO_HEARTBEAT_ECHO = INTRO_STORY_BEAT / 2;

/** 四拍羽化后才进入完整鹈鹕骑行，声音与揭示动画共用拍点。 */
export const INTRO_TRANSFORM_BEATS = [32, 32.5, 33, 33.5] as const;
export const INTRO_PELICAN_AT = 34;
export const INTRO_DREAM_CRESCENDO_AT = 37;
/** 八音动机也决定可见音符的高低，避免画面和旋律各自跳动。 */
export const INTRO_DREAM_MELODY = [659.25, 587.33, 523.25, 440, 523.25, 587.33, 783.99, 659.25] as const;

/** 车轮尝试量化到半拍，逐次加密；最终失败的尾音在定格之前结束。 */
export const INTRO_WHEEL_TRIES = [35, 36.25, 37.25, 38, 38.5, 39] as const;
export const INTRO_WHEEL_APPROACH = INTRO_STORY_BEAT;
export const INTRO_DREAM_FREEZE_AT = 40;
export const INTRO_LANDING_AT = 43.5;
