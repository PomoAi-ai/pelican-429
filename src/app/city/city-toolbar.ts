/** 场景工具条的城区部分：建造开关，以及主世界城区的快速旅行（城区各分段与原野入口）。 */
import type { FreeWorldSize } from '../../config/free-world.ts';
import { t } from '../../config/i18n.ts';
import { CITY_ORIGIN, RESIDENCE_SEGMENT_WIDTH, RESIDENCE_SEGMENTS } from '../../config/residence.ts';
import { citySegmentSpawn, type CityState } from '../../sim/city.ts';
import { teleportPlayer } from '../../sim/player-teleport.ts';
import { getPlayer, type SimWorld } from '../../sim/sim-world.ts';
import { gameHost } from '../../ui/hud/mobile-game-viewport.ts';
import { onLanguageChange } from '../../ui/model/language.ts';
import { createFreeWorldToolbar } from '../../ui/panels/free-world-toolbar.tsx';
import type { CityFeature } from './city-feature.ts';

/** 建造开关：只在城区可用；busy 为真（着陆舱开场、乘坐交通中心）时输入锁定，不能进出建造。 */
export function createBuildButton(feature: CityFeature | null, busy: () => boolean): { readonly element: HTMLButtonElement; dispose(): void } {
  const element = document.createElement('button');
  element.type = 'button';
  element.disabled = feature === null;
  const sync = (): void => {
    element.textContent = t(feature?.building ? '结束建造' : '建造');
    element.title = feature === null ? t('只能在城区建造') : '';
    element.setAttribute('aria-pressed', String(feature?.building === true));
  };
  if (feature !== null) element.addEventListener('click', () => {
    if (busy()) return;
    feature.setBuilding(!feature.building);
    sync();
  });
  sync();
  return { element, dispose: onLanguageChange(sync) };
}

interface CityTravelOptions {
  readonly world: SimWorld;
  readonly city: CityState;
  readonly feature: CityFeature;
  readonly seed: number;
  readonly gm: boolean;
  readonly size: FreeWorldSize;
  /** 着陆舱开场与乘坐交通中心期间不传送。 */
  readonly busy: () => boolean;
  /** 整页进入原野（可换种子与规模）。 */
  readonly toWilds: (seed: number, size?: FreeWorldSize) => void;
  readonly releaseInput: () => void;
  readonly focusGame: () => void;
}

/** 主世界城区的快速旅行：城区各分段在本页传送，原野入口与换种子整页跳转。 */
export function createCityTravelToolbar(bar: HTMLElement, o: CityTravelOptions): ReturnType<typeof createFreeWorldToolbar> {
  const regions = [...RESIDENCE_SEGMENTS.map(segment => ({ id: String(segment.index), label: t(segment.label), labelEn: t(segment.label) })),
    { id: 'wilds', label: t('原野入口'), labelEn: t('原野入口') }];
  return createFreeWorldToolbar(bar, {
    seed: o.seed, gm: o.gm, gmHint: 'reload', size: o.size, regions,
    region: String(Math.floor((getPlayer(o.world).body.x - CITY_ORIGIN.x) / RESIDENCE_SEGMENT_WIDTH)),
    onSeed: (next, nextSize) => o.toWilds(next, nextSize),
    onGm: enabled => {
      o.releaseInput();
      const next = new URLSearchParams(location.search);
      next.set('gm', enabled ? '1' : '0');
      gameHost().location.assign(`${location.pathname}?${next}`);
    },
    onRegion: id => {
      if (id === 'wilds') { o.toWilds(o.seed); return true; }
      if (o.busy() || o.feature.building) return false;
      if (teleportPlayer(o.world, citySegmentSpawn(o.city, Number(id))) === null) return false;
      o.releaseInput();
      o.focusGame();
      return true;
    },
    onFocus: o.releaseInput,
    onFocusGame: o.focusGame,
  });
}
