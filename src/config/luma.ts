/** 尺寸以世界格计，角色原点位于粒子群中心。 */
export const LUMA = {
  name: '光子',
  englishName: 'Photon',
  hoverHeight: 1.15,
} as const;

export const LUMA_ACTIONS = [
  { id: 'idle', label: '陪伴', description: '明亮光心轻轻呼吸，细碎光点在周围游动。', seconds: 4 },
  { id: 'guide', label: '引路', description: '光团向前漂移，粒子在身后流动、渐隐，指示前进方向。', seconds: 4 },
  { id: 'wait', label: '等候', description: '粒子收拢，亮度放缓，停留在原处等候。', seconds: 4 },
  { id: 'alert', label: '提醒', description: '粒子向中心聚亮，暖白色光脉冲提示前方值得留意。', seconds: 2 },
  { id: 'celebrate', label: '欢跃', description: '光团跃动，细碎粒子向外舒展、消散。', seconds: 3 },
  { id: 'ultimate', label: '光子爆裂', description: '召唤漫天 Bug 与实体光轮，分批追击四周目标。', seconds: 6 },
] as const;

export type LumaAction = typeof LUMA_ACTIONS[number]['id'];
