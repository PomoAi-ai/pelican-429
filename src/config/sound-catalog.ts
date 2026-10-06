import type { GameSound } from './game-audio.ts';

/** 与游戏 GameSound 一一对应，新增音效时必须补充可试听名称。 */
export const SOUND_LABELS: Record<GameSound, string> = {
  water: '吐水', fish: '鱼群轰炸', dash: '振翅突进', gulp: '张嘴吞吸', swallow: '吞弹成功',
  photonCharge: '光子蓄力', photonBurst: '光子爆裂', keyboard: '键盘连击', codex: 'Codex 光弹',
  bug: 'Bug 虫群', overloadCharge: '服务器超载 · 蓄力', overloadBurst: '服务器超载 · 爆发',
  jump: '起跳', land: '落地', stepStone: '石面脚步', stepMetal: '金属脚步', stepGrate: '格栅脚步',
  wing: '拍翼', jet: '喷气', glide: '滑翔', pedal: '蹬车', coast: '滑行', brake: '刹车', mount: '上车',
  hurt: '受伤', metalHit: '金属命中', splash: '入水', death: '倒下', respawn: '重生', transform: '形态切换',
  gate: '堡垒大门', exit: '抵达出口', enemyWindup: '机械敌人 · 起手', enemyStrike: '机械敌人 · 攻击',
  bomb: '炸弹爆炸', thermite: '铝热剂燃烧', rotor: '无人机旋翼',
};

export const SOUND_NOTES: Partial<Record<GameSound, string>> = {
  water: '水泡起音 · 液体尾声', keyboard: '键帽碎响 · 键盘实体撞击',
  photonCharge: '玻璃泛音逐级升起', photonBurst: '清亮光子散射 · 长谐波尾音',
  overloadCharge: '继电器加速 · 低频电流蓄积', overloadBurst: '断电冲击 · 机架碎响',
  stepStone: '鞋底闷击 · 细碎石屑', stepMetal: '金属板共振 · 轻微音高变化',
  stepGrate: '格栅颤动 · 双层接触声', metalHit: '实体撞击 · 不规则金属泛音',
  bomb: '爆破冲击 · 碎片落下', thermite: '持续嘶鸣 · 零散火花', rotor: '电机底音 · 叶片脉动',
};
