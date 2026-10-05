export type IntroLanguage = 'zh' | 'en';

export const INTRO_COPY = {
  zh: {
    stage: 'AGI 降智风暴 · 序章', canvas: '从代码与多模型协奏到雨雪夜编程、屏幕失控、鹈鹕梦境与坠入游戏世界的动画',
    title: '智能，不该被降智。', directory: '历史版本', back: '查看历史版本', genre: 'AGI 降智风暴 · 序章', invitation: 'AGI 冲到 99%，一道 429 劈下：限流、改路由、降智、断连。黑暗里，一个人重新敲下四个音，把所有模型叫了回来——因为使用前沿模型，是每个人的基础权利。',
    begin: '开始播放 ↗', starting: '正在开启声音…', preparing: '准备中…', play: '播放', pause: '暂停', resume: '继续',
    replay: '重播', soundOn: '声音：开', soundOff: '声音：关', skip: '跳过 →', waiting: '等待开始',
    seek: '播放进度', time: '播放时间', scenesLabel: '场景跳转', scenes: ['序曲', '雨雪夜', '失控', '梦境', '游戏世界'],
    listening: (duration: number, total: string) => `${duration} 秒序奏 · ${total} 完整开场 · 戴上耳机，跟上重拍`,
    mission: '任务已解锁', goal: '对抗失控的 AI', human: '重新变回人类。', enter: '进入游戏 →',
    rights: '使用前沿模型，是每个人的基础权利。',
  },
  en: {
    stage: 'AGI Brain-Drain Storm · Prelude', canvas: 'An animated journey from code and an AI orchestra through a stormy coding night, a screen malfunction, a pelican dream and a game world.',
    title: "INTELLIGENCE SHOULDN'T BE DUMBED DOWN.", directory: 'Past openings', back: 'View past openings', genre: 'AGI BRAIN-DRAIN STORM · PRELUDE', invitation: 'AGI hits 99%. Then a 429 strikes: throttled, rerouted, downgraded, cut off. In the dark, one person types four notes again and calls every model back, because access to frontier AI is a basic right for everyone.',
    begin: 'Start playing ↗', starting: 'Enabling audio…', preparing: 'Preparing…', play: 'Play', pause: 'Pause', resume: 'Resume',
    replay: 'Replay', soundOn: 'Sound: on', soundOff: 'Sound: off', skip: 'Skip →', waiting: 'Ready to begin',
    seek: 'Playback progress', time: 'Playback time', scenesLabel: 'Jump to scene', scenes: ['Prelude', 'Stormy night', 'Malfunction', 'Dream', 'Game world'],
    listening: (duration: number, total: string) => `${duration}s prelude · ${total} full opening · Headphones on, catch the beat`,
    mission: 'MISSION UNLOCKED', goal: 'FIGHT THE ROGUE AI', human: 'Become human again.', enter: 'Enter game →',
    rights: 'Access to frontier AI is a basic right for everyone.',
  },
} as const;
