/**
 * 纯逻辑动作追踪器（无 DOM）：DOM 层把按键/按钮映射到 GameAction 后调用 press/release。
 * - 按下锁存：press 后即使同帧 release，下一次 consume 仍报告 pressed。
 * - 同一绑定重复 press（key repeat）不重复锁存。
 * - 左右同按时后按优先。
 * - 失焦时调用 releaseAll，避免卡键。
 */
import { UI_ACTIONS, SKILL_ACTIONS } from '../config/keybindings.ts';
import type { GameAction } from '../config/keybindings.ts';
import type { Vec2 } from '../core/math.ts';
import type { InputFrame } from '../sim/sim-world.ts';

export type InputSource = 'keyboard' | 'mouse';

/** 界面动作帧（每渲染帧取一次，与模拟 tick 无关）。 */
export interface UiInputFrame {
  /** 大地图开关（M）按下锁存。 */
  readonly mapPressed: boolean;
  /** 操作提示开关（H）按下锁存。 */
  readonly helpPressed: boolean;
  /** 设置面板开关（Esc / O）按下锁存。 */
  readonly settingsPressed: boolean;
}

// 界面动作（keybindings UI_ACTIONS）：只由 consumeUi 读取并清除锁存，consume（模拟 tick）不清除它们。

export interface ActionTracker {
  /** bindingKey 区分同一动作的不同物理按键（如 'KeyA' 与 'ArrowLeft'），缺省为动作名。 */
  press(action: GameAction, source?: InputSource, bindingKey?: string): void;
  /** 省略 bindingKey 时释放该动作的全部按键。 */
  release(action: GameAction, bindingKey?: string): void;
  releaseAll(): void;
  isHeld(action: GameAction): boolean;
  /** 生成一个 tick 的输入帧并清除锁存的 pressed（界面动作除外）。 */
  consume(aim: Vec2 | null): InputFrame;
  /** 生成界面动作帧并清除界面动作的锁存。 */
  consumeUi(): UiInputFrame;
}

interface ActionState {
  readonly held: Set<string>;
  pressed: boolean;
  /** 最近一次按下的序号（用于后按优先）。 */
  order: number;
  source: InputSource | null;
}

export function createActionTracker(): ActionTracker {
  const states = new Map<GameAction, ActionState>();
  let seq = 0;
  const state = (a: GameAction): ActionState => {
    let s = states.get(a);
    if (!s) {
      s = { held: new Set(), pressed: false, order: 0, source: null };
      states.set(a, s);
    }
    return s;
  };
  const held = (a: GameAction): boolean => (states.get(a)?.held.size ?? 0) > 0;

  return {
    press(action, source = 'keyboard', bindingKey = action) {
      const s = state(action);
      if (s.held.has(bindingKey)) return;
      if (s.held.size === 0) {
        s.pressed = true;
        s.order = ++seq;
        s.source = source;
      }
      s.held.add(bindingKey);
    },
    release(action, bindingKey) {
      const s = states.get(action);
      if (!s) return;
      if (bindingKey === undefined) s.held.clear();
      else s.held.delete(bindingKey);
    },
    releaseAll() {
      for (const s of states.values()) {
        s.held.clear();
        s.pressed = false;
        s.source = null;
      }
    },
    isHeld: held,
    consume(aim) {
      const left = held('moveLeft');
      const right = held('moveRight');
      let moveX: -1 | 0 | 1 = 0;
      if (left && right) moveX = state('moveRight').order > state('moveLeft').order ? 1 : -1;
      else if (left) moveX = -1;
      else if (right) moveX = 1;

      const jump = state('jump');
      const shoot = state('shoot');
      // 同帧按下多个槽位：后按优先。
      let skillPressed: InputFrame['skillPressed'] = 0;
      let slotOrder = -1;
      SKILL_ACTIONS.forEach((a, i) => {
        const s = states.get(a);
        if (s?.pressed && s.order > slotOrder) {
          slotOrder = s.order;
          skillPressed = (i + 1) as InputFrame['skillPressed'];
        }
      });
      const frame: InputFrame = {
        moveX,
        runHeld: !held('walk'),
        jumpHeld: held('jump'),
        jumpPressed: jump.pressed,
        attackPressed: false,
        attackSource: shoot.source,
        downHeld: held('down'),
        shootPressed: shoot.pressed,
        shootHeld: held('shoot'),
        mountPressed: state('mount').pressed,
        transformPressed: state('transform').pressed,
        skillPressed,
        skill1Held: held('skill1'),
        aim: aim === null ? null : { x: aim.x, y: aim.y },
        manualSkillAim: null,
      };
      for (const [a, s] of states) if (!UI_ACTIONS.includes(a)) s.pressed = false;
      return frame;
    },
    consumeUi() {
      const map = state('map');
      const help = state('help');
      const settings = state('settings');
      const frame: UiInputFrame = { mapPressed: map.pressed, helpPressed: help.pressed, settingsPressed: settings.pressed };
      map.pressed = false;
      help.pressed = false;
      settings.pressed = false;
      return frame;
    },
  };
}
