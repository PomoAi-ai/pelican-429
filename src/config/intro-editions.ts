import { FINALE_DURATION } from './intro-finale.ts';

export type IntroEditionId = 'melody' | 'world' | 'jazz' | 'relay' | 'tides' | 'compiler' | 'cosmos' | 'dialogue' | 'fugue' | 'dream' | 'finale';
export type IntroInstrument = 'mallet' | 'piano' | 'glass' | 'bass';

export interface IntroEdition {
  readonly id: IntroEditionId;
  readonly number: string;
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly music: string;
  readonly duration: number;
  readonly background: string;
  readonly foreground: string;
  readonly accent: string;
  readonly motif: readonly number[];
  readonly subdivision: number;
  readonly swing: number;
  readonly transpose: number;
  readonly lead: IntroInstrument;
  readonly response: IntroInstrument;
  readonly pad: IntroInstrument;
  readonly percussion: number;
}

export const INTRO_EDITIONS: readonly IntroEdition[] = [
  { id: 'finale', number: '00', name: 'AGI 降智风暴 · 序章', title: 'AGI BRAIN-DRAIN STORM · PRELUDE', subtitle: 'Four notes light the fuse, and model after model pushes AGI to 99%. Then a 429 strikes: throttled, rerouted, downgraded, cut off. In the dark, one person plays the four notes again and every model comes back. Frontier AI is a right for everyone.', description: '四个音符点燃引信，模型逐代登场，AGI 冲到 99%。一道 429 劈下：限流、改路由、降智、断连。黑暗里，人重新敲响四个音，所有模型回归齐奏——前沿模型，人人有权使用。', music: '四音主题 · 逐代攀升 · 小调风暴 · 独奏重敲 · 升调全奏', duration: FINALE_DURATION, background: '#06090f', foreground: '#f7efdd', accent: '#edcb87', motif: [0,2,3,1], subdivision: 2, swing: 0, transpose: 0, lead: 'piano', response: 'mallet', pad: 'glass', percussion: 1 },
  { id: 'melody', number: '01', name: '接过主旋律', title: 'PASS THE MELODY', subtitle: 'A single note. A thousand voices.', description: '聚光灯中的一枚音符，被不同AI接过，最终奏成整支乐队。', music: '钟琴序奏 · 管弦式渐强', duration: 22, background: '#090c14', foreground: '#f5ead3', accent: '#e9bf77', motif: [0,2,1,3,2,1,0,-1], subdivision: 1, swing: 0, transpose: 0, lead: 'mallet', response: 'piano', pad: 'glass', percussion: 0.8 },
  { id: 'world', number: '02', name: '代码长成世界', title: 'A WORLD WRITTEN', subtitle: 'First a word. Then a place to exist.', description: '在浅色图纸上输入代码，窗、桌面和房间由文字与线条长出来。', music: '极简钢琴 · 层叠和声', duration: 24, background: '#ece6d9', foreground: '#303c39', accent: '#9b5d39', motif: [0,-1,1,2,0,-1,3,2], subdivision: 1, swing: 0, transpose: -2, lead: 'piano', response: 'mallet', pad: 'glass', percussion: 0.25 },
  { id: 'jazz', number: '03', name: '终端爵士', title: 'TERMINAL JAM', subtitle: 'Write it. Play it. Break the silence.', description: '琥珀色终端变成爵士舞台，代码与模型轮流即兴，切分拍推动夜色。', music: '摇摆钢琴 · 拨弦低音', duration: 19, background: '#17101a', foreground: '#ffe1a9', accent: '#fa9270', motif: [0,2,-1,1,3,-1,2,1], subdivision: 2, swing: 0.24, transpose: -5, lead: 'piano', response: 'mallet', pad: 'piano', percussion: 0.8 },
  { id: 'relay', number: '04', name: '光标接力', title: 'RUN, CURSOR, RUN', subtitle: 'Every breakthrough changes the way forward.', description: '光标沿电路赛道奔跑，跨越文字、代码和感知，冲进真实显示器。', music: '脉冲电子 · 八分推进', duration: 17, background: '#09150f', foreground: '#e3ffe4', accent: '#b4f679', motif: [0,0,2,1,0,3,2,1], subdivision: 2, swing: 0, transpose: 0, lead: 'mallet', response: 'mallet', pad: 'glass', percussion: 1.15 },
  { id: 'tides', number: '05', name: '思想潮汐', title: 'TIDES OF INTELLIGENCE', subtitle: 'Every wave remembers the one before.', description: '字符落入深海，GPT、Claude、Gemini的潮汐叠加，浪面化为雨雪玻璃。', music: '玻璃长音 · 缓慢海潮', duration: 24, background: '#041725', foreground: '#d8f2ef', accent: '#71d4d0', motif: [0,-1,2,-1,1,3,-1,2], subdivision: 1, swing: 0, transpose: -7, lead: 'glass', response: 'mallet', pad: 'glass', percussion: 0.2 },
  { id: 'compiler', number: '06', name: '编译一首交响曲', title: 'COMPILE THE IMPOSSIBLE', subtitle: 'The build succeeds. The dream begins.', description: '机械节拍驱动构建，函数变成乐器，编译完成后自行执行dream.start()。', music: '机械打击 · 递进琶音', duration: 18, background: '#11141c', foreground: '#eef2e9', accent: '#f7bf57', motif: [0,1,2,3,0,1,2,-1], subdivision: 2, swing: 0, transpose: 2, lead: 'piano', response: 'mallet', pad: 'piano', percussion: 1.25 },
  { id: 'cosmos', number: '07', name: '群星不排队', title: 'A SKY OF MANY MINDS', subtitle: 'No single star owns the sky.', description: '每条AI路线形成独立星群，镜头穿过星海，星光最后成为窗外的雪。', music: '空间钟琴 · 宽阔长音', duration: 25, background: '#08091b', foreground: '#f0edff', accent: '#baa9ff', motif: [0,-1,3,2,-1,1,2,3], subdivision: 1, swing: 0, transpose: 7, lead: 'mallet', response: 'glass', pad: 'glass', percussion: 0.3 },
  { id: 'dialogue', number: '08', name: '人类输入，世界回应', title: 'CAN WE MAKE A WORLD?', subtitle: 'A question becomes a place.', description: '以人的提问展开：说话、构建、看见、听见。回答最终从文字变为整个房间。', music: '问答双钢琴 · 留白与回应', duration: 22, background: '#f2eae0', foreground: '#253d48', accent: '#b7604b', motif: [0,1,-1,-1,2,3,1,-1], subdivision: 1, swing: 0.08, transpose: 0, lead: 'piano', response: 'piano', pad: 'glass', percussion: 0.2 },
  { id: 'fugue', number: '09', name: '多声部赋格', title: 'FUGUE OF MACHINES', subtitle: 'Independent voices. A shared momentum.', description: '三组主题在立体谱面中追逐、模仿、交织，最终收束成同一个音。', music: '三声部对位 · 巴洛克式琶音', duration: 23, background: '#130e19', foreground: '#f4e8d3', accent: '#dcb57d', motif: [0,1,2,0,3,2,1,2], subdivision: 2, swing: 0, transpose: -2, lead: 'piano', response: 'piano', pad: 'glass', percussion: 0.3 },
  { id: 'dream', number: '10', name: '最后一次人类键击', title: 'THE LAST KEYSTROKE', subtitle: 'You stop. It doesn’t.', description: '从屏幕倒影开始，能力越强，房间越不真实。手停后代码继续，一片羽毛越出屏幕。', music: '稀疏低音 · 悬疑后段', duration: 20, background: '#080d10', foreground: '#e5efea', accent: '#95ccbe', motif: [0,-1,-1,2,1,-1,3,-1], subdivision: 1, swing: 0, transpose: -12, lead: 'piano', response: 'glass', pad: 'glass', percussion: 0.45 },
];

export function introEdition(id: string): IntroEdition {
  const edition = INTRO_EDITIONS.find((entry) => entry.id === id);
  if (!edition) throw new Error(`未知开局方案：${id}`);
  return edition;
}

/** 每套只改变序奏长度，后续故事整体平移，不拉伸人物动作和音效。 */
export function editionStoryTime(seconds: number, edition: IntroEdition): number {
  return seconds < edition.duration ? seconds / edition.duration * 20 : seconds - edition.duration + 20;
}
export function editionPlaybackTime(storySeconds: number, edition: IntroEdition): number {
  return storySeconds < 20 ? storySeconds / 20 * edition.duration : storySeconds + edition.duration - 20;
}
