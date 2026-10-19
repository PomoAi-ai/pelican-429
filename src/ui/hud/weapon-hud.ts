/** 当前角色的普攻与专属技能：资源、冷却和施放阶段。 */
import type { WeaponsTuning } from '../../config/weapon-rules.ts';
import { HUMAN_SKILLS } from '../../config/human-combat.ts';
import { PELICAN_SKILLS } from '../../config/pelican-skills.ts';
import { PHOTON_ULTIMATE } from '../../config/photon-ultimate.ts';
import type { SimEvent } from '../../core/game-events.ts';
import type { Entity } from '../../entities/entity.ts';
import { SKILL_ACTIONS } from '../../config/keybindings.ts';
import type { GameAction } from '../../config/keybindings.ts';
import type { Vec2 } from '../../core/math.ts';
import type { WorldToScreen } from './hud.ts';
import { bindSkillTouch } from './skill-touch.ts';
import type { SkillAimKind } from './skill-touch.ts';
import { t } from '../../config/i18n.ts';
import { onLanguageChange } from '../model/language.ts';

export const TOAST_SECONDS = 1.2;
const TOAST_FADE = 0.25;
export const PELICAN_SKILL_SLOTS = [
  { key: '右键', name: '鱼群轰炸', cooldown: PELICAN_SKILLS.fishCooldownTicks },
  { key: '1', name: '振翅突进', cooldown: PELICAN_SKILLS.dashCooldownTicks },
  { key: '2', name: '吞弹反击', cooldown: PELICAN_SKILLS.swallowCooldownTicks },
  { key: '3 / E', name: '光子爆裂', cooldown: PHOTON_ULTIMATE.cooldownTicks },
] as const;

const HUMAN_SLOTS = [
  { key: '右键', name: 'Codex 攻击', action: 'codex_attack' },
  { key: '1', name: 'Bug 攻击', action: 'bug_attack' },
  { key: '2', name: '服务器超载', action: 'server_overload' },
] as const;

export interface WeaponHudOptions { readonly weapons: WeaponsTuning; readonly onTransform: () => void; readonly onSkill: (action: GameAction) => void; readonly project: WorldToScreen }
export interface MobileSkillCast { readonly action: GameAction; readonly direction: Vec2 | null }
export interface WeaponHudFrame {
  readonly entities: readonly Entity[];
  readonly playerId: number;
  readonly frameDt: number;
  readonly skillWaitTicks: readonly number[];
  readonly photonCooldownTicks: number;
  readonly photonChargeTicks: number;
  readonly photonActiveTicks: number;
  readonly transformUnlocked: boolean;
}
export interface WeaponHud {
  consumeSkill(): MobileSkillCast | null;
  resetInput(): void;
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
  const controller = new AbortController();
  const { signal } = controller;
  let pending: MobileSkillCast | null = null;
  let humanForm = false;
  let swallowing = false;
  const panel = el('div', 'hud-weapon', root);
  const main = el('div', 'hud-weapon-main', panel);
  const icon = el('div', 'hud-weapon-icon', main);
  const portrait = el('span', 'hud-skill-icon', icon);
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
  const switchPortrait = el('span', 'hud-skill-icon hud-character-icon', switchCharacter);
  switchPortrait.setAttribute('aria-hidden', 'true');
  const switchArrow = el('span', 'hud-character-arrow', switchCharacter);
  switchArrow.textContent = '⇄';
  switchArrow.setAttribute('aria-hidden', 'true');
  el('span', 'hud-character-key', switchCharacter).textContent = 'F';
  const switchLabel = el('span', 'hud-character-label', switchCharacter);
  const transformTouch = bindSkillTouch(switchCharacter, () => 'none', options.onTransform, signal);
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
  const skills = PELICAN_SKILL_SLOTS.map((skill, index) => {
    const slot = el('button', 'hud-weapon-slot', slots) as HTMLButtonElement;
    slot.type = 'button';
    slot.setAttribute('data-slot', String(index + 1));
    const aimKind = (): SkillAimKind => humanForm && index === 2 ? 'none'
      : !humanForm && (index === 1 || index === 2 && !swallowing) ? 'horizontal' : 'free';
    const touch = bindSkillTouch(slot, aimKind, direction => {
      const action = SKILL_ACTIONS[index]!;
      if (document.body.dataset.controls === 'mobile') pending = { action, direction };
      else options.onSkill(action);
    }, signal);
    const artwork = el('span', 'hud-skill-icon', slot);
    artwork.setAttribute('aria-hidden', 'true');
    const key = el('span', 'hud-weapon-key', slot);
    key.textContent = index === 0 ? t(skill.key, 'key') : skill.key;
    const label = el('span', 'hud-skill-name', slot);
    const state = el('span', 'hud-skill-state', slot);
    const progress = el('div', 'hud-skill-fill', el('div', 'hud-skill-track', slot));
    const cooldownRing = el('span', 'hud-skill-cooldown-ring', slot);
    cooldownRing.setAttribute('aria-hidden', 'true');
    return { slot, artwork, key, label, state, progress, cooldownRing, touch };
  });
  const buttonStatus = el('span', 'hud-skill-aim-status hud-skill-button-status', panel);
  buttonStatus.hidden = true;
  const aimStatus = el('span', 'hud-skill-aim-status', root);
  aimStatus.hidden = true;
  const aimPreview = el('div', 'hud-skill-aim', root);
  aimPreview.setAttribute('aria-hidden', 'true');
  aimPreview.hidden = true;
  el('span', 'hud-skill-aim-beam', aimPreview);
  el('span', 'hud-skill-aim-tip', aimPreview);
  const resetInput = (): void => {
    pending = null;
    transformTouch.reset();
    for (const view of skills) view.touch.reset();
    aimPreview.hidden = true;
    aimStatus.hidden = true;
    buttonStatus.hidden = true;
  };
  const toastEl = el('div', 'hud-weapon-toast', root);
  toastEl.setAttribute('role', 'status');
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
  // 每帧调用：只在内容变化时写 DOM，避免无谓的样式失效与重排。
  const setText = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };
  const setAttr = (node: HTMLElement, name: string, value: string): void => {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  };
  // 比对上次写入的原值；读回 style 会被规范化（50.0% → 50%），永远不相等。
  const written = new WeakMap<HTMLElement, Map<string, string>>();
  const setStyle = (node: HTMLElement, prop: string, value: string): void => {
    let last = written.get(node);
    if (!last) written.set(node, last = new Map());
    if (last.get(prop) === value) return;
    last.set(prop, value);
    node.style.setProperty(prop, value);
  };
  const setHidden = (node: HTMLElement, hidden: boolean): void => {
    if (node.hidden !== hidden) node.hidden = hidden;
  };
  const setDisabled = (node: HTMLButtonElement, disabled: boolean): void => {
    if (node.disabled !== disabled) node.disabled = disabled;
  };
  return {
    consumeSkill() { const cast = pending; pending = null; return cast; },
    resetInput,
    handleEvents(events) {
      for (const ev of events) {
        if (ev.type === 'transformBlocked') showToast(t(ev.reason === 'story' ? '击败 Tibo 后解锁变身' : '空间不足，换个开阔位置变身'));
        else if (ev.type === 'weaponBlocked') showToast(t('水量恢复中…'));
        else if (ev.type === 'swallowed') showToast(t('已吸入敌弹 · 再次使用吞弹反击可提前反吐'));
      }
    },
    update(frame) {
      const player = frame.entities.find((e) => e.id === frame.playerId && !e.removed);
      if (!player?.pelican) throw new Error(`weapon hud: player ${frame.playerId} with pelican data not found`);
      const p = player.pelican;
      const w = p.weapon;
      const human = p.form === 'human';
      if (humanForm !== human) resetInput();
      humanForm = human;
      swallowing = w.gulpTicks > 0;
      const transforming = p.transformTicks >= 0;
      setDisabled(switchCharacter, transforming || player.health!.hp <= 0);
      if (switchCharacter.disabled) resetInput();
      // 剧情锁定仍接收点击以说明解锁条件，真正的变身限制由模拟层统一处理。
      setAttr(switchCharacter, 'aria-disabled', String(!frame.transformUnlocked || switchCharacter.disabled));
      setAttr(switchPortrait, 'data-icon', human ? 'pelican' : 'human');
      setText(switchLabel, !frame.transformUnlocked ? t('未解锁 · 击败 Tibo')
        : transforming ? t('切换中…')
        : t(human ? '变为鹈鹕' : '变为人形', 'switch'));
      setAttr(switchCharacter, 'aria-label', `${t('形态切换')} · ${switchLabel.textContent}`);
      setAttr(switchCharacter, 'title', `${t('形态切换')} · F`);
      setAttr(panel, 'data-player-form', human ? 'human' : 'pelican');
      setAttr(portrait, 'data-icon', human ? 'human' : 'pelican');
      setText(name, human ? 'GRASSY' : t('鹈鹕', 'hud'));
      setText(healthLabel, `${player.health!.hp.toFixed(2)} / ${player.health!.maxHp.toFixed(2)}`);
      setStyle(healthFill, 'width', `${Math.max(0, player.health!.hp / player.health!.maxHp * 100).toFixed(1)}%`);
      setText(detail, human ? t('近战挥击') : t('水量 {n} 发').replace('{n}', String(Math.floor(w.water / W.water.cost))));
      setText(form, t(transforming ? p.transformFrom === 'human' ? '羽毛生长 · 身体换形' : '羽毛收退 · 身体换形'
        : human ? 'Grassy · F 变为鹈鹕' : '鹈鹕 · F 变为主角'));
      setStyle(fill, 'width', `${human ? 100 : (w.water / W.water.capacity * 100).toFixed(1)}%`);
      panel.classList.toggle('hud-weapon-low', !human && w.water < W.water.cost);
      const active = [p.shotTicks >= 0 && w.shotWeapon === 'fish', w.dashTicks > 0,
        w.gulpTicks > 0 || p.shotTicks >= 0 && w.shotWeapon === 'swallow', frame.photonChargeTicks > 0 || frame.photonActiveTicks > 0];
      skills.forEach((view, i) => {
        const humanSkill = HUMAN_SLOTS[i]!;
        const humanEquipment = human && i < 3;
        const skill = humanEquipment ? { ...humanSkill, cooldown: HUMAN_SKILLS[humanSkill.action].cooldown } : PELICAN_SKILL_SLOTS[i]!;
        const cooldown = humanEquipment ? p.humanCombat.cooldowns[i]! : i < 3 ? w.cooldowns[i]! : frame.photonCooldownTicks;
        // 吞弹期间可再次按技能吐出，不能把此时的起手冷却当成禁用。
        const cooldownTicks = !human && i === 2 && w.gulpTicks > 0 ? 0 : cooldown;
        setHidden(view.cooldownRing, cooldownTicks === 0);
        // 取整到 1°：冷却环每度才重绘一次，就绪隐藏时不写。
        if (cooldownTicks > 0) setStyle(view.cooldownRing, 'background-image', `conic-gradient(from -90deg, var(--hud-led) ${Math.round(Math.max(0, 1 - cooldownTicks / skill.cooldown) * 360)}deg, var(--hud-line) 0deg)`);
        const isActive = humanEquipment ? p.humanCombat.action === humanSkill.action : active[i]!;
        setAttr(view.artwork, 'data-icon', humanEquipment ? ['codex', 'bug', 'server'][i]! : ['fish', 'dash', 'swallow', 'photon'][i]!);
        const disabled = transforming || p.ride.mode !== 'off' && (humanEquipment || i === 1 || i === 2);
        const state = transforming ? t('变身中')
          : disabled ? t('需下车')
          : !human && i === 2 && w.gulpTicks > 0 ? t('吸入 {n}/3').replace('{n}', String(w.mouthful?.count ?? 0))
          : i === 3 && frame.photonChargeTicks > 0 ? t('聚光中')
          : !human && i === 1 && isActive ? t('无敌中')
          : isActive ? t('释放中')
          : cooldown > 0 ? `${(cooldown / 60).toFixed(1)}${t('秒', 'unit')}` : t('就绪');
        setText(view.key, i === 0 ? t(skill.key, 'key') : skill.key);
        setText(view.label, t(skill.name));
        setText(view.state, state);
        setHidden(view.state, cooldown === 0 && !disabled && !isActive);
        view.slot.classList.toggle('hud-weapon-active', isActive);
        view.slot.classList.toggle('hud-weapon-ready', cooldown === 0 && !disabled);
        view.slot.classList.toggle('hud-weapon-disabled', disabled);
        setDisabled(view.slot, disabled || player.health!.hp <= 0);
        if (view.slot.disabled) {
          view.touch.reset();
          if (pending?.action === SKILL_ACTIONS[i]) pending = null;
        }
        setAttr(view.slot, 'aria-label', `${t(skill.name)} · ${state}`);
        setAttr(view.slot, 'title', `${t(skill.name)} · ${state}${!human && i === 1 ? t(' · 突进期间无敌，停止后立即解除') : ''}`);
        setStyle(view.progress, 'width', `${(100 * (1 - cooldown / skill.cooldown)).toFixed(1)}%`);
      });
      const aiming = skills.find(view => view.touch.direction !== null);
      setHidden(aimPreview, aiming === undefined);
      setHidden(aimStatus, aiming === undefined);
      setHidden(buttonStatus, aiming === undefined);
      if (aiming) {
        const waitTicks = frame.skillWaitTicks[skills.indexOf(aiming)]!;
        const cooling = waitTicks > 0;
        aimPreview.classList.toggle('hud-skill-aim-cooling', cooling);
        for (const status of [aimStatus, buttonStatus]) {
          status.classList.toggle('hud-skill-aim-cooling', cooling);
          setText(status, cooling
            ? `${(Math.ceil(waitTicks / 6) / 10).toFixed(1)}${t(' 秒', 'unit')}`
            : t('松手释放'));
        }
        const x = player.body.x;
        const y = player.body.y + player.body.height / 2;
        const start = options.project(x, y);
        const direction = aiming.touch.direction!;
        const end = options.project(x + direction.x, y + direction.y);
        setHidden(aimPreview, start === null || end === null);
        setHidden(aimStatus, start === null || end === null);
        if (start && end) {
          aimPreview.style.left = `${start.x}px`;
          aimPreview.style.top = `${start.y}px`;
          const length = 96 + aiming.touch.pull * 244;
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          aimPreview.style.width = `${length}px`;
          aimStatus.style.left = `${start.x + Math.cos(angle) * length * .6}px`;
          aimStatus.style.top = `${start.y + Math.sin(angle) * length * .6}px`;
          aimPreview.style.setProperty('--aim-pull', String(aiming.touch.pull));
          aimPreview.style.transform = `rotate(${angle}rad)`;
        }
      }
      if (toastText !== '') {
        toastAge += frame.frameDt;
        if (toastAge >= TOAST_SECONDS) { toastText = ''; toastEl.hidden = true; }
        else if (toastAge > TOAST_SECONDS - TOAST_FADE) toastEl.style.opacity = ((TOAST_SECONDS - toastAge) / TOAST_FADE).toFixed(2);
      }
    },
    get toast() { return toastText; },
    dispose() { resetInput(); controller.abort(); unsubscribe(); panel.remove(); toastEl.remove(); aimPreview.remove(); aimStatus.remove(); },
  };
}
