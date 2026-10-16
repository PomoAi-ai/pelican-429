import * as THREE from 'three';
import type { DefinitionDepthMode } from '../config/definition-kit.ts';
import { createDefinitionKit } from '../render/definition-kit.ts';
import { createDefinitionDepthOccupancy, definitionDepthConflict, type DefinitionDepthPlacement } from '../sim/definition-depth.ts';

type TrialShape = 'A' | 'C';

/** 预建真实构件以保留检查器的格线和半透明；试放只切换有效状态。 */
export function createDefinitionDepthTrial(x: number, y: number) {
  const root = new THREE.Group();
  root.position.set(x, y, 0);
  const occupancy = createDefinitionDepthOccupancy();
  const tiles = new Map<string, ReturnType<typeof createDefinitionKit>>();
  const walls = new Map<string, { placement: DefinitionDepthPlacement; kit: ReturnType<typeof createDefinitionKit> }>();
  for (const mode of ['normal', 'deep'] as const) for (const shape of ['A', 'C'] as const) for (const width of [1, 2] as const) {
    const kit = createDefinitionKit({ style: 'ai-city' });
    for (let column = 0; column < width; column++) kit.solid(shape, column, 0, 'ceramic', mode);
    kit.root.visible = false;
    root.add(kit.root);
    tiles.set(`${mode}:${shape}:${width}`, kit);
  }
  for (const [name, wx, wy] of [['left', 0, 0], ['right', 1, 0], ['above', 0, 1]] as const) {
    const kit = createDefinitionKit();
    kit.wall('W0', wx, wy);
    kit.root.visible = false;
    root.add(kit.root);
    walls.set(name, { placement: { kind: 'wall', x: wx, y: wy, width: 1, height: 1 }, kit });
  }
  let tile: DefinitionDepthPlacement | null = null;
  let active: ReturnType<typeof createDefinitionKit> | null = null;
  const placeTile = (mode: DefinitionDepthMode, shape: TrialShape, width: 1 | 2): string => {
    const next: DefinitionDepthPlacement = { kind: 'solid', depthMode: mode, x: 0, y: 0, width, height: 1 };
    const conflict = definitionDepthConflict(next, occupancy.entries);
    if (conflict) return `未放置：${conflict}原构件保持不变。`;
    if (tile) occupancy.remove(tile);
    if (active) active.root.visible = false;
    occupancy.place(next);
    tile = next;
    active = tiles.get(`${mode}:${shape}:${width}`)!;
    active.root.visible = true;
    return `已放置${width}个${mode === 'deep' ? '加深' : '普通'}${shape === 'C' ? '上半砖' : '整砖'}，${width === 2 ? '总宽2格，每格仍宽1' : '宽1格'}；深${mode === 'deep' ? 3 : 2}。`;
  };
  const describe = (): string => {
    const wallNames = [...walls].filter(([, wall]) => wall.kit.root.visible).map(([name]) => ({ left: '左格', right: '右格', above: '上方' })[name]);
    return `${tile ? `${tile.width}格${tile.kind === 'solid' && tile.depthMode === 'deep' ? '加深砖' : '普通砖'}` : '没有砖块'}；背景墙：${wallNames.length ? wallNames.join('、') : '无'}。`;
  };
  placeTile('deep', 'C', 2);
  return {
    root, placeTile, describe,
    get solids() {
      return active ? active.solids.map(solid => ({ points: solid.points.map(([px, py]) => [px + x, py + y] as const) })) : [];
    },
    placeWall(name: 'left' | 'right' | 'above'): string {
      const wall = walls.get(name)!;
      if (wall.kit.root.visible) return '这里已经有背景墙。';
      const conflict = occupancy.place(wall.placement);
      if (conflict) return `未放置：${conflict}原构件保持不变。`;
      wall.kit.root.visible = true;
      return '已放置背景墙；仅与覆盖同格的加深砖互斥。';
    },
    removeTiles(): string {
      if (tile) occupancy.remove(tile);
      if (active) active.root.visible = false;
      tile = null; active = null;
      return '已拆除试放砖块，原背景墙保留。';
    },
    removeWalls(): string {
      for (const wall of walls.values()) { occupancy.remove(wall.placement); wall.kit.root.visible = false; }
      return '已拆除试放背景墙，可以在对应格位放加深砖。';
    },
    dispose(): void {
      for (const kit of tiles.values()) kit.dispose();
      for (const { kit } of walls.values()) kit.dispose();
      root.removeFromParent();
    },
  };
}

export type DefinitionDepthTrial = ReturnType<typeof createDefinitionDepthTrial>;

export function bindDefinitionDepthTrial(host: HTMLElement, trial: DefinitionDepthTrial, changed: () => void): void {
  let shape: TrialShape = 'C';
  let width: 1 | 2 = 2;
  host.innerHTML = `<summary>加深格 · 规则试放</summary>
    <p>操作右下方试放区。加深格深3，前后各扩0.5；同格背景墙双向互斥。</p>
    <div class="room-preview-control-row" role="group" aria-label="试放形状"><button data-trial-shape="A" aria-pressed="false">整砖</button><button data-trial-shape="C" aria-pressed="true">上半砖</button></div>
    <div class="room-preview-control-row" role="group" aria-label="试放占格"><button data-trial-width="1" aria-pressed="false">单格</button><button data-trial-width="2" aria-pressed="true">两格拼接</button></div>
    <div class="room-preview-control-row"><button data-trial-place="normal">放普通格 · 深2</button><button data-trial-place="deep">放加深格 · 深3</button></div>
    <div class="room-preview-control-row"><button data-trial-wall="left">左格放墙</button><button data-trial-wall="right">右格放墙</button><button data-trial-wall="above">上方放墙</button></div>
    <div class="room-preview-control-row"><button data-trial-remove="tiles">拆除砖块</button><button data-trial-remove="walls">拆除背景墙</button></div>
    <p data-trial-result role="status">已放置两个加深上半砖，可先尝试放墙。</p><p data-trial-state></p>
    <small>普通格允许背景墙；半砖也按所属整格禁墙。失败不删原构件。修改后玩家回到起点。</small>`;
  const result = host.querySelector<HTMLElement>('[data-trial-result]')!;
  const state = host.querySelector<HTMLElement>('[data-trial-state]')!;
  state.textContent = trial.describe();
  for (const button of host.querySelectorAll<HTMLButtonElement>('button')) button.type = 'button';
  for (const value of ['A', 'C'] as const) host.querySelector(`[data-trial-shape="${value}"]`)!.addEventListener('click', () => {
    shape = value;
    for (const button of host.querySelectorAll('[data-trial-shape]')) button.setAttribute('aria-pressed', String(button.getAttribute('data-trial-shape') === value));
  });
  for (const value of [1, 2] as const) host.querySelector(`[data-trial-width="${value}"]`)!.addEventListener('click', () => {
    width = value;
    for (const button of host.querySelectorAll('[data-trial-width]')) button.setAttribute('aria-pressed', String(button.getAttribute('data-trial-width') === String(value)));
  });
  const apply = (message: string): void => { result.textContent = message; state.textContent = trial.describe(); changed(); };
  for (const mode of ['normal', 'deep'] as const) host.querySelector(`[data-trial-place="${mode}"]`)!.addEventListener('click', () => apply(trial.placeTile(mode, shape, width)));
  for (const side of ['left', 'right', 'above'] as const) host.querySelector(`[data-trial-wall="${side}"]`)!.addEventListener('click', () => apply(trial.placeWall(side)));
  host.querySelector('[data-trial-remove="tiles"]')!.addEventListener('click', () => apply(trial.removeTiles()));
  host.querySelector('[data-trial-remove="walls"]')!.addEventListener('click', () => apply(trial.removeWalls()));
}
