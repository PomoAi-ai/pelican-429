import { GRASSY_CYCLE } from './grassy-cycle.ts';

/** Visible height from the sole to the highest hair tip, in world tiles. */
export const GRASSY_HEIGHT = 3.1;

export const GRASSY_MODELS = [
  { id: 'reference-fit', label: '原画校准版 · 形体修正', description: '按已确认的参考图校准头脸、发型与服装体积，比较三维轮廓和曲面。静态模型。', path: '/characters/human/history/models-reference-fit/grassy-reference-fit.glb', renderPrefix: '/characters/human/history/models-reference-fit/render' },
  { id: 'multiview', label: '多视图贴图版 · 原画质感', description: '将四向原画映射到立体网格，比较颜色、细节与转动时的表现。静态模型。', path: '/characters/human/history/models-multiview/grassy-multiview.glb', renderPrefix: '/characters/human/history/models-multiview/render' },
  { id: 'detailed', label: 'gpt6.1astra版本 · 精细版', description: '完整脸部、发束与服装细节，供近景检查。', path: '/characters/human/history/models/grassy-detailed.glb', renderPrefix: '/characters/human/history/models/render-detailed' },
  { id: 'atelier-detailed', label: 'gpt6.1sol版本 · 精细版', description: '独立制作的精细静态模型：重塑脸型、眼睑与分层发束，补充针织、牛仔布和鞋面细节。', path: '/characters/human/history/models-atelier/grassy-atelier-detailed.glb', renderPrefix: '/characters/human/history/models-atelier/render' },
  { id: 'game', label: 'gpt6.1astra版本 · 游戏标准版', description: '保留人物轮廓与主要细节，适用于游戏正常视距。', path: '/characters/human/history/models/grassy-game.glb', renderPrefix: '/characters/human/history/models/render-game' },
  { id: 'light', label: 'gpt6.1astra版本 · 游戏轻量版', description: '保留相同造型与高度，减少细小几何。', path: '/characters/human/history/models/grassy-light.glb', renderPrefix: '/characters/human/history/models/render-light' },
  { id: 'fresh-detailed', label: 'Sonnet 5.5版本 · 精细版', description: 'Sonnet 5.5 从零重建的独立模型：头发、毛衣、牛仔裤缝线与手指细节。', path: '/characters/human/history/models-fresh/grassy-detailed.glb', renderPrefix: '/characters/human/history/models-fresh/render-detailed' },
  { id: 'fresh-game', label: 'Sonnet 5.5版本 · 游戏标准版', description: 'Sonnet 5.5 从零重建的独立模型，游戏正常视距。', path: '/characters/human/history/models-fresh/grassy-game.glb', renderPrefix: '/characters/human/history/models-fresh/render-game' },
  { id: 'fresh-light', label: 'Sonnet 5.5版本 · 游戏轻量版', description: 'Sonnet 5.5 从零重建的独立模型，更远视距与多实例。', path: '/characters/human/history/models-fresh/grassy-light.glb', renderPrefix: '/characters/human/history/models-fresh/render-light' },
  { id: 'opus55-detailed', label: 'Opus 5.5 版 · 精细版', description: 'Opus 5.5 重新建模：距离场雕刻的脸与眼睑、按发流排布的发簇、罗纹毛衣、卷边牛仔裤与板鞋。', path: '/characters/human/history/models-opus55/grassy-opus55-detailed.glb', renderPrefix: '/characters/human/history/models-opus55/render-detailed' },
  { id: 'opus55-game', label: 'Opus 5.5 版 · 游戏标准版', description: 'Opus 5.5 版按部位减面，脸部、缝线与鞋侧条纹烘焙进贴图，游戏正常视距。', path: '/characters/human/history/models-opus55/grassy-opus55-game.glb', renderPrefix: '/characters/human/history/models-opus55/render-game' },
  { id: 'opus55-light', label: 'Opus 5.5 版 · 游戏轻量版', description: 'Opus 5.5 版同一造型的轻量档，更远视距与多实例。', path: '/characters/human/history/models-opus55/grassy-opus55-light.glb', renderPrefix: '/characters/human/history/models-opus55/render-light' },
  { id: 'rodin-detailed', label: 'Rodin 版 · 精细版', description: 'Hyper3D Rodin 四向原画生成：四边面全身，头部用四向头像裁图单独生成后接到领口，发束与五官细节更足；12.4 万面，2K 烘焙贴图。', path: '/characters/human/history/models-rodin/grassy-rodin-detailed.glb', renderPrefix: '/characters/human/history/models-rodin/render-detailed' },
  { id: 'rodin-game', label: 'Rodin 版 · 游戏标准版', description: 'Rodin 版减面到 2.6 万面，重新展开 UV 并从高模烘焙 1K 颜色与法线，游戏正常视距。', path: '/characters/human/history/models-rodin/grassy-rodin-game.glb', renderPrefix: '/characters/human/history/models-rodin/render-game' },
  { id: 'rodin-light', label: 'Rodin 版 · 游戏轻量版', description: 'Rodin 版减面到 1.4 万面、512 烘焙贴图，更远视距与多实例。', path: '/characters/human/history/models-rodin/grassy-rodin-light.glb', renderPrefix: '/characters/human/history/models-rodin/render-light' },
  { id: 'rodin-refined-detailed', label: 'Rodin 精修版 · 精细版', description: '保留 Rodin 原始 50 万面与无损 2K PBR 贴图，校准侧脸、眼睛、发束、手部与材质；全高 3.1 格，静态模型。', path: '/characters/human/history/models-rodin-refined/grassy-rodin-refined-detailed.glb', renderPrefix: '/characters/human/history/models-rodin-refined/render-detailed' },
  { id: 'rodin-refined-game', label: 'Rodin 精修版 · 游戏标准版', description: '从同一精修高模减面到约 4.5 万面，保留校准后的轮廓与 PBR 材质，适用于游戏正常视距。', path: '/characters/human/history/models-rodin-refined/grassy-rodin-refined-game.glb', renderPrefix: '/characters/human/history/models-rodin-refined/render-game' },
  { id: 'rodin-refined-light', label: 'Rodin 精修版 · 游戏轻量版', description: '从同一精修高模减面到约 2 万面，保留相同造型与 3.1 格高度，供远视距与多实例比较。', path: '/characters/human/history/models-rodin-refined/grassy-rodin-refined-light.glb', renderPrefix: '/characters/human/history/models-rodin-refined/render-light' },
] as const;
export type GrassyModelVariant = typeof GRASSY_MODELS[number]['id'];

/** The three tiers share the same authored skeleton and clips. */
export const GRASSY_ANIMATED_MODELS = [
  { id: 'detailed', label: '精细版', path: '/characters/human/models-equipped/grassy-equipped-detailed.glb' },
  { id: 'game', label: '游戏标准版', path: '/characters/human/models-equipped/grassy-equipped-game.glb' },
  { id: 'light', label: '游戏轻量版', path: '/characters/human/models-equipped/grassy-equipped-light.glb' },
] as const;
export type GrassyAnimatedVariant = typeof GRASSY_ANIMATED_MODELS[number]['id'];

export const GRASSY_ACTIONS = [
  { id: 'idle', label: '呼吸', description: '胸肩自然吸气与缓慢呼气，放松摆臂并间歇眨眼，双脚保持接地。', seconds: 3.2, loop: true, viewHeight: 3.8, viewCenter: 1.55 },
  { id: 'walk', label: '走路', description: '键盘背负，原地迈步，屈膝抬脚与双臂反向摆动。', seconds: 1.2, loop: true, viewHeight: 3.8, viewCenter: 1.55 },
  { id: 'run', label: '跑步', description: '落脚缓冲、蹬地腾空、屈膝回收与大幅交替摆臂，键盘固定在背架上。', seconds: 0.8, loop: true, viewHeight: 4, viewCenter: 1.6 },
  { id: 'sprint', label: '快跑', description: '加速后身体明显前倾，快速蹬地、屈膝收腿与大幅摆臂；键盘随背架稳定贴合。', seconds: 0.6, loop: true, viewHeight: 4, viewCenter: 1.6 },
  { id: 'ride', label: '骑自行车', description: '坐在车座上，双手握车把、双脚交替踩踏，车轮和链条同步转动，键盘保持背负。', seconds: GRASSY_CYCLE.seconds * GRASSY_CYCLE.crankRevolutions, loop: true, viewHeight: 4.8, viewCenter: 1.55 },
  { id: 'jump', label: '跳跃', description: '屈膝蓄力、起跳收腿、下落与落地缓冲，键盘保持背负。', seconds: 1.6, loop: false, viewHeight: 4.6, viewCenter: 1.85 },
  { id: 'keyboard_smash', label: '普通攻击 · 砸键盘', description: '右手握住键盘短端，抡起远端左右横击，左手张开保持平衡，连击后收回背上。', seconds: 2, loop: false, viewHeight: 4.2, viewCenter: 1.65, viewBounds: { min: [-2.6, -0.15, -1.3], max: [2.1, 3.3, 1.7] } },
  { id: 'codex_attack', label: 'Codex 攻击', description: '键盘连发立体 </> 代码弹，{}、=>、if() 字符与蓝白粒子沿弹道飞出。', seconds: 1.6, loop: false, viewHeight: 4.2, viewCenter: 1.65, viewBounds: { min: [-2, -0.15, -1], max: [2, 4.2, 11.2] } },
  { id: 'bug_attack', label: 'Bug 攻击', description: '紫绿实体虫群沿弹道前冲，发光腹核、翅足与故障粒子形成持续攻势。', seconds: 2, loop: false, viewHeight: 4.2, viewCenter: 1.65, viewBounds: { min: [-2, -0.15, -1], max: [2, 4.2, 9.2] } },
  { id: 'server_overload', label: '服务器超载', description: '服务器阵列过热转红，白热能量柱爆发，多层冲击波裹挟实体碎片向外扩散。', seconds: 3.2, loop: false, viewHeight: 5.7, viewCenter: 2.5, viewBounds: { min: [-6.5, -0.15, -6.5], max: [6.5, 5.4, 6.5] } },
  { id: 'takeoff', label: '起飞', description: '推进器启动，双腿离地并进入悬停姿势，键盘背负。', seconds: 1.2, loop: false, viewHeight: 4.6, viewCenter: 1.85 },
  { id: 'hover', label: '悬停', description: '护腕和背部推进器稳定输出，屈膝悬停并轻微调整平衡。', seconds: 2.4, loop: true, viewHeight: 4.6, viewCenter: 1.85 },
  { id: 'fly_forward', label: '向前飞行', description: '身体前倾、双腿后收，推进尾流增强，键盘保持背负。', seconds: 1.2, loop: true, viewHeight: 4.6, viewCenter: 1.85 },
  { id: 'land', label: '降落', description: '降低推进输出、双脚接地并屈膝缓冲，推进器熄灭。', seconds: 1.2, loop: false, viewHeight: 4.6, viewCenter: 1.85 },
] as const;
export type GrassyAction = typeof GRASSY_ACTIONS[number]['id'];

export const GRASSY_ATTACKS = ['keyboard_smash', 'codex_attack', 'bug_attack', 'server_overload'] as const;
export type GrassyAttack = typeof GRASSY_ATTACKS[number];
export const GRASSY_FLIGHTS = [
  { id: 'takeoff', label: '起飞施法' },
  { id: 'hover', label: '悬停施法' },
  { id: 'fly_forward', label: '前飞施法' },
] as const;
export type GrassyFlight = typeof GRASSY_FLIGHTS[number]['id'];
export interface GrassyFlightState { action: GrassyFlight; time: number }
export const GRASSY_MOTIONS = ['walk', 'run', 'sprint', 'jump', 'takeoff', 'hover', 'fly_forward', 'land'] as const;
export type GrassyMotion = typeof GRASSY_MOTIONS[number];
export interface GrassyMotionState { action: GrassyMotion; time: number }
export function isGrassyAttack(action: GrassyAction): action is GrassyAttack {
  return (GRASSY_ATTACKS as readonly string[]).includes(action);
}

export function grassyAction(id: GrassyAction) {
  return GRASSY_ACTIONS.find((action) => action.id === id)!;
}
