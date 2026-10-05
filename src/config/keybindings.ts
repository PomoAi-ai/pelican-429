/** 游戏动作与默认键鼠绑定。key 使用 KeyboardEvent.code；mouse 使用 MouseEvent.button。 */

/**
 * 'map'（小地图/大地图切换）、'help'（操作提示显示/隐藏）与 'settings'（设置面板开关，打开时暂停）为界面动作，
 * 不进入模拟输入帧（见 action-map consumeUi）。
 */
export type GameAction =
  | 'moveLeft' | 'moveRight' | 'walk' | 'jump' | 'down' | 'shoot' | 'mount' | 'transform' | 'map' | 'help' | 'settings'
  | 'skill1' | 'skill2' | 'skill3' | 'skill4';

export const GAME_ACTIONS: readonly GameAction[] = Object.freeze([
  'moveLeft', 'moveRight', 'walk', 'jump', 'down', 'shoot', 'mount', 'transform', 'map', 'help', 'settings',
  'skill1', 'skill2', 'skill3', 'skill4',
] as const);

/** 界面动作（不进入模拟输入帧）与游戏动作（其余全部；任一按住即算“有效输入”）。 */
export const UI_ACTIONS: readonly GameAction[] = Object.freeze(['map', 'help', 'settings'] as const);
export const PLAY_ACTIONS: readonly GameAction[] = Object.freeze(GAME_ACTIONS.filter((a) => !UI_ACTIONS.includes(a)));

/** 技能动作（右键与数字 1..3 直接释放）。 */
export const SKILL_ACTIONS: readonly GameAction[] = Object.freeze(['skill1', 'skill2', 'skill3', 'skill4'] as const);

export type Binding = { readonly device: 'key'; readonly code: string } | { readonly device: 'mouse'; readonly button: number };

export type Bindings = Readonly<Record<GameAction, readonly Binding[]>>;

export interface BindingLookup {
  readonly keys: ReadonlyMap<string, GameAction>;
  readonly mouse: ReadonlyMap<number, GameAction>;
}

const key = (code: string): Binding => ({ device: 'key', code });
const mouse = (button: number): Binding => ({ device: 'mouse', button });

export const DEFAULT_BINDINGS: Bindings = Object.freeze({
  moveLeft: Object.freeze([key('KeyA'), key('ArrowLeft')]),
  moveRight: Object.freeze([key('KeyD'), key('ArrowRight')]),
  /** 按住慢走（默认自动奔跑）：左右 Shift。 */
  walk: Object.freeze([key('ShiftLeft'), key('ShiftRight')]),
  jump: Object.freeze([key('Space'), key('KeyW'), key('ArrowUp')]),
  down: Object.freeze([key('KeyS'), key('ArrowDown')]),
  /** 普通攻击：鼠标左键或 J/K。 */
  shoot: Object.freeze([mouse(0), key('KeyJ'), key('KeyK')]),
  /** 上车/下车切换：R。 */
  mount: Object.freeze([key('KeyR')]),
  transform: Object.freeze([key('KeyF')]),
  /** 大地图开关：M。 */
  map: Object.freeze([key('KeyM')]),
  /** 操作提示显示/隐藏：H。 */
  help: Object.freeze([key('KeyH')]),
  /** 设置面板开关（打开时暂停）：Esc / O。 */
  settings: Object.freeze([key('Escape'), key('KeyO')]),
  /** 右键释放副攻；数字键直接施放其余技能，E 也可释放光子大招。 */
  skill1: Object.freeze([mouse(2)]),
  skill2: Object.freeze([key('Digit1'), key('Numpad1')]),
  skill3: Object.freeze([key('Digit2'), key('Numpad2')]),
  skill4: Object.freeze([key('Digit3'), key('Numpad3'), key('KeyE')]),
});

function bindingLabel(b: Binding): string {
  return b.device === 'key' ? b.code : `mouse${b.button}`;
}

/** 每个动作至少一个绑定；同一按键/按钮不得绑定到多个动作；非法字段即抛。 */
export function validateBindings(bindings: Bindings): void {
  const seen = new Map<string, GameAction>();
  for (const action of GAME_ACTIONS) {
    const list = bindings[action];
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(`Invalid bindings: action '${action}' has no binding`);
    }
    for (const b of list as readonly Binding[]) {
      if (b.device === 'key') {
        if (typeof b.code !== 'string' || b.code.length === 0) {
          throw new Error(`Invalid bindings: action '${action}' has empty key code`);
        }
      } else if (b.device === 'mouse') {
        if (!Number.isInteger(b.button) || b.button < 0 || b.button > 4) {
          throw new Error(`Invalid bindings: action '${action}' has invalid mouse button ${String(b.button)}`);
        }
      } else {
        throw new Error(`Invalid bindings: action '${action}' has unknown device ${String((b as { device: unknown }).device)}`);
      }
      const label = bindingLabel(b);
      const prev = seen.get(label);
      if (prev !== undefined) {
        throw new Error(`Invalid bindings: ${label} is bound to both '${prev}' and '${action}'`);
      }
      seen.set(label, action);
    }
  }
  for (const k of Object.keys(bindings)) {
    if (!(GAME_ACTIONS as readonly string[]).includes(k)) throw new Error(`Invalid bindings: unknown action '${k}'`);
  }
}

/** 构建 按键/按钮 → 动作 查找表（内部先 validateBindings）。 */
export function buildBindingLookup(bindings: Bindings): BindingLookup {
  validateBindings(bindings);
  const keys = new Map<string, GameAction>();
  const mouseMap = new Map<number, GameAction>();
  for (const action of GAME_ACTIONS) {
    for (const b of bindings[action]) {
      if (b.device === 'key') keys.set(b.code, action);
      else mouseMap.set(b.button, action);
    }
  }
  return { keys, mouse: mouseMap };
}
