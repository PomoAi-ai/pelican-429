/** 当前角色的普攻与专属技能：资源、冷却和施放阶段。 */
import type { WeaponsTuning } from '../config/weapon-rules.ts';
import { HUMAN_SKILLS } from '../config/human-combat.ts';
import { PELICAN_SKILLS } from '../config/pelican-skills.ts';
import { PHOTON_ULTIMATE } from '../config/photon-ultimate.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { Entity } from '../entities/entity.ts';
import { SKILL_ACTIONS } from '../config/keybindings.ts';
import type { GameAction } from '../config/keybindings.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export const TOAST_SECONDS = 1.2;
const TOAST_FADE = 0.25;
const SKILLS = [
  { key: '右键', name: '鱼群轰炸', en: 'Fish barrage', cooldown: PELICAN_SKILLS.fishCooldownTicks },
  { key: '1', name: '振翅突进', en: 'Wing dash', cooldown: PELICAN_SKILLS.dashCooldownTicks },
  { key: '2', name: '吞弹反击', en: 'Swallow & return', cooldown: PELICAN_SKILLS.swallowCooldownTicks },
  { key: '3 / E', name: '光子爆裂', en: 'Photon Burst', cooldown: PHOTON_ULTIMATE.cooldownTicks },
] as const;

const HUMAN_SLOTS = [
  { key: '右键', name: 'Codex 攻击', en: 'Codex attack', action: 'codex_attack' },
  { key: '1', name: 'Bug 攻击', en: 'Bug attack', action: 'bug_attack' },
  { key: '2', name: '服务器超载', en: 'Server overload', action: 'server_overload' },
] as const;

export interface WeaponHudOptions { readonly weapons: WeaponsTuning; readonly onTransform: () => void; readonly onSkill: (action: GameAction) => void }
export interface WeaponHudFrame {
  readonly entities: readonly Entity[];
  readonly playerId: number;
  readonly frameDt: number;
  readonly photonCooldownTicks: number;
  readonly photonChargeTicks: number;
  readonly photonActiveTicks: number;
}
export interface WeaponHud {
  handleEvents(events: readonly SimEvent[]): void;
  update(frame: WeaponHudFrame): void;
  readonly toast: string;
  dispose(): void;
}

function el(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

export function createWeaponHud(root: HTMLElement, options: WeaponHudOptions): WeaponHud {
  const W = options.weapons;
  const panel = el('div', 'hud-weapon', root);
  const main = el('div', 'hud-weapon-main', panel);
  const icon = el('div', 'hud-weapon-icon', main);
  const info = el('div', 'hud-weapon-info', main);
  const name = el('div', 'hud-weapon-name', info);
  const health = el('div', 'hud-player-health', info);
  const healthLabel = el('span', 'hud-player-health-label', health);
  const healthFill = el('div', 'hud-player-health-fill', el('div', 'hud-player-health-track', health));
  const fill = el('div', 'hud-weapon-fill', el('div', 'hud-weapon-track', info));
  const detail = el('div', 'hud-weapon-detail', info);
  const form = el('div', 'hud-weapon-detail', info);
  const switchCharacter = document.createElement('button');
  switchCharacter.type = 'button';
  switchCharacter.className = 'hud-character-switch';
  el('span', 'hud-character-key', switchCharacter).textContent = 'F · ';
  const switchLabel = el('span', 'hud-character-label', switchCharacter);
  switchCharacter.addEventListener('click', options.onTransform);
  const consumedKeys = new Set<string>();
  panel.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    consumedKeys.add(event.code);
    event.stopPropagation();
  });
  panel.addEventListener('keyup', (event) => {
    if (consumedKeys.delete(event.code)) event.stopPropagation();
  });
  panel.addEventListener('focusout', () => consumedKeys.clear());
  panel.append(switchCharacter);
  const slots = el('div', 'hud-weapon-slots', panel);
  const skills = SKILLS.map((skill, index) => {
    const slot = el('button', 'hud-weapon-slot', slots) as HTMLButtonElement;
    slot.type = 'button';
    slot.setAttribute('data-slot', String(index + 1));
    slot.addEventListener('click', () => options.onSkill(SKILL_ACTIONS[index]!));
    const key = el('span', 'hud-weapon-key', slot);
    key.textContent = skill.key;
    const label = el('span', 'hud-skill-name', slot);
    const state = el('span', 'hud-skill-state', slot);
    const progress = el('div', 'hud-skill-fill', el('div', 'hud-skill-track', slot));
    return { slot, key, label, state, progress };
  });
  const toastEl = el('div', 'hud-weapon-toast', root);
  toastEl.hidden = true;
  let toastText = '';
  let toastAge = TOAST_SECONDS;
  const showToast = (text: string): void => {
    toastText = text;
    toastAge = 0;
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.style.opacity = '1';
  };
  const unsubscribe = onLanguageChange(() => { toastText = ''; toastEl.hidden = true; });
  const setText = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };
  return {
    handleEvents(events) {
      const en = getLanguage() === 'en';
      for (const ev of events) {
        if (ev.type === 'transformBlocked') showToast(en ? 'More room is needed to transform' : '空间不足，换个开阔位置变身');
        else if (ev.type === 'weaponBlocked') showToast(en
          ? ev.reason === 'riding' ? 'Dismount to use this skill' : 'Water refilling…'
          : ev.reason === 'riding' ? '下车后释放此技能' : '水量恢复中…');
        else if (ev.type === 'swallowed') showToast(en ? 'Shot absorbed · use Swallow again to return early' : '已吸入敌弹 · 再次使用吞弹反击可提前反吐');
      }
    },
    update(frame) {
      const player = frame.entities.find((e) => e.id === frame.playerId && !e.removed);
      if (!player?.pelican) throw new Error(`weapon hud: player ${frame.playerId} with pelican data not found`);
      const p = player.pelican;
      const w = p.weapon;
      const en = getLanguage() === 'en';
      const human = p.form === 'human';
      const transforming = p.transformTicks >= 0;
      switchCharacter.disabled = transforming || player.health!.hp <= 0;
      setText(switchLabel, transforming ? en ? 'Switching…' : '切换中…'
        : human ? en ? 'Pelican' : '变为鹈鹕' : en ? 'Grassy' : '变为人形');
      setText(icon, human ? en ? 'K' : '键' : en ? 'W' : '水');
      setText(name, human ? 'GRASSY' : en ? 'PELICAN' : '鹈鹕');
      setText(healthLabel, `${Math.ceil(player.health!.hp)} / ${player.health!.maxHp}`);
      healthFill.style.width = `${Math.max(0, player.health!.hp / player.health!.maxHp * 100)}%`;
      setText(detail, human ? en ? 'Melee strike' : '近战挥击'
        : en ? `Water · ${Math.floor(w.water / W.water.cost)} shots` : `水量 ${Math.floor(w.water / W.water.cost)} 发`);
      setText(form, transforming ? p.transformFrom === 'human' ? en ? 'Feathers growing…' : '羽毛生长 · 身体换形'
        : en ? 'Feathers retracting…' : '羽毛收退 · 身体换形'
        : human ? en ? 'Grassy · F → Pelican' : 'Grassy · F 变为鹈鹕' : en ? 'Pelican · F → Grassy' : '鹈鹕 · F 变为主角');
      fill.style.width = `${human ? 100 : (w.water / W.water.capacity * 100).toFixed(1)}%`;
      panel.classList.toggle('hud-weapon-low', !human && w.water < W.water.cost);
      const active = [p.shotTicks >= 0 && w.shotWeapon === 'fish', w.dashTicks > 0,
        w.gulpTicks > 0 || p.shotTicks >= 0 && w.shotWeapon === 'swallow', frame.photonChargeTicks > 0 || frame.photonActiveTicks > 0];
      skills.forEach((view, i) => {
        const humanSkill = HUMAN_SLOTS[i]!;
        const humanEquipment = human && i < 3;
        const skill = humanEquipment ? { ...humanSkill, cooldown: HUMAN_SKILLS[humanSkill.action].cooldown } : SKILLS[i]!;
        const cooldown = humanEquipment ? p.humanCombat.cooldowns[i]! : i < 3 ? w.cooldowns[i]! : frame.photonCooldownTicks;
        const isActive = humanEquipment ? p.humanCombat.action === humanSkill.action : active[i]!;
        const disabled = transforming || p.ride.mode !== 'off' && (humanEquipment || i === 1 || i === 2);
        const state = transforming ? en ? 'Transforming' : '变身中'
          : disabled ? en ? 'Dismount' : '需下车'
          : !human && i === 2 && w.gulpTicks > 0 ? en ? `Absorbed ${w.mouthful?.count ?? 0}/3` : `吸入 ${w.mouthful?.count ?? 0}/3`
          : i === 3 && frame.photonChargeTicks > 0 ? en ? 'Charging' : '聚光中'
          : isActive ? en ? 'Active' : '释放中'
          : cooldown > 0 ? `${(cooldown / 60).toFixed(1)}${en ? 's' : '秒'}` : en ? 'Ready' : '就绪';
        setText(view.key, i === 0 && en ? 'RMB' : skill.key);
        setText(view.label, en ? skill.en : skill.name);
        setText(view.state, state);
        view.slot.classList.toggle('hud-weapon-active', isActive);
        view.slot.classList.toggle('hud-weapon-ready', cooldown === 0 && !disabled);
        view.slot.classList.toggle('hud-weapon-disabled', disabled);
        view.slot.disabled = disabled || player.health!.hp <= 0;
        view.slot.setAttribute('aria-label', `${en ? skill.en : skill.name} · ${state}`);
        view.progress.style.width = `${(100 * (1 - cooldown / skill.cooldown)).toFixed(1)}%`;
      });
      if (toastText !== '') {
        toastAge += frame.frameDt;
        if (toastAge >= TOAST_SECONDS) { toastText = ''; toastEl.hidden = true; }
        else if (toastAge > TOAST_SECONDS - TOAST_FADE) toastEl.style.opacity = ((TOAST_SECONDS - toastAge) / TOAST_FADE).toFixed(2);
      }
    },
    get toast() { return toastText; },
    dispose() { unsubscribe(); switchCharacter.removeEventListener('click', options.onTransform); panel.remove(); toastEl.remove(); },
  };
}
