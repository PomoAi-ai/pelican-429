export type NpcKind = 'sam' | 'tibo';
export type NpcAction = 'idle' | 'walk' | 'run' | 'jump' | 'greet' | 'skill1' | 'skill2' | 'ultimate';

export const SAM_ROUTING_SOURCE = { x: 0, y: 3.55, z: .3 } as const;

export const NPCS: Readonly<Record<NpcKind, {
  readonly name: string;
  readonly title: string;
  readonly height: number;
  readonly path: string;
  readonly description: string;
}>> = {
  sam: {
    name: 'Sam', title: 'The Model Router', height: 2.7,
    path: './characters/sam/sam.glb',
    description: '白鼬山姆 · 棕色短发、蓝灰眼睛、灰毛衣与路由胸章。',
  },
  tibo: {
    name: 'Tibo', title: 'The Reset Master', height: 2.65,
    path: './characters/tibo/tibo.glb',
    description: '鼹鼠提博 · 侧分头发、开朗笑容、黑色帽衫与重置胸章。',
  },
};

const commonActions = [
  { id: 'idle', label: '待机', description: '自然呼吸并眨眼，胸口、头部与双臂轻轻起伏。', seconds: 4, loop: true, release: 0, viewHeight: 3.5, viewWidth: 2.7, viewCenter: 1.35 },
  { id: 'walk', label: '行走', description: '交替迈步，观察短腿步态与双臂摆动。', seconds: 1.2, loop: true, release: 0, viewHeight: 3.5, viewWidth: 2.7, viewCenter: 1.35 },
  { id: 'run', label: '跑步', description: '前倾加速、蹬地腾空，短腿快速交替，双臂反向摆动。', seconds: 0.8, loop: true, release: 0, viewHeight: 3.8, viewWidth: 3, viewCenter: 1.4 },
  { id: 'jump', label: '跳跃', description: '屈膝蓄力、跃起收腿，落地缓冲后恢复站姿。', seconds: 1.6, loop: false, release: 0, viewHeight: 4.7, viewWidth: 3.3, viewCenter: 2 },
  { id: 'greet', label: '招呼', description: '抬起爪子打招呼，再恢复站姿。', seconds: 3, loop: false, release: 0, viewHeight: 3.5, viewWidth: 2.7, viewCenter: 1.35 },
] as const;

export const NPC_ACTIONS: Readonly<Record<NpcKind, readonly {
  readonly id: NpcAction;
  readonly label: string;
  readonly description: string;
  readonly seconds: number;
  readonly loop: boolean;
  readonly release: number;
  readonly viewHeight: number;
  readonly viewWidth: number;
  readonly viewCenter: number;
}[]>> = {
  sam: [...commonActions,
    { id: 'skill1', label: '模型路由攻击', description: '头顶 GPT-6 Astra 核心斜射蓝金光线；命中后，目标身上显现 GPT-5.6 Luna 或 GPT-4o mini。光线沿固定方向飞行，可以跳跃躲避。', seconds: 3.4, loop: false, release: 0.9, viewHeight: 6.1, viewWidth: 10.5, viewCenter: 2.6 },
    { id: 'skill2', label: '算力激涌', description: '算力凝成 Token 导弹，沿高低弧线连续发射，命中后爆散成数据碎块。', seconds: 3.6, loop: false, release: 1.3, viewHeight: 5, viewWidth: 6.6, viewCenter: 2.05 },
    { id: 'ultimate', label: 'AGI 降临', description: '召来 AGI 天穹，巨型光柱与蓝金冲击波连续击退两侧训练靶。', seconds: 6, loop: false, release: 2.8, viewHeight: 7.3, viewWidth: 9.1, viewCenter: 3 },
  ],
  tibo: [...commonActions,
    { id: 'skill1', label: '薯条攻击', description: '抛出金黄薯条与俏皮文字，金橙弹道连续命中训练靶，文字为攻击助威。', seconds: 2.4, loop: false, release: 0.9, viewHeight: 4.5, viewWidth: 7.3, viewCenter: 1.9 },
    { id: 'skill2', label: '额度返场', description: '按下重置按钮补满额度，绿色能量命中前方训练靶，爆出金色碎片。', seconds: 3, loop: false, release: 1.3, viewHeight: 5, viewWidth: 6.6, viewCenter: 2.05 },
    { id: 'ultimate', label: '重置降临', description: '巨型重置按钮降临，绿金冲击连续覆盖两侧训练靶，弹起并爆散粒子。', seconds: 6, loop: false, release: 2.8, viewHeight: 7.3, viewWidth: 9.1, viewCenter: 3 },
  ],
};

export function npcAction(kind: NpcKind, id: NpcAction) {
  return NPC_ACTIONS[kind].find((action) => action.id === id)!;
}
