/** 家园概念版本装配：设施与无人机视图、界面、昼夜曝光、砍树同步与存档。 */
import { TUNING } from '../config/tuning.ts';
import { HOMESTEAD } from '../config/homestead.ts';
import { BUILDING_KIT } from '../config/building-kit.ts';
import type { Vec2 } from '../core/math.ts';
import type { ActionTracker } from '../input/action-map.ts';
import type { CameraRig } from '../render/camera-rig.ts';
import { createHomesteadView } from '../render/homestead-view.ts';
import type { Stage } from '../render/stage.ts';
import { canSleep, captureHomestead, cancelArea, checkDepot, checkSolar, markArea, placeDepot, placeSolar, purchase, sleepHomestead } from '../sim/homestead.ts';
import type { Spot } from '../sim/homestead.ts';
import { getPlayer } from '../sim/sim-world.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import { createHomesteadHud } from '../ui/homestead-hud.ts';
import type { HomesteadTerminal } from '../ui/homestead-hud.ts';
import { saveHomestead } from './homestead-save.ts';

/** 定时存档间隔（现实秒）；页面隐藏与离开时另外立即保存。 */
const SAVE_SECONDS = 20;
/** 夜里曝光降到白天的这个比例；天亮、天黑各用 2 游戏小时过渡。 */
const NIGHT_EXPOSURE = 0.38;

export interface HomesteadAppOptions {
  readonly world: SimWorld;
  readonly stage: Stage;
  /** 砍倒一棵树后通知各个视图（树、光照、小地图、光柱）同步移除。 */
  readonly removeTree: (id: number) => void;
  readonly cameraRig: CameraRig;
  readonly tracker: ActionTracker;
  readonly canvas: HTMLCanvasElement;
  readonly seed: number;
  readonly disposers: Array<() => void>;
}

export interface HomesteadApp {
  readonly open: boolean;
  update(frameDt: number): void;
  persist(): void;
}

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function daylight(second: number): number {
  const hour = second / 3600;
  const { dawnHour, duskHour } = HOMESTEAD.clock;
  return Math.min(smooth((hour - dawnHour + 1) / 2), smooth((duskHour + 1 - hour) / 2));
}

export function createHomesteadApp(o: HomesteadAppOptions): HomesteadApp {
  const { world, stage, cameraRig, tracker, canvas } = o;
  const state = world.homestead!;
  const view = createHomesteadView(stage.scene, world.level.trees);
  o.disposers.push(() => view.dispose());
  let removedTrees = 0;
  const syncTrees = (): void => {
    for (; removedTrees < state.felled.length; removedTrees++) o.removeTree(state.felled[removedTrees]!);
  };
  syncTrees();
  const persist = (): void => saveHomestead(window.localStorage, o.seed, captureHomestead(state));
  const point: Vec2 = { x: 0, y: 0 };
  const near = (spot: Spot): boolean => {
    const player = getPlayer(world);
    return Math.abs(player.body.x - (spot.x + spot.width / 2)) < 1.8 && Math.abs(player.body.y - spot.y) < 3;
  };
  const hud = createHomesteadHud(document.body, {
    state: () => state,
    terminal: (): HomesteadTerminal | null => near(state.facilities.computeTerminal) ? 'compute' : near(state.facilities.robotTerminal) ? 'robot' : null,
    canSleep: () => canSleep(world),
    toWorld: (clientX, clientY) => {
      const at = cameraRig.screenToWorld(clientX, clientY, point);
      return at === null ? null : { x: at.x, y: at.y };
    },
    onMark: area => markArea(world, area),
    onCancel: area => cancelArea(world, area),
    onPlaceDepot: x => placeDepot(world, x),
    onPlaceSolar: area => placeSolar(world, area),
    onPreview: (kind, at) => {
      if (kind === null) return view.setGhost(null);
      if (kind === 'solar') {
        const tx = Math.floor(at.x);
        const ty = Math.floor(at.y);
        return view.setGhost({ x: tx, y: ty, width: BUILDING_KIT.solar.width, height: BUILDING_KIT.solar.height, valid: checkSolar(world, tx, ty) === 'ok' });
      }
      const check = checkDepot(world, at.x);
      view.setGhost({ x: check.left, y: check.y, width: HOMESTEAD.builds.depot.width, height: 1.4, valid: check.result === 'ok' });
    },
    onBuy: item => purchase(world, item),
    onSleep: () => {
      tracker.releaseAll();
      sleepHomestead(world);
      persist();
    },
    onMode: mode => { state.economy.mode = mode; },
    onOpen: () => tracker.releaseAll(),
    onClose: () => { tracker.releaseAll(); canvas.focus(); },
  });
  o.disposers.push(() => hud.dispose());
  const baseExposure = TUNING.render.exposure;
  o.disposers.push(() => { stage.renderer.toneMappingExposure = baseExposure; });
  let time = 0;
  let sinceSave = 0;
  return {
    get open() { return hud.open; },
    update(frameDt) {
      time += frameDt;
      syncTrees();
      const player = getPlayer(world);
      view.update(state, time, { x: player.body.x, y: player.body.y }, hud.commanding);
      hud.update();
      stage.renderer.toneMappingExposure = baseExposure * (NIGHT_EXPOSURE + (1 - NIGHT_EXPOSURE) * daylight(state.economy.second));
      sinceSave += frameDt;
      if (sinceSave >= SAVE_SECONDS) {
        sinceSave = 0;
        persist();
      }
    },
    persist,
  };
}
