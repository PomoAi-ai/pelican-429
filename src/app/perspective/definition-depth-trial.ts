import * as THREE from 'three';
import type { DefinitionDepthMode } from '../../config/definition-kit.ts';
import { createDefinitionKit } from '../../render/building/definition-kit.ts';
import { createDefinitionDepthOccupancy, definitionDepthConflict, type DefinitionDepthPlacement } from '../../sim/definition-depth.ts';
import { t } from '../../config/i18n.ts';

type TrialShape = 'A' | 'C';

/** 预建真实构件以保留检查器的格线和半透明；试放只切换有效状态。 */
export function createDefinitionDepthTrial(x: number, y: number) {
  const root = new THREE.Group();
  root.position.set(x, y, 0);
  const occupancy = createDefinitionDepthOccupancy();
  const tiles = new Map<string, ReturnType<typeof createDefinitionKit>>();
  const walls = new Map<'left' | 'right' | 'above', { placement: DefinitionDepthPlacement; kit: ReturnType<typeof createDefinitionKit> }>();
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
    if (conflict) return notPlaced(conflict);
    if (tile) occupancy.remove(tile);
    if (active) active.root.visible = false;
    occupancy.place(next);
    tile = next;
    active = tiles.get(`${mode}:${shape}:${width}`)!;
    active.root.visible = true;
    const kind = mode === 'deep' ? (shape === 'C' ? '加深上半砖' : '加深整砖') : shape === 'C' ? '普通上半砖' : '普通整砖';
    return t('已放置{n}个{kind}，{size}；深{depth}。').replace('{n}', String(width)).replace('{kind}', t(kind))
      .replace('{size}', t(width === 2 ? '总宽2格，每格仍宽1' : '宽1格')).replace('{depth}', String(mode === 'deep' ? 3 : 2));
  };
  const describe = (): string => {
    const wallNames = [...walls].filter(([, wall]) => wall.kit.root.visible).map(([name]) => t(({ left: '左格', right: '右格', above: '上方' })[name], 'trial'));
    const tiles = tile ? t(tile.kind === 'solid' && tile.depthMode === 'deep' ? '{n}格加深砖' : '{n}格普通砖').replace('{n}', String(tile.width)) : t('没有砖块');
    return t('{tiles}；背景墙：{walls}。').replace('{tiles}', tiles).replace('{walls}', wallNames.length ? wallNames.join(t('、')) : t('无', 'trial'));
  };
  placeTile('deep', 'C', 2);
  return {
    root, placeTile, describe,
    get solids() {
      return active ? active.solids.map(solid => ({ points: solid.points.map(([px, py]) => [px + x, py + y] as const) })) : [];
    },
    placeWall(name: 'left' | 'right' | 'above'): string {
      const wall = walls.get(name)!;
      if (wall.kit.root.visible) return t('这里已经有背景墙。');
      const conflict = occupancy.place(wall.placement);
      if (conflict) return notPlaced(conflict);
      wall.kit.root.visible = true;
      return t('已放置背景墙；仅与覆盖同格的加深砖互斥。');
    },
    removeTiles(): string {
      if (tile) occupancy.remove(tile);
      if (active) active.root.visible = false;
      tile = null; active = null;
      return t('已拆除试放砖块，原背景墙保留。');
    },
    removeWalls(): string {
      for (const wall of walls.values()) { occupancy.remove(wall.placement); wall.kit.root.visible = false; }
      return t('已拆除试放背景墙，可以在对应格位放加深砖。');
    },
    dispose(): void {
      for (const kit of tiles.values()) kit.dispose();
      for (const { kit } of walls.values()) kit.dispose();
      root.removeFromParent();
    },
  };
}

// 冲突原因来自 sim 层（中文原文），在显示处翻译。
const notPlaced = (conflict: string): string => t('未放置：{reason}原构件保持不变。').replace('{reason}', t(conflict));

export type DefinitionDepthTrial = ReturnType<typeof createDefinitionDepthTrial>;

export function bindDefinitionDepthTrial(host: HTMLElement, trial: DefinitionDepthTrial, changed: () => void): void {
  let shape: TrialShape = 'C';
  let width: 1 | 2 = 2;
  host.innerHTML = `<summary>${t('加深格 · 规则试放')}</summary>
    <p>${t('操作右下方试放区。加深格深3，前后各扩0.5；同格背景墙双向互斥。')}</p>
    <div class="room-preview-control-row" role="group" aria-label="${t('试放形状')}"><button data-trial-shape="A" aria-pressed="false">${t('整砖')}</button><button data-trial-shape="C" aria-pressed="true">${t('上半砖')}</button></div>
    <div class="room-preview-control-row" role="group" aria-label="${t('试放占格')}"><button data-trial-width="1" aria-pressed="false">${t('单格')}</button><button data-trial-width="2" aria-pressed="true">${t('两格拼接')}</button></div>
    <div class="room-preview-control-row"><button data-trial-place="normal">${t('放普通格 · 深2')}</button><button data-trial-place="deep">${t('放加深格 · 深3')}</button></div>
    <div class="room-preview-control-row"><button data-trial-wall="left">${t('左格放墙')}</button><button data-trial-wall="right">${t('右格放墙')}</button><button data-trial-wall="above">${t('上方放墙')}</button></div>
    <div class="room-preview-control-row"><button data-trial-remove="tiles">${t('拆除砖块')}</button><button data-trial-remove="walls">${t('拆除背景墙')}</button></div>
    <p data-trial-result role="status">${t('已放置两个加深上半砖，可先尝试放墙。')}</p><p data-trial-state></p>
    <small>${t('普通格允许背景墙；半砖也按所属整格禁墙。失败不删原构件。修改后玩家回到起点。')}</small>`;
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
