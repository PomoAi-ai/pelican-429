import { SHOWCASE_ENGLISH, translateShowcaseText } from './showcase-language.ts';
import { WORLD_MUSIC } from '../config/world-music.ts';

/** Sound names stay shared with the game; translations only affect presentation. */
export const SOUND_ENGLISH: Record<string, string> = {
  ...Object.fromEntries(Object.values(WORLD_MUSIC).flatMap(track => [[track.title, track.titleEn], [track.notes, track.notesEn]])),
  '大世界音乐': 'World music', '大世界': 'Open world', '遭遇战': 'Encounter',
  '声音目录 · 鹈鹕 429': 'Sound library · Pelican 429',
  '一次听一个。背景、环境、技能与角色声音，直接复用游戏音源。': 'Listen to one sound at a time. Music, ambience, skills, and voices use the actual game audio.',
  '查找声音': 'Find sounds', '黑洞、脚步、Sam…': 'Black hole, footsteps, Sam…', '试听音量': 'Preview volume',
  '停止播放': 'Stop playback', '选择下方声音开始试听': 'Choose a sound below to listen',
  '已停止 · 选择声音继续试听': 'Stopped · Choose a sound to continue', '距黑洞中心': 'Distance from black hole',
  '拖动模拟离开黑洞区域；远处逐渐安静。': 'Drag to move away from the black hole; the sound fades with distance.',
  '声音分类': 'Sound categories', '全部': 'All', '背景音乐': 'Music', '环境声音': 'Ambience', '技能与动作': 'Skills and movement',
  '冷启动 · 序章开场': 'Cold start · Prelude opening', '机房堡垒': 'Compute fortress', '探索': 'Exploration', '警戒': 'Alert', '战斗': 'Combat',
  '黑洞 · 引力旋涡': 'Black hole · Gravity vortex', '堡垒外部': 'Fortress exterior', '入口': 'Entrance',
  '服务器机架': 'Server racks', '网络核心': 'Network core', '屋顶风声': 'Rooftop wind', '角色招呼': 'Greeting',
  '开场旋律 · 约 15 秒': 'Opening melody · About 15 seconds', '循环配乐 · 点击停止结束': 'Looping music · Click Stop to finish',
  '持续环境声 · 点击停止结束': 'Continuous ambience · Click Stop to finish', '引力呼吸与旋涡 · 可调整距离': 'Pulsing gravity and vortex · Adjustable distance',
  '合成角色拟声': 'Synthesized character voice', '数据脉冲 / 玻璃能量': 'Data pulses / glass energy', '低喉拟声 / 机械复位': 'Low growls / mechanical reset', '单次音效': 'One-shot sound',
  '吐水': 'Water spit', '鱼群轰炸': 'Fish barrage', '振翅突进': 'Wing dash', '张嘴吞吸': 'Swallow suction', '吞弹成功': 'Projectile swallowed',
  '光子蓄力': 'Photon charge', '光子爆裂': 'Photon burst', '键盘连击': 'Keyboard combo', 'Codex 光弹': 'Codex projectile',
  '蓄力': 'Charging', '爆发': 'Burst',
  '起跳': 'Jump', '落地': 'Landing', '石面脚步': 'Stone footsteps', '金属脚步': 'Metal footsteps', '格栅脚步': 'Grate footsteps',
  '拍翼': 'Wing flap', '喷气': 'Thruster', '蹬车': 'Pedaling', '滑行': 'Coasting', '刹车': 'Braking',
  '受伤': 'Hurt', '金属命中': 'Metal impact', '入水': 'Water splash', '倒下': 'Death', '重生': 'Respawn', '形态切换': 'Transformation',
  '堡垒大门': 'Fortress gate', '抵达出口': 'Exit reached', '机械敌人 · 起手': 'Robot enemy · Windup', '机械敌人 · 攻击': 'Robot enemy · Attack',
  '炸弹爆炸': 'Bomb explosion', '铝热剂燃烧': 'Thermite burning', '无人机旋翼': 'Drone rotors',
  '水泡起音 · 液体尾声': 'Bubble onset · Liquid tail', '键帽碎响 · 键盘实体撞击': 'Keycap rattle · Solid keyboard impact',
  '玻璃泛音逐级升起': 'Rising glass harmonics', '清亮光子散射 · 长谐波尾音': 'Bright photon scattering · Long harmonic tail',
  '继电器加速 · 低频电流蓄积': 'Accelerating relays · Low-frequency charge', '断电冲击 · 机架碎响': 'Power-cut impact · Rack rattle',
  '鞋底闷击 · 细碎石屑': 'Muffled soles · Small stone chips', '金属板共振 · 轻微音高变化': 'Metal plate resonance · Slight pitch variation',
  '格栅颤动 · 双层接触声': 'Grate vibration · Layered contact', '实体撞击 · 不规则金属泛音': 'Solid impact · Irregular metal harmonics',
  '爆破冲击 · 碎片落下': 'Explosion impact · Falling debris', '持续嘶鸣 · 零散火花': 'Continuous hiss · Scattered sparks', '电机底音 · 叶片脉动': 'Motor hum · Blade pulses',
};

export function translateSoundText(source: string): string | undefined {
  const exact = SOUND_ENGLISH[source] ?? SHOWCASE_ENGLISH[source];
  if (exact) return exact;
  const count = source.match(/^(\d+(?:\.\d+)?) (个声音|格|秒)$/);
  if (count) return `${count[1]} ${count[2] === '个声音' ? 'sounds' : count[2] === '格' ? 'tiles' : 'seconds'}`;
  const playing = source.match(/^(正在播放 · |播放 )(.*)$/);
  if (playing) return `${playing[1] === '播放 ' ? 'Play ' : 'Playing · '}${translateSoundText(playing[2]!) ?? playing[2]}`;
  if (source.startsWith('播放失败：')) return `Playback failed: ${source.slice('播放失败：'.length)}`;
  // Resolve complete showcase sentences before splitting; sound-specific fragments can still remain.
  const showcase = translateShowcaseText(source);
  const combined = showcase ?? source;
  if (combined.includes(' · ')) {
    const parts = combined.split(' · ');
    const translated = parts.map((part) => translateSoundText(part) ?? part);
    if (translated.some((part, index) => part !== parts[index])) return translated.join(' · ');
  }
  return showcase;
}
