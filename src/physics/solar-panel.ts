import { BUILDING_KIT } from '../config/building-kit.ts';
import { clamp } from '../core/math.ts';
import type { Body } from './body.ts';
import { definitionColliderSection } from './definition-collision.ts';
import { COLLISION_EPS as EPS } from './tile-collision.ts';

const PANEL = BUILDING_KIT.solar;

export interface SolarPanelState {
  /** 枢轴的世界横坐标、底座的世界高度。 */
  readonly x: number;
  readonly y: number;
  angle: number;
  sunAngle: number;
  loaded: boolean;
  readonly collider: { points: [number, number][] };
}

export function solarTrackingAngle(sun: { readonly x: number; readonly y: number }): number {
  return sun.y <= 0 ? 0 : clamp(Math.atan2(-sun.x, sun.y), -PANEL.tilt, PANEL.tilt);
}

function updateCollider(panel: SolarPanelState): void {
  const cosine = Math.cos(panel.angle);
  const sine = Math.sin(panel.angle);
  panel.collider.points = [
    [-PANEL.panelWidth / 2, PANEL.panelBottom], [PANEL.panelWidth / 2, PANEL.panelBottom],
    [PANEL.panelWidth / 2, PANEL.panelTop], [-PANEL.panelWidth / 2, PANEL.panelTop],
  ].map(([x, y]) => [panel.x + x! * cosine - y! * sine, panel.y + PANEL.pivotHeight + x! * sine + y! * cosine]);
}

export function createSolarPanel(x: number, y: number, sunAngle: number): SolarPanelState {
  const panel: SolarPanelState = { x, y, angle: sunAngle, sunAngle, loaded: false, collider: { points: [] } };
  updateCollider(panel);
  return panel;
}

/** 固定物理步驱动整板；接触者随支撑面升降，起跳后立刻解除跟随。 */
export function stepSolarPanels(panels: readonly SolarPanelState[], body: Body, dt: number): void {
  let supportTop: number | null = null;
  for (const panel of panels) {
    const previous = definitionColliderSection(panel.collider, 0, body.x - body.halfWidth + EPS, body.x + body.halfWidth - EPS);
    panel.loaded = body.onGround && body.vy <= 0 && previous !== null && Math.abs(previous[1] - body.y) <= EPS;
    const target = panel.loaded
      ? -clamp((body.x - panel.x) / (PANEL.panelWidth / 2), -1, 1) * PANEL.tilt
      : panel.sunAngle;
    panel.angle += (target - panel.angle) * (1 - Math.exp(-(panel.loaded ? 7 : 2.5) * dt));
    updateCollider(panel);
    if (panel.loaded) {
      const next = definitionColliderSection(panel.collider, 0, body.x - body.halfWidth + EPS, body.x + body.halfWidth - EPS);
      if (next !== null) supportTop = supportTop === null ? next[1] : Math.max(supportTop, next[1]);
    }
  }
  if (supportTop !== null) body.y = supportTop;
}
