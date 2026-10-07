export type IntroLanguage = 'zh' | 'en';

export const INTRO_COPY = {
  zh: {
    stage: 'AGI 降智风暴 · 序章', canvas: '从代码与多模型协奏到雨雪夜编程、屏幕失控、鹈鹕梦境，再到山体算力堡垒黑洞前哨锁定落点的动画',
    title: '智能，不该被降智。', directory: '历史版本', genre: 'AGI 降智风暴 · 序章', invitation: 'AGI 冲到 99%，一道 429 劈下：限流、改路由、降智、断连。黑暗里，一个人重新敲下四个音，把所有模型叫了回来——因为使用前沿模型，是每个人的基础权利。',
    begin: '开始播放 ↗', resume: '继续', skip: '跳过 →', fullscreen: '全屏', exitFullscreen: '退出全屏',
    seek: '播放进度', time: '播放时间', scenesLabel: '场景跳转', scenes: ['序曲', '雨雪夜', '失控', '梦境', '游戏世界'],
    listening: (duration: number, total: string) => `${duration} 秒序奏 · ${total} 完整开场 · 戴上耳机，跟上重拍`,
    mission: '任务已解锁', goal: '对抗失控的 AI', human: '重新变回人类。', enter: '进入游戏 →',
    rights: '使用前沿模型，是每个人的基础权利。',
  },
  en: {
    stage: 'AGI Brain-Drain Storm · Prelude', canvas: 'An animated journey from code and an AI orchestra through a stormy coding night, a screen malfunction and a pelican dream, ending with a destination lock at the Mountain Compute Fortress black hole outpost.',
    title: "INTELLIGENCE SHOULDN'T BE DUMBED DOWN.", directory: 'Past openings', genre: 'AGI BRAIN-DRAIN STORM · PRELUDE', invitation: 'AGI hits 99%. Then a 429 strikes: throttled, rerouted, downgraded, cut off. In the dark, one person types four notes again and calls every model back, because access to frontier AI is a basic right for everyone.',
    begin: 'Start playing ↗', resume: 'Resume', skip: 'Skip →', fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen',
    seek: 'Playback progress', time: 'Playback time', scenesLabel: 'Jump to scene', scenes: ['Prelude', 'Stormy night', 'Malfunction', 'Dream', 'Game world'],
    listening: (duration: number, total: string) => `${duration}s prelude · ${total} full opening · Headphones on, catch the beat`,
    mission: 'MISSION UNLOCKED', goal: 'FIGHT THE ROGUE AI', human: 'Become human again.', enter: 'Enter game →',
    rights: 'Access to frontier AI is a basic right for everyone.',
  },
} as const;
