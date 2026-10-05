import { ENEMY_MODEL_DIRS } from './enemy-models.ts';
import { ENEMY_RULES } from './enemy-rules.ts';
import type { EnemyKind } from './enemy-rules.ts';
import type { ShowcaseActor } from './showcase.ts';
import { GRASSY_MODELS } from './grassy.ts';

export interface CharacterAsset {
  readonly group: string;
  readonly label: string;
  readonly path: string;
  readonly thumbnail: string;
}

function enemyImages(kind: EnemyKind): readonly CharacterAsset[] {
  const directory = ENEMY_MODEL_DIRS[kind];
  return [
    ...[['thumbnail', '真实模型'], ['front', '正面'], ['side', '侧面']].map(([file, label]) => ({ group: '模型多视图', label: `${ENEMY_RULES[kind].name} · ${label}`, path: `${directory}/${file}.png`, thumbnail: `${directory}/${file}.png` })),
    { group: '正侧面参考', label: `${ENEMY_RULES[kind].name} · 原画`, path: `${directory}/reference.png`, thumbnail: `${directory}/reference.png` },
  ];
}

export const CHARACTER_ASSETS: Readonly<Record<ShowcaseActor, readonly CharacterAsset[]>> = {
  sam: [
    ...[['front', '正面'], ['back', '背面'], ['left', '左侧'], ['right', '右侧']].flatMap(([view, label]) => [
      { group: '四方向参考', label: `Sam · ${label}`, path: `reference-${view}.png`, thumbnail: `reference-${view}.png` },
      { group: '模型多视图', label: `Sam · 模型${label}`, path: `render-${view}.png`, thumbnail: `render-${view}.png` },
    ]),
  ],
  tibo: [
    ...[['front', '正面'], ['back', '背面'], ['left', '左侧'], ['right', '右侧']].flatMap(([view, label]) => [
      { group: '四方向参考', label: `Tibo · ${label}`, path: `reference-${view}.png`, thumbnail: `reference-${view}.png` },
      { group: '模型多视图', label: `Tibo · 模型${label}`, path: `render-${view}.png`, thumbnail: `render-${view}.png` },
    ]),
  ],
  luma: [
    { group: '模型多视图', label: '光子 · 默认视角', path: '/characters/luma/portrait.jpg', thumbnail: '/characters/luma/portrait.jpg' },
  ],
  human: [
    { group: '超载效果新版', label: '服务器超载 · 悬浮阵列与等离子冲击', path: '/characters/human/equipment-concepts/combat-v4/server-overload.png', thumbnail: '/characters/human/equipment-concepts/combat-v4/server-overload.png' },
    { group: '装备概念', label: '推进飞行 · 装备定稿', path: '/characters/human/equipment-concepts/flight.png', thumbnail: '/characters/human/equipment-concepts/flight.png' },
    { group: '装备概念', label: '键盘武器 · Codex 攻击', path: '/characters/human/equipment-concepts/codex-attack.png', thumbnail: '/characters/human/equipment-concepts/codex-attack.png' },
    { group: '装备概念', label: '非攻击姿态 · 键盘背负', path: '/characters/human/equipment-concepts/keyboard-stowed.png', thumbnail: '/characters/human/equipment-concepts/keyboard-stowed.png' },
    ...[['keyboard-one-hand-combo', '键盘单手连击'], ['codex-barrage', 'Codex 实体光弹'], ['bug-swarm', 'Bug 虫群'], ['server-overload', '服务器超载']].map(([file, label]) => ({
      group: '战斗效果概念', label: `${label} · 概念图`,
      path: `/characters/human/equipment-concepts/combat-v2/${file}.png`,
      thumbnail: `/characters/human/equipment-concepts/combat-v2/${file}.png`,
    })),
    ...[['airborne-keyboard', '空中键盘单手连击'], ['airborne-codex', '空中 Codex 光弹'], ['airborne-bug', '空中 Bug 虫群'], ['airborne-overload', '空中服务器超载']].map(([file, label]) => ({
      group: '空中技能概念', label: `${label} · 概念图`,
      path: `/characters/human/equipment-concepts/combat-v3/${file}.png`,
      thumbnail: `/characters/human/equipment-concepts/combat-v3/${file}.png`,
    })),
    ...[['hero', '三分之四'], ['front', '正面'], ['right', '右侧'], ['left', '左侧'], ['back', '背面']].map(([view, label]) => ({
      group: '模型多视图', label: `正式装备模型 · ${label}`,
      path: `/characters/human/models-equipped/render-game-${view}.png`,
      thumbnail: `/characters/human/models-equipped/render-game-${view}.png`,
    })),
    ...[['hero', '三分之四'], ['right', '右侧']].map(([view, label]) => ({
      group: '骑行模型', label: `Grassy 骑自行车 · ${label}`,
      path: `/characters/human/models-equipped/render-game-ride-${view}.png`,
      thumbnail: `/characters/human/models-equipped/render-game-ride-${view}.png`,
    })),
    { group: '角色卡', label: 'Grassy · 人类形态', path: '/characters/human/grassy-human-card.png', thumbnail: '/characters/human/grassy-human-card.png' },
    { group: '四方向参考', label: '人形定稿 · 正面', path: '/characters/human/turnaround-master-v2/front.png', thumbnail: '/characters/human/turnaround-master-v2/front.png' },
    { group: '四方向参考', label: '人形定稿 · 背面', path: '/characters/human/turnaround-master-v2/back.png', thumbnail: '/characters/human/turnaround-master-v2/back.png' },
    { group: '四方向参考', label: '人形定稿 · 左侧', path: '/characters/human/turnaround-master-v2/left.png', thumbnail: '/characters/human/turnaround-master-v2/left.png' },
    { group: '四方向参考', label: '人形定稿 · 右侧母版', path: '/characters/human/turnaround-master-v2/right.png', thumbnail: '/characters/human/turnaround-master-v2/right.png' },
  ],
  pelican: [
    { group: '角色卡', label: 'Grassy · 鹈鹕形态', path: '/characters/pelican/grassy-pelican-card.png', thumbnail: '/characters/pelican/grassy-pelican-card.png' },
    ...[['normal-and-three-skills-v1', '吐水普攻与三个技能'], ['photon-swarm-ultimate-v1', '光子爆裂大招']].map(([file, label]) => ({
      group: '战斗效果概念', label: `${label} · 概念图`, path: `skill-concepts/${file}.png`, thumbnail: `skill-concepts/${file}.png`,
    })),
    {"group": "2D 原画", "label": "2D 原画 · 四分之三", "path": "02-pelican-2d-three-quarter.png", "thumbnail": "02-pelican-2d-three-quarter.png"},
    {"group": "2D 原画", "label": "2D 原画 · 正侧面", "path": "01-pelican-2d-profile.png", "thumbnail": "01-pelican-2d-profile.png"},
    {"group": "2D 原画", "label": "2D 原画 · 对齐版", "path": "02-pelican-2d-aligned.png", "thumbnail": "02-pelican-2d-aligned.png"},
    {"group": "3D 参考", "label": "3D 参考 · 白色修订版", "path": "03-pelican-3d-profile-white-v2.png", "thumbnail": "03-pelican-3d-profile-white-v2.png"},
    {"group": "3D 参考", "label": "3D 参考 · 早期侧面", "path": "03-pelican-3d-profile.png", "thumbnail": "03-pelican-3d-profile.png"},
    {"group": "3D 参考", "label": "3D 参考 · 四分之三", "path": "04-pelican-3d-three-quarter.png", "thumbnail": "04-pelican-3d-three-quarter.png"},
    {"group": "3D 参考", "label": "3D 参考 · 对齐版", "path": "03-pelican-3d-aligned.png", "thumbnail": "03-pelican-3d-aligned.png"},
    {"group": "模型多视图", "label": "细修版 · 默认视角", "path": "hub/refined-t15_5.jpg", "thumbnail": "hub/refined-t15_5-thumb.jpg"},
    {"group": "模型多视图", "label": "细修版 · 左侧", "path": "hub/refined-left.jpg", "thumbnail": "hub/refined-left-thumb.jpg"},
    {"group": "模型多视图", "label": "细修版 · 背面", "path": "hub/refined-back.jpg", "thumbnail": "hub/refined-back-thumb.jpg"},
    {"group": "模型多视图", "label": "细修版 · 俯视", "path": "hub/refined-top.jpg", "thumbnail": "hub/refined-top-thumb.jpg"},
    {"group": "模型多视图", "label": "细修版 · 翅膀特写", "path": "hub/refined-wing.jpg", "thumbnail": "hub/refined-wing-thumb.jpg"},
    {"group": "模型多视图", "label": "原版 · 默认视角", "path": "hub/original-t15_5.jpg", "thumbnail": "hub/original-t15_5-thumb.jpg"},
    {"group": "模型多视图", "label": "原版 · 左侧", "path": "hub/original-left.jpg", "thumbnail": "hub/original-left-thumb.jpg"},
    {"group": "模型多视图", "label": "原版 · 背面", "path": "hub/original-back.jpg", "thumbnail": "hub/original-back-thumb.jpg"},
    {"group": "模型多视图", "label": "原版 · 俯视", "path": "hub/original-top.jpg", "thumbnail": "hub/original-top-thumb.jpg"},
    {"group": "模型多视图", "label": "原版 · 翅膀特写", "path": "hub/original-wing.jpg", "thumbnail": "hub/original-wing-thumb.jpg"},
    {"group": "演变对照", "label": "细修版与 2D 原画对照", "path": "hub/compare-2d.png", "thumbnail": "hub/compare-2d.png"},
    {"group": "演变对照", "label": "细修版与 3D 参考对照", "path": "hub/compare-3d.png", "thumbnail": "hub/compare-3d.png"},
    {"group": "演变对照", "label": "早期模型与 2D 原画对照", "path": "compare-2d.png", "thumbnail": "compare-2d.png"},
    {"group": "演变对照", "label": "早期模型与 3D 参考对照", "path": "compare-3d.png", "thumbnail": "compare-3d.png"},
    {"group": "演变对照", "label": "早期演变六帧", "path": "evolution-strip.png", "thumbnail": "evolution-strip.png"},
    {"group": "演变对照", "label": "第三版演变六帧", "path": "versions/v3-strip.jpg", "thumbnail": "versions/v3-strip.jpg"},
    {"group": "演变对照", "label": "细修版 · 2D 起点", "path": "hub/refined-t0.jpg", "thumbnail": "hub/refined-t0-thumb.jpg"},
    {"group": "演变对照", "label": "细修版 · 体积过渡", "path": "hub/refined-t6_7.jpg", "thumbnail": "hub/refined-t6_7-thumb.jpg"},
    {"group": "演变对照", "label": "原版 · 2D 起点", "path": "hub/original-t0.jpg", "thumbnail": "hub/original-t0-thumb.jpg"},
    {"group": "演变对照", "label": "原版 · 体积过渡", "path": "hub/original-t6_7.jpg", "thumbnail": "hub/original-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第一版 · 2D 起点", "path": "versions/v1-t0.jpg", "thumbnail": "versions/v1-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第一版 · 体积过渡", "path": "versions/v1-t6_7.jpg", "thumbnail": "versions/v1-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第一版 · 3D 终点", "path": "versions/v1-t15_5.jpg", "thumbnail": "versions/v1-t15_5-thumb.jpg"},
    {"group": "历史版本", "label": "第二版 · 2D 起点", "path": "versions/v2-t0.jpg", "thumbnail": "versions/v2-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第二版 · 体积过渡", "path": "versions/v2-t6_7.jpg", "thumbnail": "versions/v2-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第二版 · 3D 终点", "path": "versions/v2-t15_5.jpg", "thumbnail": "versions/v2-t15_5-thumb.jpg"},
    {"group": "历史版本", "label": "第三版 · 2D 起点", "path": "versions/v3-t0.jpg", "thumbnail": "versions/v3-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第三版 · 体积过渡", "path": "versions/v3-t6_7.jpg", "thumbnail": "versions/v3-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第三版 · 3D 终点", "path": "versions/v3-t15_5.jpg", "thumbnail": "versions/v3-t15_5-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 1 批 · 2D 起点", "path": "versions/r4-1-t0.jpg", "thumbnail": "versions/r4-1-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 1 批 · 体积过渡", "path": "versions/r4-1-t6_7.jpg", "thumbnail": "versions/r4-1-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 1 批 · 3D 终点", "path": "versions/r4-1-t15_5.jpg", "thumbnail": "versions/r4-1-t15_5-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 2 批 · 2D 起点", "path": "versions/r4-2-t0.jpg", "thumbnail": "versions/r4-2-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 2 批 · 体积过渡", "path": "versions/r4-2-t6_7.jpg", "thumbnail": "versions/r4-2-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 2 批 · 3D 终点", "path": "versions/r4-2-t15_5.jpg", "thumbnail": "versions/r4-2-t15_5-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 3 批 · 2D 起点", "path": "versions/r4-3-t0.jpg", "thumbnail": "versions/r4-3-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 3 批 · 体积过渡", "path": "versions/r4-3-t6_7.jpg", "thumbnail": "versions/r4-3-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 3 批 · 3D 终点", "path": "versions/r4-3-t15_5.jpg", "thumbnail": "versions/r4-3-t15_5-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 4 批 · 2D 起点", "path": "versions/r4-4-t0.jpg", "thumbnail": "versions/r4-4-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 4 批 · 体积过渡", "path": "versions/r4-4-t6_7.jpg", "thumbnail": "versions/r4-4-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第四轮第 4 批 · 3D 终点", "path": "versions/r4-4-t15_5.jpg", "thumbnail": "versions/r4-4-t15_5-thumb.jpg"},
    {"group": "历史版本", "label": "第四版 · 2D 起点", "path": "versions/v4-t0.jpg", "thumbnail": "versions/v4-t0-thumb.jpg"},
    {"group": "历史版本", "label": "第四版 · 体积过渡", "path": "versions/v4-t6_7.jpg", "thumbnail": "versions/v4-t6_7-thumb.jpg"},
    {"group": "历史版本", "label": "第四版 · 3D 终点", "path": "versions/v4-t15_5.jpg", "thumbnail": "versions/v4-t15_5-thumb.jpg"},
    {"group": "骑行素材", "label": "湖边骑行 · SVG 原画", "path": "ride/pelican-breezy-ride.svg", "thumbnail": "ride/pelican-breezy-ride.svg"},
    {"group": "骑行素材", "label": "骑行模型 · 站立", "path": "hub/ride-stand.jpg", "thumbnail": "hub/ride-stand-thumb.jpg"},
    {"group": "骑行素材", "label": "骑行模型 · 侧面", "path": "hub/ride-side.jpg", "thumbnail": "hub/ride-side-thumb.jpg"},
    {"group": "骑行素材", "label": "骑行模型 · 四分之三", "path": "hub/ride-three-quarter.jpg", "thumbnail": "hub/ride-three-quarter-thumb.jpg"},
    {"group": "骑行素材", "label": "骑行模型 · 下车", "path": "hub/ride-dismount.jpg", "thumbnail": "hub/ride-dismount-thumb.jpg"},
    {"group": "骑行素材", "label": "自行车插画 · SVG", "path": "ride/pelican-bicycle.svg", "thumbnail": "ride/pelican-bicycle.svg"},
    {"group": "骑行素材", "label": "自行车插画 · PNG", "path": "ride/pelican-bicycle-preview.png", "thumbnail": "ride/pelican-bicycle-preview.png"},
    {"group": "骑行素材", "label": "骑行预览 · GIF", "path": "ride/pelican-bicycle-preview.gif", "thumbnail": "ride/pelican-bicycle-preview.gif"},
    {"group": "骑行素材", "label": "骑行动画 · SVG", "path": "ride/pelican-cycle-animation.svg", "thumbnail": "ride/pelican-cycle-animation.svg"},
    {"group": "骑行素材", "label": "骑行插画 · SVG", "path": "ride/pelican-cycling.svg", "thumbnail": "ride/pelican-cycling.svg"},
    {"group": "骑行素材", "label": "骑车原稿 · SVG", "path": "ride/pelican-riding-bike.svg", "thumbnail": "ride/pelican-riding-bike.svg"},
    {"group": "骑行素材", "label": "海岸骑行原始参考 · SVG", "path": "ride/coastal-reference.svg", "thumbnail": "ride/coastal-reference.svg"},
  ],
  dummy: [],
  gatekeeper: enemyImages('gatekeeper'), lineHound: enemyImages('lineHound'),
  watchWasp: enemyImages('watchWasp'), loadmaster: enemyImages('loadmaster'),
  fish: [],
};

/** Archived imagery is intentionally separate from the current character's reference set. */
export const GRASSY_HISTORY_ASSETS: readonly CharacterAsset[] = [
  { group: '场景比例对照', label: '门框对照 · 3.1 格定稿', path: '/characters/human/history/design-studies/doorway-reference-3p1-tiles.png', thumbnail: '/characters/human/history/design-studies/doorway-reference-3p1-tiles.png' },
  { group: '场景比例对照', label: '门框对照 · 初稿', path: '/characters/human/history/design-studies/doorway-reference-scene.png', thumbnail: '/characters/human/history/design-studies/doorway-reference-scene.png' },
  { group: '场景比例对照', label: '门框对照 · 增高试稿', path: '/characters/human/history/design-studies/doorway-reference-taller.png', thumbnail: '/characters/human/history/design-studies/doorway-reference-taller.png' },
  { group: '早期角色卡', label: '角色卡探索 · 第一版', path: '/characters/human/history/design-studies/grassy-character-card-v1.png', thumbnail: '/characters/human/history/design-studies/grassy-character-card-v1.png' },
  { group: '早期角色卡', label: '角色卡探索 · 第二版', path: '/characters/human/history/design-studies/grassy-character-card-v2.png', thumbnail: '/characters/human/history/design-studies/grassy-character-card-v2.png' },
  { group: '早期角色卡', label: '角色卡探索 · 第三版', path: '/characters/human/history/design-studies/grassy-character-card-v3.png', thumbnail: '/characters/human/history/design-studies/grassy-character-card-v3.png' },
  { group: '场景比例对照', label: '头身比例 · 并排比较', path: '/characters/human/history/design-studies/proportion-comparison.jpg', thumbnail: '/characters/human/history/design-studies/proportion-comparison.jpg' },
  { group: '场景比例对照', label: '头身比例 · 游戏视距', path: '/characters/human/history/design-studies/proportion-game-distance.jpg', thumbnail: '/characters/human/history/design-studies/proportion-game-distance.jpg' },
  { group: '场景比例对照', label: '场景比例 · 近景', path: '/characters/human/history/design-studies/proportion-scene-close.jpg', thumbnail: '/characters/human/history/design-studies/proportion-scene-close.jpg' },
  { group: '场景比例对照', label: '场景比例 · 游戏视距', path: '/characters/human/history/design-studies/proportion-scene-game.jpg', thumbnail: '/characters/human/history/design-studies/proportion-scene-game.jpg' },
  { group: '场景比例对照', label: '侧面原画入场景 · 近景', path: '/characters/human/history/design-studies/side-reference-scene-close.png', thumbnail: '/characters/human/history/design-studies/side-reference-scene-close.png' },
  { group: '场景比例对照', label: '侧面原画入场景 · 游戏视距', path: '/characters/human/history/design-studies/side-reference-scene-game.png', thumbnail: '/characters/human/history/design-studies/side-reference-scene-game.png' },
  ...GRASSY_MODELS.flatMap((model) => [
    ['front', '正面'], ['back', '背面'], ['left', '左侧'], ['right', '右侧'], ['hero', '三分之四'],
  ].map(([view, label]) => ({
    group: '历史模型多视图', label: `${model.label} · ${label}`,
    path: `${model.renderPrefix}-${view}.png`, thumbnail: `${model.renderPrefix}-${view}.png`,
  }))),
  { group: '头身比例稿', label: '2 头身', path: '/characters/human/history/proportions/a-2-heads.png', thumbnail: '/characters/human/history/proportions/a-2-heads.png' },
  { group: '头身比例稿', label: '2.5 头身', path: '/characters/human/history/proportions/b-2p5-heads.png', thumbnail: '/characters/human/history/proportions/b-2p5-heads.png' },
  { group: '头身比例稿', label: '3 头身 · 第二版', path: '/characters/human/history/proportions/c-3-heads-v2.png', thumbnail: '/characters/human/history/proportions/c-3-heads-v2.png' },
  { group: '头身比例稿', label: '3 头身 · 第三版', path: '/characters/human/history/proportions/c-3-heads-v3.png', thumbnail: '/characters/human/history/proportions/c-3-heads-v3.png' },
  { group: '头身比例稿', label: '3 头身 · 第一版', path: '/characters/human/history/proportions/c-3-heads.png', thumbnail: '/characters/human/history/proportions/c-3-heads.png' },
  { group: '头身比例稿', label: '3.5 头身', path: '/characters/human/history/proportions/d-3p5-heads.png', thumbnail: '/characters/human/history/proportions/d-3p5-heads.png' },
  { group: '头身比例稿', label: '4 头身 · 第二版', path: '/characters/human/history/proportions/e-4-heads-v2.png', thumbnail: '/characters/human/history/proportions/e-4-heads-v2.png' },
  { group: '头身比例稿', label: '4 头身 · 第三版', path: '/characters/human/history/proportions/e-4-heads-v3.png', thumbnail: '/characters/human/history/proportions/e-4-heads-v3.png' },
  { group: '头身比例稿', label: '4 头身 · 第一版', path: '/characters/human/history/proportions/e-4-heads.png', thumbnail: '/characters/human/history/proportions/e-4-heads.png' },
  { group: '头身比例稿', label: '3.1 头身 · 修订稿', path: '/characters/human/history/proportions/grassy-3p1-heads-v2.png', thumbnail: '/characters/human/history/proportions/grassy-3p1-heads-v2.png' },
  { group: '头身比例稿', label: '3.1 头身 · 初稿', path: '/characters/human/history/proportions/grassy-3p1-heads.png', thumbnail: '/characters/human/history/proportions/grassy-3p1-heads.png' },
  { group: '头身比例稿', label: '3.25 头身', path: '/characters/human/history/proportions/grassy-3p25-heads.png', thumbnail: '/characters/human/history/proportions/grassy-3p25-heads.png' },
  { group: '早期四方向', label: '早期四方向 · 背面', path: '/characters/human/history/turnaround/back.png', thumbnail: '/characters/human/history/turnaround/back.png' },
  { group: '早期四方向', label: '早期四方向 · 正面', path: '/characters/human/history/turnaround/front.png', thumbnail: '/characters/human/history/turnaround/front.png' },
  { group: '早期四方向', label: '早期四方向 · 左侧', path: '/characters/human/history/turnaround/left.png', thumbnail: '/characters/human/history/turnaround/left.png' },
  { group: '早期四方向', label: '早期四方向 · 右侧', path: '/characters/human/history/turnaround/right.png', thumbnail: '/characters/human/history/turnaround/right.png' },
  { group: '3.1 比例试稿', label: '3.1 比例试稿 · 背面', path: '/characters/human/history/turnaround-3p1/back.png', thumbnail: '/characters/human/history/turnaround-3p1/back.png' },
  { group: '3.1 比例试稿', label: '3.1 比例试稿 · 正面', path: '/characters/human/history/turnaround-3p1/front.png', thumbnail: '/characters/human/history/turnaround-3p1/front.png' },
  { group: '3.1 比例试稿', label: '3.1 比例试稿 · 左侧', path: '/characters/human/history/turnaround-3p1/left.png', thumbnail: '/characters/human/history/turnaround-3p1/left.png' },
  { group: '3.1 比例试稿', label: '3.1 比例试稿 · 侧面透明底', path: '/characters/human/history/turnaround-3p1/right-cutout.png', thumbnail: '/characters/human/history/turnaround-3p1/right-cutout.png' },
  { group: '3.1 比例试稿', label: '3.1 比例试稿 · 右侧', path: '/characters/human/history/turnaround-3p1/right.png', thumbnail: '/characters/human/history/turnaround-3p1/right.png' },
  { group: '四方向修订稿', label: '四方向修订稿 · 背面', path: '/characters/human/history/turnaround-final-3p1/back.png', thumbnail: '/characters/human/history/turnaround-final-3p1/back.png' },
  { group: '四方向修订稿', label: '四方向修订稿 · 正面', path: '/characters/human/history/turnaround-final-3p1/front.png', thumbnail: '/characters/human/history/turnaround-final-3p1/front.png' },
  { group: '四方向修订稿', label: '四方向修订稿 · 左侧', path: '/characters/human/history/turnaround-final-3p1/left.png', thumbnail: '/characters/human/history/turnaround-final-3p1/left.png' },
  { group: '四方向修订稿', label: '四方向修订稿 · 右侧', path: '/characters/human/history/turnaround-final-3p1/right.png', thumbnail: '/characters/human/history/turnaround-final-3p1/right.png' },
  { group: '母版试稿', label: '母版试稿 · 正面试稿', path: '/characters/human/history/turnaround-master-v2/front-draft.png', thumbnail: '/characters/human/history/turnaround-master-v2/front-draft.png' },
]

export const GRASSY_HISTORY_DOWNLOADS = [
  { label: '旧呼吸与走路 · 精细版 GLB', path: '/characters/human/history/models-rodin-animated/grassy-rodin-animated-detailed.glb' },
  { label: '旧呼吸与走路 · 游戏标准版 GLB', path: '/characters/human/history/models-rodin-animated/grassy-rodin-animated-game.glb' },
  { label: '旧呼吸与走路 · 游戏轻量版 GLB', path: '/characters/human/history/models-rodin-animated/grassy-rodin-animated-light.glb' },
  { label: '历史资源说明与工程索引', path: '/characters/human/history/README.md' },
  { label: '完整迁移清单', path: '/characters/human/history/migration.json' },
] as const;
