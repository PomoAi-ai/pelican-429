/**
 * HTML HUD 覆盖层：假人血条、命中飘字、性能统计、飞行能量 / 氧气 / 光球冷却、操作提示。
 * - 操作提示（019）：开局显示，HINTS_AUTO_HIDE 秒或首次有效输入后 HINTS_AFTER_INPUT 秒自动淡出；H 切换显示/隐藏；
 *   隐藏时右下角留“H 帮助”角标。
 * - 假人血条（019）：世界空间锚定在假人头顶上方，与鹈鹕重叠时侧移/上抬，避不开则半透明（见 dummy-bar-layout）。
 * 不依赖 three：世界坐标 → 屏幕坐标的投影函数由组合根注入。
 */
import { lerp } from '../core/math.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { Entity } from '../entities/entity.ts';
import { pelicanVisualRect, placeDummyBar } from './dummy-bar-layout.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export interface ScreenPoint {
  /** 相对 HUD 根元素的 CSS 像素坐标。 */
  x: number;
  y: number;
}

/** 世界坐标（z=0 平面）→ HUD 坐标；在相机后方/不可见时返回 null。 */
export type WorldToScreen = (x: number, y: number) => ScreenPoint | null;

export interface HudStats {
  readonly fps: number;
  readonly tick: number;
  readonly droppedTicks: number;
}

export interface HudFrame {
  readonly entities: readonly Entity[];
  readonly headSubmerged: boolean;
  readonly alpha: number;
  readonly frameDt: number;
  readonly stats: HudStats;
  /** 玩家实体 id（飞行能量条/光球冷却读取其 pelican 数据）；在 entities 中找不到即抛。 */
  readonly playerId: number;
}

export interface HudOptions {
  /** 光球冷却总 tick（tuning.attacks.orb.cooldownTicks，整数 ≥ 0；0 = 无冷却，指示常满）；提供时显示光球冷却指示。 */
  readonly orbCooldownTicks?: number;
}

export interface Hud {
  handleEvents(events: readonly SimEvent[]): void;
  update(frame: HudFrame): void;
  /** 当前活跃飘字数量（调试/测试用）。 */
  readonly popupCount: number;
  /** 有效游戏输入（移动/跳跃/攻击等）发生时调用：提示面板改为 HINTS_AFTER_INPUT 秒后淡出（只取第一次）。 */
  noteInput(): void;
  /** H：切换操作提示显示/隐藏（手动显示后不再自动淡出）。 */
  toggleHints(): void;
  /** 操作提示当前是否显示（调试/测试用）。 */
  readonly hintsVisible: boolean;
  dispose(): void;
}

export const CONTROL_HINTS: readonly string[] = Object.freeze([
  'A / D（← / →）自动奔跑，按住 Shift 慢走',
  '空格 / W 跳跃（按住跳更高）',
  '鼠标左键 / J 普攻：鹈鹕吐水，主角砸键盘',
  'F 鹈鹕 / 主角双向变身',
  'S 下平台（站在悬浮平台时）',
  '右键 鱼群轰炸 · 1 振翅突进（期间无敌，停止解除） · 2 吞弹反击',
  '3 / E 光子爆裂（Bug 与光轮分批追敌）',
  'R 上/下车（骑车时空中再按空格弃车起飞）',
  '空中按住空格飞行，松开滑翔，S 俯冲',
  '水中：按住空格 / W 上浮，水面再按跃出，S 下潜；氧气耗尽扣血',
  'M 大地图（滚轮 / + - 缩放）',
  'Esc / O 设置（打开时暂停）',
  'H 显示/隐藏本帮助',
]);
const EN_CONTROL_HINTS = [
  'A / D (← / →) auto-run; hold Shift to walk',
  'Space / W jump (hold to jump higher)',
  'Left click / J: pelican water spray / Grassy keyboard strike',
  'F transform between Pelican and Grassy',
  'S drop through one-way platforms',
  'Right click fish barrage · 1 wing dash (invincible until dash stops) · 2 swallow & return',
  '3 / E Photon Burst (bugs and wheels seek enemies)',
  'R mount / dismount (press Space in midair to launch)',
  'Hold Space in air to fly; release to glide; S to dive',
  'In water: hold Space / W to rise; press again at the surface to jump out. S dives; running out of oxygen drains health.',
  'M world map (wheel / + - to zoom)',
  'Esc / O settings (pauses the game)',
  'H show / hide this help',
];

/** 操作提示：开局自动淡出时间（秒）与首次有效输入后的淡出延迟（秒）。 */
export const HINTS_AUTO_HIDE = 6;
export const HINTS_AFTER_INPUT = 4;
/** 血条位置平滑速率（1/秒，指数逼近）。 */
const BAR_SMOOTH_RATE = 14;

/** 飞行能量低于该比例时能量条变红。 */
export const FLIGHT_LOW_RATIO = 0.25;

const POPUP_LIFETIME = 0.9;
const POPUP_RISE = 1.2;
const STATS_INTERVAL = 0.25;

interface Popup {
  readonly el: HTMLElement;
  readonly x: number;
  readonly y: number;
  age: number;
}

function el(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

/** 固定状态面板：飞行、氧气与可选光球冷却；update 找不到玩家或玩家无 pelican 数据即抛。 */
function createStatusPanel(root: HTMLElement, orbCooldown: number | undefined): { update(entities: readonly Entity[], playerId: number, headSubmerged: boolean): void; dispose(): void } {
  const breathVeil = el('div', 'hud-breath-veil', root);
  breathVeil.setAttribute('aria-hidden', 'true');
  breathVeil.hidden = true;
  const panel = el('div', 'hud-status', root);
  const flight = el('div', 'hud-flight', panel);
  const flightLabel = el('div', 'hud-flight-label', flight);
  const flightTrack = el('div', 'hud-flight-track', flight);
  const flightFill = el('div', 'hud-flight-fill', flightTrack);
  let shownFlight = '';
  let shownFlightLow = false;
  flight.hidden = true;
  const oxygen = el('div', 'hud-oxygen', panel);
  const oxygenLabel = el('div', 'hud-oxygen-label', oxygen);
  oxygenLabel.setAttribute('aria-live', 'polite');
  const oxygenTrack = el('div', 'hud-oxygen-track', oxygen);
  oxygenTrack.setAttribute('role', 'progressbar');
  oxygenTrack.setAttribute('aria-valuemin', '0');
  oxygenTrack.setAttribute('aria-valuemax', '100');
  const oxygenFill = el('div', 'hud-oxygen-fill', oxygenTrack);
  const bubbles = el('div', 'hud-oxygen-bubbles', oxygenTrack);
  bubbles.setAttribute('aria-hidden', 'true');
  const oxygenBubbles = Array.from({ length: 6 }, () => el('span', 'hud-oxygen-bubble', bubbles));
  oxygen.hidden = true;
  let shownOxygen = '';
  let oxygenState: 'normal' | 'recovering' | 'low' | 'empty' | 'immune' = 'normal';
  let orbFill: HTMLElement | null = null;
  let orbLabel: HTMLElement | null = null;
  let shownOrb = '';
  if (orbCooldown !== undefined) {
    const orb = el('div', 'hud-orb', panel);
    orbLabel = el('div', 'hud-orb-label', orb);
    orbFill = el('div', 'hud-orb-fill', el('div', 'hud-orb-track', orb));
  }
  const translate = (): void => {
    const en = getLanguage() === 'en';
    flightLabel.textContent = en ? 'Flight' : '飞行';
    if (orbLabel) orbLabel.textContent = en ? 'Orb' : '光球';
    oxygenLabel.textContent = oxygenState === 'empty' ? (en ? 'Drowning' : '缺氧扣血')
      : oxygenState === 'immune' ? (en ? 'No oxygen · immune' : '缺氧·免伤')
      : oxygenState === 'recovering' ? (en ? 'Recovering' : '恢复呼吸')
      : oxygenState === 'low' ? (en ? 'Low oxygen' : '氧气不足') : (en ? 'Oxygen' : '氧气');
    oxygenTrack.setAttribute('aria-label', en ? 'Oxygen' : '氧气');
  };
  translate();
  const unsubscribe = onLanguageChange(translate);
  return {
    dispose: unsubscribe,
    update(entities, playerId, headSubmerged) {
      const player = entities.find((e) => e.id === playerId && !e.removed);
      if (!player) throw new Error(`hud: player ${playerId} not found among ${entities.length} entities`);
      const p = player.pelican;
      if (!p) throw new Error(`hud: player ${playerId} (${player.kind}) has no pelican data`);
      oxygen.hidden = !p.inWater && p.oxygenTicks === p.oxygenMaxTicks;
      const oxygenRatio = p.oxygenTicks / p.oxygenMaxTicks;
      const oxygenPercent = (oxygenRatio * 100).toFixed(1);
      if (oxygenPercent !== shownOxygen) {
        shownOxygen = oxygenPercent;
        oxygenFill.style.width = `${oxygenPercent}%`;
        oxygenTrack.setAttribute('aria-valuenow', oxygenPercent);
        oxygenBubbles.forEach((bubble, i) => bubble.classList.toggle('hud-oxygen-bubble-full', i < Math.ceil(oxygenRatio * oxygenBubbles.length)));
      }
      const breathingUnderwater = headSubmerged && player.health!.hp > 0;
      const nextOxygenState = !breathingUnderwater ? (oxygenRatio < 1 && player.health!.hp > 0 ? 'recovering' : 'normal')
        : p.oxygenTicks === 0 ? (p.weapon.dashTicks > 0 || player.health!.overloadInvulnTicks > 0 ? 'immune' : 'empty')
          : oxygenRatio < .25 ? 'low' : 'normal';
      if (nextOxygenState !== oxygenState) {
        oxygenState = nextOxygenState;
        oxygen.classList.toggle('hud-oxygen-low', oxygenState === 'low' || oxygenState === 'empty' || oxygenState === 'immune');
        breathVeil.hidden = oxygenState !== 'low' && oxygenState !== 'empty' && oxygenState !== 'immune';
        breathVeil.classList.toggle('hud-breath-drowning', oxygenState === 'empty');
        translate();
      }
      const max = p.flightMaxTicks;
      if (max <= 0) {
        flight.hidden = true;
      } else {
        flight.hidden = false;
        const ratio = Math.min(1, Math.max(0, p.flightTicks / max));
        const width = `${(ratio * 100).toFixed(1)}%`;
        if (width !== shownFlight) {
          shownFlight = width;
          flightFill.style.width = width;
        }
        const low = ratio < FLIGHT_LOW_RATIO;
        if (low !== shownFlightLow) {
          shownFlightLow = low;
          flight.classList.toggle('hud-flight-low', low);
        }
      }
      if (orbFill && orbCooldown !== undefined) {
        // 冷却中从 0 涨到 100%，就绪时满格；冷却总长为 0 时常满。
        const ready = orbCooldown === 0 ? 1 : 1 - Math.min(1, Math.max(0, p.shootCooldownTicks / orbCooldown));
        const width = `${(ready * 100).toFixed(1)}%`;
        if (width !== shownOrb) {
          shownOrb = width;
          orbFill.style.width = width;
          orbFill.classList.toggle('hud-orb-ready', ready >= 1);
        }
      }
    },
  };
}

export function createHud(root: HTMLElement, project: WorldToScreen, options: HudOptions = {}): Hud {
  if (!root) throw new Error('hud: root element is missing');
  const orbCooldown = options.orbCooldownTicks;
  if (orbCooldown !== undefined && !(Number.isInteger(orbCooldown) && orbCooldown >= 0)) {
    throw new Error(`hud: invalid orbCooldownTicks ${orbCooldown}`);
  }
  root.replaceChildren();

  const stats = el('div', 'hud-stats', root);
  // 固定面板：飞行能量、氧气与可选光球冷却。
  const status = createStatusPanel(root, orbCooldown);
  const hints = el('div', 'hud-hints', root);
  const hintEls = CONTROL_HINTS.map(() => el('div', 'hud-hint', hints));
  const touchHelp = el('div', 'hud-touch-help', hints);
  const helpBadge = el('div', 'hud-help-badge', root);
  let humanHints = false;
  const translate = (): void => {
    touchHelp.textContent = getLanguage() === 'en'
      ? 'Left stick: tilt to walk, push to run, up to jump / fly, down to drop through platforms / dive. Hold Attack to auto aim at the nearest enemy on screen. Tap skills to auto aim. Directional skills can be dragged and released; pulling farther extends the aiming guide. Wing dash and the initial swallow face sideways; Server overload only needs a tap; Photon Burst seeks enemies after launch. In water, hold up to rise and push up again at the surface to jump out. Running out of oxygen drains health.'
      : '左摇杆轻推慢走、推远奔跑，上推跳跃 / 飞行，下推下平台 / 俯冲 / 下潜。右侧按住主攻自动瞄准屏内最近敌人；轻触技能自动选敌；有方向的技能可拖动瞄准，拉得越远指示越长，松手释放。振翅突进和吞弹起手只朝左右；服务器超载直接点击释放，光子爆裂发射后继续追敌。水中持续上推上浮，水面再次上推跃出；氧气耗尽扣血。';
    const lines = getLanguage() === 'en' ? EN_CONTROL_HINTS : CONTROL_HINTS;
    hintEls.forEach((node, i) => { node.textContent = lines[i] as string; });
    if (humanHints) {
      hintEls[5]!.textContent = getLanguage() === 'en' ? 'Right click Codex · 1 Bug attack' : '右键 Codex 攻击 · 1 Bug 攻击';
      hintEls[6]!.textContent = getLanguage() === 'en' ? '2 Server overload · 3 / E Photon Burst' : '2 服务器超载 · 3 / E 光子爆裂';
    }
    helpBadge.textContent = getLanguage() === 'en' ? 'H Help' : 'H 帮助';
  };
  translate();
  const unsubscribe = onLanguageChange(translate);
  helpBadge.hidden = true;
  let hintsVisible = true;
  let hintsClock = 0;
  /** 自动淡出时刻（秒）；null = 不自动淡出（手动切换后）。 */
  let hintsDeadline: number | null = HINTS_AUTO_HIDE;
  let inputSeen = false;
  const setHints = (visible: boolean): void => {
    hintsVisible = visible;
    hints.classList.toggle('hud-hints-hidden', !visible);
    helpBadge.hidden = visible;
  };
  const layer = el('div', 'hud-world', root);

  const bars = new Map<number, { el: HTMLElement; fill: HTMLElement; label: HTMLElement; shownHp: number; x: number; y: number; opacity: string }>();
  const popups: Popup[] = [];
  let statsTimer = STATS_INTERVAL;

  const place = (node: HTMLElement, p: ScreenPoint | null): void => {
    if (p === null) {
      node.style.display = 'none';
      return;
    }
    node.style.display = '';
    node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
  };

  return {
    handleEvents(events) {
      for (const ev of events) {
        if (ev.type === 'hit' || ev.type === 'heal' || ev.type === 'damageImmune') {
          const node = el('div', 'hud-popup', layer);
          node.textContent = ev.type === 'damageImmune' ? (getLanguage() === 'en' ? 'Immune' : '免伤')
            : ev.type === 'heal' ? `+${Math.ceil(ev.amount)}` : `-${Number(ev.damage.toFixed(2))}`;
          node.classList.toggle('hud-popup-heal', ev.type === 'heal');
          node.classList.toggle('hud-popup-immune', ev.type === 'damageImmune');
          popups.push({ el: node, x: ev.x, y: ev.y, age: 0 });
        } else if (ev.type === 'dummyReset') {
          const bar = bars.get(ev.id);
          if (bar) {
            bar.el.classList.remove('hud-bar-reset');
            // 触发重排以重新播放“回满”动画。
            void bar.el.offsetWidth;
            bar.el.classList.add('hud-bar-reset');
          }
        }
      }
    },
    update(frame) {
      const { entities, alpha, frameDt } = frame;
      status.update(entities, frame.playerId, frame.headSubmerged);
      const human = entities.find((entity) => entity.id === frame.playerId)!.pelican!.form === 'human';
      if (humanHints !== human) { humanHints = human; translate(); }
      if (!(Number.isFinite(frameDt) && frameDt >= 0)) throw new Error(`hud: invalid frameDt ${frameDt}`);
      hintsClock += frameDt;
      if (hintsVisible && hintsDeadline !== null && hintsClock >= hintsDeadline) {
        hintsDeadline = null;
        setHints(false);
      }
      const obstacles = entities.filter((e) => e.kind === 'pelican' && !e.removed).map((e) => pelicanVisualRect(e, alpha));
      const smooth = 1 - Math.exp(-BAR_SMOOTH_RATE * frameDt);
      const alive = new Set<number>();
      for (const e of entities) {
        if (e.kind !== 'trainingDummy' || !e.health || e.removed) continue;
        alive.add(e.id);
        let bar = bars.get(e.id);
        if (!bar) {
          const wrap = el('div', 'hud-bar', layer);
          const fill = el('div', 'hud-bar-fill', wrap);
          const label = el('div', 'hud-bar-label', wrap);
          bar = { el: wrap, fill, label, shownHp: -1, x: Number.NaN, y: Number.NaN, opacity: '' };
          bars.set(e.id, bar);
        }
        const h = e.health;
        if (bar.shownHp !== h.hp) {
          bar.shownHp = h.hp;
          bar.fill.style.width = `${Math.max(0, (h.hp / h.maxHp) * 100).toFixed(1)}%`;
          bar.label.textContent = `${h.hp.toFixed(2)} / ${h.maxHp.toFixed(2)}`;
          bar.el.classList.toggle('hud-bar-empty', h.hp <= 0);
        }
        // 位置相对假人平滑（避让时滑过去，不跳变）；首帧直接到位。
        const target = placeDummyBar(e, alpha, obstacles);
        const ax = lerp(e.body.prevX, e.body.x, alpha);
        const ay = lerp(e.body.prevY, e.body.y, alpha);
        const dx = target.x - ax;
        const dy = target.y - ay;
        bar.x = Number.isNaN(bar.x) ? dx : lerp(bar.x, dx, smooth);
        bar.y = Number.isNaN(bar.y) ? dy : lerp(bar.y, dy, smooth);
        place(bar.el, project(ax + bar.x, ay + bar.y));
        const opacity = target.opacity.toFixed(2);
        if (opacity !== bar.opacity) {
          bar.opacity = opacity;
          bar.el.style.opacity = opacity;
          bar.el.classList.toggle('hud-bar-overlap', target.opacity < 1);
        }
      }
      for (const [id, bar] of bars) {
        if (!alive.has(id)) {
          bar.el.remove();
          bars.delete(id);
        }
      }

      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i] as Popup;
        p.age += frameDt;
        if (p.age >= POPUP_LIFETIME) {
          p.el.remove();
          popups.splice(i, 1);
          continue;
        }
        const t = p.age / POPUP_LIFETIME;
        place(p.el, project(p.x, p.y + POPUP_RISE * t));
        p.el.style.opacity = (1 - t * t).toFixed(2);
      }

      statsTimer += frameDt;
      if (statsTimer >= STATS_INTERVAL) {
        statsTimer = 0;
        const s = frame.stats;
        stats.textContent = `FPS ${s.fps.toFixed(0)} · tick ${s.tick} · ${getLanguage() === 'en' ? 'dropped' : '丢帧'} ${s.droppedTicks}`;
      }
    },
    get popupCount() {
      return popups.length;
    },
    noteInput() {
      if (inputSeen) return;
      inputSeen = true;
      if (hintsDeadline !== null) hintsDeadline = Math.min(hintsDeadline, hintsClock + HINTS_AFTER_INPUT);
    },
    toggleHints() {
      hintsDeadline = null;
      setHints(!hintsVisible);
    },
    get hintsVisible() {
      return hintsVisible;
    },
    dispose() {
      unsubscribe();
      status.dispose();
      root.replaceChildren();
      bars.clear();
      popups.length = 0;
    },
  };
}
