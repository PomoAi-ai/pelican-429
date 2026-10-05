import { ENEMY_RULES } from './enemy-rules.ts';
import type { EnemyKind } from './enemy-rules.ts';
import { ENEMY_KINDS, ENEMY_MODEL_DIRS } from './enemy-models.ts';
import type { ResourceOptions } from './resource-showcase.ts';
import { GRASSY_ACTIONS, GRASSY_ANIMATED_MODELS, GRASSY_MODELS, GRASSY_FLIGHTS, isGrassyAttack } from './grassy.ts';
import type { GrassyAction, GrassyAnimatedVariant, GrassyFlight } from './grassy.ts';
import { LUMA_ACTIONS } from './luma.ts';
import { FISH_SPECIES } from './fish-appearance.ts';
import type { FishSpeciesId } from './fish-appearance.ts';
import { NPCS, NPC_ACTIONS } from './npc.ts';
import type { NpcKind } from './npc.ts';

export type ShowcaseEnvironment = 'surface' | 'underground';
export type ShowcaseActor = 'pelican' | 'human' | 'luma' | 'dummy' | 'fish' | NpcKind | EnemyKind;

export const MODEL_SHOWCASE_VIEWS = {
  threeQuarter: { label: '三分之四', yaw: Math.PI / 4 },
  front: { label: '正面', yaw: 0 },
  back: { label: '背面', yaw: Math.PI },
  left: { label: '左侧', yaw: -Math.PI / 2 },
  right: { label: '右侧', yaw: Math.PI / 2 },
} as const;

export interface ShowcaseEntry<Actor extends string = ShowcaseActor> {
  readonly id: string;
  readonly actor: Actor;
  readonly action: string;
  readonly label: string;
  readonly group: string;
  readonly description: string;
  readonly seconds: number;
  readonly loop?: boolean;
  readonly supportsShapes?: boolean;
  readonly fishSpecies?: FishSpeciesId;
  readonly grassyAnimation?: { readonly variant: GrassyAnimatedVariant; readonly clip: GrassyAction; readonly flight?: GrassyFlight };
}

export const MAX_SHOWCASE_CARDS = 8;

export const SHOWCASE_ACTORS: ReadonlyArray<{ id: ShowcaseActor; name: string; image: string; description: string; defaultEntry: string }> = [
  { id: 'pelican', name: '鹈鹕', image: '/characters/pelican/02-pelican-2d-three-quarter.png', description: '原画、参考图与实时模型', defaultEntry: 'pelican.idle' },
  { id: 'human', name: 'Grassy · 人类', image: '/characters/human/equipment-concepts/flight.png', description: '正式装备角色 · 骑行、键盘战斗与推进飞行', defaultEntry: 'human.rodin-animated-game.idle' },
  { id: 'luma', name: '光子', image: '/characters/luma/portrait.jpg', description: '飞行微光 · 自由游弋与环境照明', defaultEntry: 'luma.idle' },
  ...(Object.keys(NPCS) as NpcKind[]).map((id) => ({
    id, name: `${NPCS[id].name} · ${NPCS[id].title}`, image: `/characters/${id}/render-front.png`,
    description: NPCS[id].description, defaultEntry: `${id}.idle`,
  })),
  { id: 'dummy', name: '训练假人', image: '/showcase/dummy.jpg', description: '受击、射击与漂浮', defaultEntry: 'dummy.idle' },
  ...ENEMY_KINDS.map((id) => ({ id, name: ENEMY_RULES[id].name, image: `${ENEMY_MODEL_DIRS[id]}/thumbnail.png`, description: ENEMY_RULES[id].skills.map((skill) => skill.name).join(' · '), defaultEntry: `${id}.idle` })),
  { id: 'fish', name: '鱼类', image: '/showcase/fish.jpg', description: '七种鱼的外形、游动与扑腾', defaultEntry: 'fish.species.minnow' },
];

const entries = (actor: ShowcaseActor, group: string, rows: ReadonlyArray<readonly [string, string, string, number]>): ShowcaseEntry[] =>
  rows.map(([action, label, description, seconds]) => ({ id: `${actor}.${action}`, actor, action, label, group, description, seconds }));

export const SHOWCASE_ENTRIES: readonly ShowcaseEntry[] = [
  ...GRASSY_ANIMATED_MODELS.flatMap((model) => GRASSY_ACTIONS.map((action) => ({
    id: `human.rodin-animated-${model.id}.${action.id}`, actor: 'human' as const, action: action.id,
    label: action.label, group: action.id === 'ride' ? '自行车' : ['keyboard_smash', 'codex_attack', 'bug_attack', 'server_overload'].includes(action.id) ? '键盘战斗' : ['takeoff', 'hover', 'fly_forward', 'land'].includes(action.id) ? '推进飞行' : '基础动作',
    description: `${model.label}：${action.description}`, seconds: action.seconds, loop: action.loop,
    grassyAnimation: { variant: model.id, clip: action.id },
  }))),
  ...GRASSY_ANIMATED_MODELS.flatMap((model) => GRASSY_FLIGHTS.flatMap((flight) => GRASSY_ACTIONS.filter((action) => isGrassyAttack(action.id)).map((action) => ({
    id: `human.rodin-animated-${model.id}.${action.id}.${flight.id}`, actor: 'human' as const, action: action.id,
    label: action.label, group: '键盘战斗', description: `${flight.label} · ${action.description}`,
    seconds: action.seconds, loop: action.loop, grassyAnimation: { variant: model.id, clip: action.id, flight: flight.id },
  })))),
  ...GRASSY_ANIMATED_MODELS.flatMap((model) => [undefined, ...GRASSY_FLIGHTS.map((flight) => flight.id)].map((flight) => ({
    id: `human.rodin-animated-${model.id}.photon_burst${flight ? `.${flight}` : ''}`,
    actor: 'human' as const, action: 'photon_burst', label: '光子爆裂', group: '光子技能',
    description: '光子跟随 Grassy，按 3 / E 召唤虫群与光轮追击目标；与鹈鹕形态共享冷却。',
    seconds: 8, loop: true, grassyAnimation: { variant: model.id, clip: 'idle' as const, flight },
  }))),
  ...GRASSY_MODELS.map((model) => ({ id: `human.${model.id}`, actor: 'human' as const, action: model.id, label: model.label, description: model.description, seconds: 0, group: '静态模型' })),
  ...LUMA_ACTIONS.map((action) => ({ ...action, id: `luma.${action.id}`, actor: 'luma' as const, action: action.id, group: '宠物动作',
    ...(action.id === 'ultimate' ? { label: '光子爆裂', description: '与鹈鹕共同召唤 Bug 与光轮，追击左右及高处的真实目标', seconds: 6 } : {}),
  })),
  ...(Object.keys(NPCS) as NpcKind[]).flatMap((actor) => NPC_ACTIONS[actor].map((action) => ({
    ...action, id: `${actor}.${action.id}`, actor, action: action.id, group: action.release > 0 ? '特色技能' : '基础动作',
  }))),
  ...entries('pelican', '基础动作', [
    ['idle', '待机', '观察呼吸、重心与配饰的轻微摆动', 5],
    ['walk', '走路', '慢速步态与脚底贴地', 4],
    ['run', '跑步', '加速跑动与身体跟随', 3],
    ['turn', '转身', '观察左右转向的过渡', 4],
    ['jump', '跳跃 / 落地', '起跳、下落与落地的完整过程', 3],
    ['fly', '飞行', '起跳后振翅上升', 4],
    ['glide', '滑翔', '从高处展开翅膀滑翔', 4],
    ['swim', '游泳', '自动进入水池，观察浮力与划水', 4],
  ]),
  ...entries('pelican', '普通攻击', [
    ['water', '吐水 · 普通攻击', '连续吐水，观察水弹命中、水花和目标受击', 4],
  ]),
  ...entries('pelican', '四个技能', [
    ['fish', '① 鱼群轰炸', '鱼群沿不同弧线落下，弹跳并命中三个目标', 5],
    ['dash', '② 振翅突进', '展开翅膀向前突进，将路径上的目标击飞', 4],
    ['swallow', '③ 吞弹反击', '吸入射击目标的来弹，再将凝聚弹反吐命中', 6],
    ['ultimate', '④ 光子爆裂', '光子召唤漫天 Bug 与光轮，分批追击四周目标', 6],
  ]),
  ...entries('pelican', '双向变身', [
    ['transform-human', '鹈鹕 → 主角', '羽毛收退、翅膀恢复为双臂，身体抬高变为 Grassy；手动模式按 F 可再次变身', 5],
    ['transform-pelican', '主角 → 鹈鹕', '羽毛从肩背沿手臂生长，身体收短变为鹈鹕；手动模式按 F 可再次变身', 5],
  ]),
  ...entries('pelican', '骑行动作', [
    ['mount', '上车', '从站立到骑乘的完整过渡', 3],
    ['ride', '骑行', '踩踏、车轮与身体的联动', 3],
    ['dismount', '下车', '先上车，再演示主动下车', 4],
  ]),
  ...entries('dummy', '行为演示', [
    ['idle', '站立', '检查轮廓、材质与接地', 5],
    ['hit', '受击 / 击退', '真实命中、闪白与受力位移', 3],
    ['shoot', '射击', '朝鹈鹕发射敌方弹体', 5],
    ['reset', '倒下 / 归位', '受击归零后恢复生命并归位', 4],
    ['float', '水中漂浮', '水中浮力与阻尼', 5],
  ]),
  ...ENEMY_KINDS.flatMap((kind) => entries(kind, '堡垒运维队', [
    ['idle', '待机', '检查真实模型的轮廓、材质与接地', 5],
    ['move', '移动', '实际追踪移动与机械步态', 4],
    ['skill1', ENEMY_RULES[kind].skills[0].name, '技能一：真实准备、攻击判定与收招', 5],
    ['skill2', ENEMY_RULES[kind].skills[1].name, '技能二：真实准备、攻击判定与收招', kind === 'watchWasp' ? 8 : 5],
    ['hit', '受击', '鹈鹕吐水命中、闪光与击退', 4],
  ])),
  ...entries('watchWasp', '外观对比', [
    ['variants', '随机机群', '出生时固定机身配色、桨叶配色和双叶或三叶形态', 6],
  ]),
  ...entries('gatekeeper', '欧米动作', [
    ['tracking', '目标跟随', '主角往返跳跃，欧米使用实战头眼追踪与机械步态', 8],
  ]),
  ...FISH_SPECIES.map((species) => ({
    id: `fish.species.${species.id}`, actor: 'fish' as const, action: 'swim',
    label: species.name, group: '鱼类品种', description: species.description,
    seconds: 6, fishSpecies: species.id,
  })),
  ...entries('fish', '行为演示', [
    ['swim', '游动', '小鱼在水中漫游', 6],
    ['flee', '受惊逃离', '鹈鹕接近后加速逃离', 5],
    ['stranded', '搁浅扑腾', '岸边蹦跳、侧翻与尾巴扭动', 3],
    ['return', '重新入水', '岸边扑腾后回到水中', 4],
  ]),
];

export function showcaseEntry(id: string): ShowcaseEntry {
  const entry = SHOWCASE_ENTRIES.find((e) => e.id === id);
  if (!entry) throw new Error(`展示目录中不存在项目：${id}`);
  return entry;
}

export function parseAppMode(params: URLSearchParams): 'index' | 'game' | 'showcase' | 'resources' | 'lab' | 'intro' | 'facility' {
  const mode = params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : 'index');
  if (mode !== 'index' && mode !== 'game' && mode !== 'showcase' && mode !== 'resources' && mode !== 'lab' && mode !== 'intro' && mode !== 'facility') throw new Error(`未知页面模式：${mode}`);
  return mode;
}

export interface ShowcaseCard {
  readonly id: number;
  entryId: string;
  environment: ShowcaseEnvironment;
  facing: 1 | -1;
  targetDodge: boolean;
  modelYaw: number;
  modelPitch: number;
  speed: number;
  zoom: number;
  playing: boolean;
  loop: boolean;
  manual: boolean;
  humanView: 'world' | 'model';
  attackMotion: 'still' | 'walk' | 'run';
  /** 配置变化后重建该卡片的演示，其他卡片保持原进度。 */
  revision: number;
  resource: ResourceOptions | null;
}

export interface ShowcaseDemo {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cards: ReadonlyArray<{ readonly entryId: string; readonly environment?: ShowcaseEnvironment; readonly resource?: Partial<ResourceOptions> }>;
}

export interface ShowcaseCatalog {
  readonly demos?: readonly ShowcaseDemo[];
  /** 同时预览的卡片上限。 */
  readonly maxCards: number;
  readonly mode: 'showcase' | 'resources' | 'lab';
  readonly title: string;
  readonly library?: 'history';
  readonly subjects: ReadonlyArray<{ id: string; name: string; image: string; description: string; defaultEntry: string }>;
  readonly entries: readonly ShowcaseEntry<string>[];
}

const currentEntries = SHOWCASE_ENTRIES.filter((entry) => entry.actor !== 'human' || entry.grassyAnimation);
const historyEntries = SHOWCASE_ENTRIES.filter((entry) => entry.actor === 'human' && !entry.grassyAnimation);

export const CHARACTER_CATALOG: ShowcaseCatalog = {
  mode: 'showcase', title: '角色展示场', subjects: SHOWCASE_ACTORS, entries: currentEntries,
  maxCards: MAX_SHOWCASE_CARDS,
  demos: [{
    id: 'fortress-enemies', title: '堡垒运维队 · 四怪', description: '欧米、巡线犬、FPV 哨蜂和搬山；共享第一章模型与双技能，支持正面和侧面检查。',
    cards: ENEMY_KINDS.map((kind) => ({ entryId: `${kind}.idle` })),
  }, {
    id: 'omi-actions', title: '欧米 OMI-01 · 呼吸与双技能', description: '大头双钳机器人：待机呼吸与眼部扫描、主角跟随、夹臂横扫、突进夹击。',
    cards: ['idle', 'tracking', 'skill1', 'skill2'].map((action) => ({ entryId: `gatekeeper.${action}` })),
  }, {
    id: 'fortress-enemy-skills', title: '堡垒运维队 · 八技能', description: '四种敌人的两个技能，展示真实伤害与动作时间轴。',
    cards: ENEMY_KINDS.flatMap((kind) => [1, 2].map((index) => ({ entryId: `${kind}.skill${index}` }))),
  }, {
    id: 'drone-payloads', title: '无人机 · 投弹与随机外观', description: '白色机身与随机饰色、倾斜飞行、投弹爆炸及铝热剂持续燃烧。',
    cards: ['variants', 'move', 'skill1', 'skill2'].map((action) => ({ entryId: `watchWasp.${action}` })),
  }, {
    id: 'pelican-combat', title: '鹈鹕 · 吐水与四技能', description: '普通吐水、鱼群轰炸、振翅突进、吞弹反击与光子爆裂；每个场景均有真实受击目标。',
    cards: ['water', 'fish', 'dash', 'swallow', 'ultimate'].map((action) => ({ entryId: `pelican.${action}` })),
  }, {
    id: 'player-transform', title: '鹈鹕 ↔ 主角 · 双向变身', description: '羽毛生长或收退，身体随之换形；按 F 可在鹈鹕和 Grassy 之间切换。',
    cards: ['transform-human', 'transform-pelican'].map((action) => ({ entryId: `pelican.${action}` })),
  }, {
    id: 'grassy-rodin', title: 'Grassy · 正式装备角色', description: '键盘背负、呼吸与走路；切换跑跳、骑自行车、键盘战斗和推进飞行，三档精细度共用同一造型。',
    cards: [{ entryId: 'human.rodin-animated-game.idle' }],
  }, {
    id: 'grassy-rodin-animation', title: '移动与跳跃', description: '比较走路、跑步、前倾快跑和起跳落地；可以暂停、慢放与旋转观察。',
    cards: ['walk', 'run', 'sprint', 'jump'].map((action) => ({ entryId: `human.rodin-animated-game.${action}` })),
  }, {
    id: 'grassy-sprint', title: 'Grassy · 前倾快跑', description: '身体前倾、快速蹬地与屈膝回收；横版往返跑动时平滑转身，手动控制默认奔跑，按住 Shift 慢走。',
    cards: [{ entryId: 'human.rodin-animated-game.sprint' }],
  }, {
    id: 'grassy-ride', title: 'Grassy · 骑自行车', description: '坐稳车座、握住车把、双脚交替踩踏；车轮与链条同步转动，键盘保持背负。',
    cards: [{ entryId: 'human.rodin-animated-game.ride' }],
  }, {
    id: 'grassy-side-combat', title: 'Grassy · 横版实战', description: '完整动作、单手键盘连击、实体弹体与真实受击目标；支持移动和空中施法，也可手动控制。',
    cards: [{ entryId: 'human.rodin-animated-game.codex_attack' }],
  }, {
    id: 'grassy-smash', title: '普通攻击 · 砸键盘', description: '单手握住键盘短端，向左抡击、反手右挥；可切换起飞、悬停和前飞施法。',
    cards: [{ entryId: 'human.rodin-animated-game.keyboard_smash' }],
  }, {
    id: 'grassy-combat', title: '键盘战斗', description: '键盘左右连击、蓝白实体光弹、紫绿虫群与服务器超载；粒子与实体共同构成完整攻击效果。',
    cards: ['keyboard_smash', 'codex_attack', 'bug_attack', 'server_overload'].map((action) => ({ entryId: `human.rodin-animated-game.${action}` })),
  }, {
    id: 'grassy-airborne', title: 'Grassy · 空中战斗', description: '起飞、悬停和前飞中施放四种键盘攻击；推进器持续工作，实体弹体与粒子同时可见。',
    cards: [{ entryId: 'human.rodin-animated-game.codex_attack.takeoff', environment: 'underground' }],
  }, {
    id: 'grassy-photon', title: 'Grassy · 光子同行', description: '光子跟随人形，地面和空中均可召唤真实追踪弹；3 / E 释放光子，2 释放服务器超载。',
    cards: [{ entryId: 'human.rodin-animated-game.photon_burst' }],
  }, {
    id: 'grassy-flight', title: '推进飞行', description: '起飞、悬停、前飞与降落；飞行时保持键盘背负。',
    cards: ['takeoff', 'hover', 'fly_forward', 'land'].map((action) => ({ entryId: `human.rodin-animated-game.${action}` })),
  }, {
    id: 'sam-tibo', title: 'Sam & Tibo', description: 'The Model Router 与 The Reset Master · 在横版游戏场景中展示动作、技能与受击效果，可切换左右朝向和地上地下。',
    cards: [{ entryId: 'sam.idle' }, { entryId: 'tibo.idle' }],
  }, {
    id: 'sam', title: 'Sam · The Model Router', description: NPCS.sam.description,
    cards: [{ entryId: 'sam.idle' }],
  }, {
    id: 'tibo', title: 'Tibo · The Reset Master', description: NPCS.tibo.description,
    cards: [{ entryId: 'tibo.idle' }],
  }, {
    id: 'fish-varieties', title: '七种鱼类', description: '并排观察小鱼、金鱼、锦鲤、神仙鱼、鲶鱼、鲈鱼与虹鳟的轮廓和游动',
    cards: FISH_SPECIES.map((species) => ({ entryId: `fish.species.${species.id}` })),
  }],
};

export const CHARACTER_HISTORY_CATALOG: ShowcaseCatalog = {
  mode: 'showcase', library: 'history', title: '角色历史资料库',
  subjects: [{ id: 'human', name: 'Grassy · 历史版本', image: '/characters/human/history/models-rodin-refined/render-game-hero.png', description: '旧原画、比例稿、模型与工程归档', defaultEntry: 'human.rodin-refined-game' }],
  entries: historyEntries, maxCards: GRASSY_MODELS.length,
  demos: [{
    id: 'grassy-models', title: '全部历史模型', description: '归档的 18 个模型，使用原始模型与材质，可旋转和缩放检查。',
    cards: GRASSY_MODELS.map((model) => ({ entryId: `human.${model.id}` })),
  }, {
    id: 'grassy-methods', title: '建模方法对照', description: '原画校准、多视图贴图和早期程序建模，保留各自的原始结果。',
    cards: [{ entryId: 'human.reference-fit' }, { entryId: 'human.multiview' }, { entryId: 'human.detailed' }],
  }, {
    id: 'grassy-rodin-history', title: 'Rodin 精修过程', description: '对比原始 Rodin 与局部精修后的三档静态模型。',
    cards: [{ entryId: 'human.rodin-detailed' }, { entryId: 'human.rodin-refined-detailed' }, { entryId: 'human.rodin-refined-game' }, { entryId: 'human.rodin-refined-light' }],
  }],
};
