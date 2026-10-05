/**
 * 相机与渲染调参（从 tuning.ts 拆出，任务 019 收尾）：结构即 Tuning['camera'] / Tuning['render']；
 * 光照与天气的大段配置仍在 lighting-rules / weather-rules。
 */
import type { Vec2 } from '../core/math.ts';
import { DEFAULT_LIGHTING, validateLightingTuning } from './lighting-rules.ts';
import type { LightingTuning } from './lighting-rules.ts';
import { DEFAULT_WEATHER, validateWeatherTuning } from './weather-rules.ts';
import type { WeatherTuning } from './weather-rules.ts';
import { fail, finite, inRange, intRange, nonNegative, positive } from './tuning-checks.ts';

export interface CameraTuning {
  readonly fov: number;
  readonly distance: number;
  readonly lookAhead: number;
  readonly deadZone: Readonly<Vec2>;
  readonly lambda: number;
  /** 相机下边界 = min(地表) − floorDepth（不展示深层地下）。 */
  readonly floorDepth: number;
  /**
   * 竖直取景偏移（格）：注视点在“脚底 + FOCUS_HEIGHT”基础上再抬高的量，正值让角色更靠画面下方（多看天空、少看地下）。
   * |值| ≤ 半视高的一半（distance·tan(fov/2)/2），保证角色始终在画面中部区域。
   */
  readonly framingOffsetY: number;
  /**
   * 开场取景（出生在渔屋门外时，见 render/camera-intro）：开局拉远/上移让整座渔屋与鹈鹕同框，停留 hold 秒
   * （玩家一有输入立即结束停留）后 blend 秒平滑过渡到正常跟随；margin（≥1）为取景框四周放大倍数。
   */
  readonly intro: { readonly hold: number; readonly blend: number; readonly margin: number };
}

export interface RenderTuning {
  readonly pelicanScale: number;
  readonly exposure: number;
  readonly envIntensity: number;
  readonly keyLight: number;
  readonly hemi: number;
  /** 光球固定点光源池大小（整数 0..4）。 */
  readonly orbLights: number;
  /** 斜坡上角色模型下沉到中心处地面的比例 [0,1]（0 = 关闭；见 entity-views）。 */
  readonly slopeSink: number;
  /** 光照/阴影/后期/光束/远景大气（见 config/lighting-rules）。 */
  readonly lighting: LightingTuning;
  /** 风吹天气：风场、阵风、天气循环、风线/飘叶粒子、云层与云影（见 config/weather-rules）。 */
  readonly weather: WeatherTuning;
}

export const DEFAULT_CAMERA: CameraTuning = { fov: 30, distance: 30, lookAhead: 1.5, deadZone: { x: 1, y: 0.8 }, lambda: 6, floorDepth: 3, framingOffsetY: 1.2, intro: { hold: 1.6, blend: 1.4, margin: 1.35 } };

export const DEFAULT_RENDER: RenderTuning = { pelicanScale: 0.5, exposure: 1.25, envIntensity: 0.35, keyLight: 3.4, hemi: 1.0, orbLights: 2, slopeSink: 0.7, lighting: DEFAULT_LIGHTING, weather: DEFAULT_WEATHER };

export function validateCamera(c: CameraTuning): void {
  positive('camera.fov', c.fov);
  if (c.fov >= 180) fail('camera.fov', 'must be < 180', c.fov);
  positive('camera.distance', c.distance);
  nonNegative('camera.lookAhead', c.lookAhead);
  nonNegative('camera.deadZone.x', c.deadZone.x);
  nonNegative('camera.deadZone.y', c.deadZone.y);
  positive('camera.lambda', c.lambda);
  nonNegative('camera.floorDepth', c.floorDepth);
  finite('camera.framingOffsetY', c.framingOffsetY);
  const framingLimit = (c.distance * Math.tan((c.fov * Math.PI) / 360)) / 2;
  if (Math.abs(c.framingOffsetY) > framingLimit) fail('camera.framingOffsetY', `must be within ±${framingLimit.toFixed(2)} (half of the half view height)`, c.framingOffsetY);
  nonNegative('camera.intro.hold', c.intro.hold);
  positive('camera.intro.blend', c.intro.blend);
  if (!(c.intro.margin >= 1 && Number.isFinite(c.intro.margin))) fail('camera.intro.margin', 'must be a finite number >= 1', c.intro.margin);
}

export function validateRender(r: RenderTuning): void {
  positive('render.pelicanScale', r.pelicanScale);
  positive('render.exposure', r.exposure);
  nonNegative('render.envIntensity', r.envIntensity);
  nonNegative('render.keyLight', r.keyLight);
  nonNegative('render.hemi', r.hemi);
  intRange('render.orbLights', r.orbLights, 0, 4);
  inRange('render.slopeSink', r.slopeSink, 0, 1);
  validateLightingTuning(r.lighting, 'render.lighting');
  validateWeatherTuning(r.weather, 'render.weather');
}
