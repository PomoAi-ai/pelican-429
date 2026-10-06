/**
 * 小地图 DOM 层（泰拉瑞亚式）：右上角圆角小窗跟随玩家；大地图为全屏半透明遮罩，显示整个世界，可拖动/滚轮缩放。
 * - 世界底图：离屏 canvas，创建时由 minimap-model 的栅格一次生成（ImageData 与栅格共享内存）；
 *   之后只把脏区块 putImageData 回离屏 canvas。瓦片变化订阅 TileMap.onChange；水量每 fluidScanInterval 秒
 *   比较一次区块水量哈希（不调用破坏性的 takeDirtyChunks）。
 * - 每帧只做 drawImage + 标记绘制。大地图打开时游戏继续运行。
 * 不依赖 three/render；world 数据只读。
 */
import type { TileMap } from '../world/tile-map.ts';
import type { FacilityChapterId } from '../config/facility-scenes.ts';
import { FACILITY_SCENES } from '../config/facility-scenes.ts';
import { drawFacilityMapBase, drawFacilityMapMarkers, FACILITY_MAP_LEGEND, FACILITY_MAP_LEGEND_EN, FACILITY_EN } from './facility-minimap.ts';
import {
  MINIMAP_TILE_PX,
  MINIMAP_ZOOM_MAX,
  MINIMAP_ZOOM_MIN,
  MINIMAP_ZOOM_STEP,
  bigMapFit,
  bigMapRect,
  clampZoom,
  createMinimapRaster,
  followView,
  panBigMap,
  rasterBlit,
  stepZoom,
  viewToWorld,
  worldToView,
  zoomBigMapAt,
} from './minimap-model.ts';
import { getLanguage, onLanguageChange } from './language.ts';
import type { BigMapLimits, BigMapView, MinimapRaster, MinimapSource, WorldRect } from './minimap-model.ts';

export interface MinimapSourceLive extends MinimapSource {
  readonly tiles: MinimapSource['tiles'] & Pick<TileMap, 'onChange'>;
}

export interface MinimapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MinimapFrame {
  /** 玩家标记中心（世界坐标）与朝向。 */
  readonly player: MinimapPoint & { readonly facing: 1 | -1 };
  /** 其它标记（如训练假人）。 */
  readonly dummies?: readonly MinimapPoint[];
  /** 帧时长（秒，≥ 0）。 */
  readonly dt: number;
}

export interface MinimapOptions {
  /** 小地图/大地图元素挂载点（通常 document.body）。 */
  readonly parent: HTMLElement;
  readonly source: MinimapSourceLive;
  readonly facilityChapter?: FacilityChapterId;
  /** 屏幕尺寸（CSS px），大地图及自适应小地图用。 */
  readonly viewport: () => { readonly width: number; readonly height: number };
  /** 键盘（Esc 关大地图、+/- 缩放）与全局鼠标（拖动）事件目标，通常 window。 */
  readonly keyTarget: EventTarget;
  readonly pixelRatio?: () => number;
  /** 小窗 CSS 尺寸，默认屏幕宽高各18%。显式尺寸保持固定。 */
  readonly width?: number;
  readonly height?: number;
  /** 初始缩放（[1,4]），默认 width/120；不足120格的小世界按宽度放大底图。 */
  readonly zoom?: number;
  /** 水量变化扫描间隔（秒，> 0），默认 0.5。 */
  readonly fluidScanInterval?: number;
  /** 由小地图自己监听的大地图切换键（KeyboardEvent.code）；省略则由调用方调用 toggleBigMap。 */
  readonly toggleKey?: string;
  /** 调试传送：成功返回 true 并关闭大地图；无可用落点返回 false。 */
  readonly onTeleport?: (point: MinimapPoint) => boolean;
  /** 栅格选项（测试用）。 */
  readonly tilePx?: number;
}

export interface Minimap {
  update(frame: MinimapFrame): void;
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** 小地图不透明度（百分比），不影响大地图或设置入口。 */
  readonly opacity: number;
  setOpacity(opacity: number): void;
  /** 切换大地图；传 open 则设为指定状态。 */
  toggleBigMap(open?: boolean): void;
  readonly bigMapOpen: boolean;
  readonly teleportEnabled: boolean;
  setTeleportEnabled(on: boolean): void;
  /** 小地图当前缩放（每格 CSS px）。 */
  readonly zoom: number;
  setZoom(zoom: number): void;
  readonly bigMapView: BigMapView | null;
  readonly raster: MinimapRaster;
  dispose(): void;
}

const OUTSIDE = '#0b0f15';
const MARKER_SIZE_MINI = 7;
const MARKER_SIZE_BIG = 8;
const MAP_HINT = '大地图 · 拖动平移 · 滚轮缩放 · M / Esc 关闭';
const TELEPORT_HINT = '点击传送 · 拖动平移 · 滚轮缩放 · M / Esc 关闭';

interface KeyLike extends Event {
  readonly code: string;
  readonly repeat?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}

interface MouseLike extends Event {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
}

interface WheelLike extends MouseLike {
  readonly deltaY: number;
}

function isEditable(target: EventTarget | null): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!t) return false;
  const tag = typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

function setStyle(node: HTMLElement, css: Record<string, string>): void {
  Object.assign(node.style, css);
}

function context2d(canvas: HTMLCanvasElement, what: string): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`minimap: 2d context unavailable for ${what}`);
  return ctx;
}

/** 鹈鹕标记：白身体 + 橙色喙指向朝向。 */
function drawPelican(ctx: CanvasRenderingContext2D, x: number, y: number, facing: 1 | -1, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#141820';
  ctx.fillStyle = '#f6f1e4';
  ctx.beginPath();
  ctx.ellipse(-size * 0.1, size * 0.15, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size * 0.45, -size * 0.4, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2a03a';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(size * 0.62, -size * 0.55);
  ctx.lineTo(size * 1.5, -size * 0.3);
  ctx.lineTo(size * 0.62, -size * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawDummy(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = '#e0584a';
  ctx.strokeStyle = '#141820';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** 小窗：圆角容器 + 画布 + “M 地图”角标，挂到 parent。 */
function buildMiniWindow(parent: HTMLElement, cssW: number, cssH: number): { mini: HTMLDivElement; miniCanvas: HTMLCanvasElement; label: HTMLDivElement } {
  const mini = document.createElement('div');
  mini.className = 'minimap';
  setStyle(mini, {
    position: 'fixed', top: '12px', right: '12px', width: `${cssW}px`, height: `${cssH}px`, borderRadius: '4px',
    overflow: 'hidden', border: '0', outline: '1px solid rgba(235, 225, 201, 0.5)', background: 'rgba(22, 24, 28, 0.65)',
    boxShadow: '0 3px 14px rgba(0, 0, 0, 0.25)', zIndex: '4', pointerEvents: 'auto', userSelect: 'none',
  });
  const miniCanvas = document.createElement('canvas');
  miniCanvas.className = 'minimap-canvas';
  setStyle(miniCanvas, { display: 'block', width: `${cssW}px`, height: `${cssH}px`, opacity: '0.92' });
  mini.append(miniCanvas);
  const label = document.createElement('div');
  label.className = 'minimap-label';
  label.textContent = 'M 地图';
  setStyle(label, {
    position: 'absolute', left: '6px', bottom: '3px', font: '10px/1.4 system-ui, sans-serif', color: 'rgba(243, 239, 228, 0.85)',
    textShadow: '0 0 2px #000', pointerEvents: 'none',
  });
  mini.append(label);
  parent.append(mini);
  return { mini, miniCanvas, label };
}

/** 大地图全屏遮罩（初始隐藏）：画布 + 顶部操作提示，挂到 parent。 */
function buildBigOverlay(parent: HTMLElement): { big: HTMLDivElement; bigCanvas: HTMLCanvasElement; bigHint: HTMLDivElement; close: HTMLButtonElement } {
  const big = document.createElement('div');
  big.className = 'minimap-big';
  big.hidden = true;
  setStyle(big, {
    position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', background: 'rgba(5, 8, 12, 0.72)', zIndex: '6',
    pointerEvents: 'auto', cursor: 'grab', userSelect: 'none', display: 'none',
  });
  const bigCanvas = document.createElement('canvas');
  bigCanvas.className = 'minimap-big-canvas';
  setStyle(bigCanvas, { display: 'block', width: '100%', height: '100%' });
  big.append(bigCanvas);
  const bigHint = document.createElement('div');
  bigHint.className = 'minimap-big-hint';
  bigHint.textContent = MAP_HINT;
  setStyle(bigHint, {
    position: 'absolute', left: '50%', top: '14px', transform: 'translateX(-50%)', padding: '4px 12px', borderRadius: '6px',
    background: 'rgba(12, 16, 22, 0.7)', color: '#f3efe4', font: '13px/1.6 system-ui, sans-serif', pointerEvents: 'none',
  });
  big.append(bigHint);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'minimap-close';
  setStyle(close, { position: 'absolute', top: '64px', right: '16px', minHeight: '44px', padding: '8px 18px', border: '1px solid #d5e4ca88', borderRadius: '8px', background: '#15372c', color: '#f4f4e8', cursor: 'pointer' });
  big.append(close);
  parent.append(big);
  return { big, bigCanvas, bigHint, close };
}

function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number, dpr: number): void {
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
}

/** 世界底图（离屏 canvas + 栅格）与世界尺寸（格）。 */
interface WorldLayer {
  readonly base: HTMLCanvasElement;
  readonly raster: MinimapRaster;
  readonly worldW: number;
  readonly worldH: number;
  readonly facilityChapter: FacilityChapterId | undefined;
}

/** 画一帧：底图（可选外部底色）+ 假人标记 + 鹈鹕标记。 */
function drawWorld(
  layer: WorldLayer,
  ctx: CanvasRenderingContext2D,
  rect: WorldRect,
  scale: number,
  w: number,
  h: number,
  dpr: number,
  frame: MinimapFrame,
  marker: number,
  outside: string | null,
): void {
  const { base, raster } = layer;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const blit = rasterBlit(rect, scale, layer.worldW, layer.worldH, raster.tilePx);
  if (outside !== null) {
    ctx.fillStyle = outside;
    ctx.fillRect(0, 0, w, h);
  }
  if (blit) {
    // 缩小时平滑（避免闪烁），放大时保持像素块。
    ctx.imageSmoothingEnabled = scale < raster.tilePx;
    ctx.drawImage(base, blit.sx, blit.sy, blit.sw, blit.sh, blit.dx, blit.dy, blit.dw, blit.dh);
  }
  if (layer.facilityChapter !== undefined) drawFacilityMapMarkers(ctx, layer.facilityChapter, rect, scale, marker === MARKER_SIZE_BIG);
  for (const d of frame.dummies ?? []) {
    const p = worldToView(rect, scale, d.x, d.y);
    if (p.x >= -marker && p.y >= -marker && p.x <= w + marker && p.y <= h + marker) drawDummy(ctx, p.x, p.y, marker);
  }
  const pl = worldToView(rect, scale, frame.player.x, frame.player.y);
  drawPelican(ctx, pl.x, pl.y, frame.player.facing, marker);
}

export function createMinimap(options: MinimapOptions): Minimap {
  const { parent, source, viewport, keyTarget } = options;
  if (!parent || !source || !viewport || !keyTarget) throw new Error('minimap: parent, source, viewport and keyTarget are required');
  for (const dimension of [options.width, options.height]) {
    if (dimension !== undefined && !(Number.isInteger(dimension) && dimension > 0)) {
      throw new Error(`minimap: width/height must be positive integers, got ${options.width}×${options.height}`);
    }
  }
  const initialViewport = viewport();
  let cssW = options.width ?? initialViewport.width * 0.18;
  let cssH = options.height ?? initialViewport.height * 0.18;
  const initialWidth = cssW;
  const scanInterval = options.fluidScanInterval ?? 0.5;
  if (!(Number.isFinite(scanInterval) && scanInterval > 0)) throw new Error(`minimap: fluidScanInterval must be > 0, got ${scanInterval}`);
  const chapter = options.facilityChapter;
  let zoom = clampZoom(options.zoom ?? (chapter === undefined ? cssW / 120 : Math.min((cssW - 18) / source.tiles.width, (cssH - 38) / source.tiles.height)));
  const pixelRatio = options.pixelRatio ?? (() => 1);
  const worldW = source.tiles.width;
  const worldH = source.tiles.height;
  // 离屏底图：ImageData 的 Uint32 视图直接作为栅格像素（零拷贝）。
  const base = document.createElement('canvas');
  const P = options.tilePx ?? MINIMAP_TILE_PX;
  base.width = worldW * P;
  base.height = worldH * P;
  const baseCtx = context2d(base, 'world raster');
  const image = baseCtx.createImageData(base.width, base.height);
  const raster = createMinimapRaster(source, { tilePx: P, pixels: new Uint32Array(image.data.buffer) });
  baseCtx.putImageData(image, 0, 0);
  if (chapter !== undefined) drawFacilityMapBase(baseCtx, source, chapter, P);
  const unsubscribe = source.tiles.onChange((tx, ty) => raster.markTile(tx, ty));
  // 小窗。
  const { mini, miniCanvas, label } = buildMiniWindow(parent, cssW, cssH);
  if (chapter !== undefined) {
    mini.className += ' minimap-facility';
    const title = document.createElement('div');
    title.textContent = `${FACILITY_SCENES[chapter].number} · ${getLanguage() === 'en' ? 'Scene map' : '场景地图'}`;
    setStyle(title, { position: 'absolute', top: '5px', left: '8px', font: '10px/1.4 system-ui, sans-serif', color: '#b6e4da', pointerEvents: 'none' });
    mini.append(title);
    label.textContent = getLanguage() === 'en' ? '◇ Gate   ◆ Exit   M Expand' : '◇ 门禁   ◆ 出口   M 展开';
  }
  const miniCtx = context2d(miniCanvas, 'minimap');
  // 大地图遮罩。
  const { big, bigCanvas, bigHint, close } = buildBigOverlay(parent);
  const bigCtx = context2d(bigCanvas, 'big map');
  let bigView: BigMapView | null = null;
  let drag: { x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  let teleportEnabled = false;
  let opacity = 100;
  let scanTimer = 0;
  let disposed = false;
  const limits = (): BigMapLimits => {
    const v = viewport();
    return { worldW, worldH, screenW: v.width, screenH: v.height };
  };
  const resetDrag = (): void => {
    drag = null;
    big.style.cursor = teleportEnabled ? 'crosshair' : 'grab';
  };
  const resetHint = (): void => {
    const en = getLanguage() === 'en';
    close.textContent = en ? 'Close map' : '关闭地图';
    const mapHint = en ? 'Map · Drag to pan · Scroll to zoom · M / Esc to close' : MAP_HINT;
    const teleportHint = en ? 'Click to teleport · Drag to pan · Scroll to zoom · M / Esc to close' : TELEPORT_HINT;
    bigHint.textContent = teleportEnabled ? teleportHint : chapter === undefined ? mapHint : `${en ? FACILITY_EN[chapter].name : FACILITY_SCENES[chapter].name} · ${en ? FACILITY_MAP_LEGEND_EN : FACILITY_MAP_LEGEND} · ${mapHint}`;
  };
  const unsubscribeLanguage = onLanguageChange(() => {
    label.textContent = chapter === undefined ? getLanguage() === 'en' ? 'M Map' : 'M 地图' : getLanguage() === 'en' ? '◇ Gate   ◆ Exit   M Expand' : '◇ 门禁   ◆ 出口   M 展开';
    if (chapter !== undefined) mini.querySelector<HTMLElement>('div:not(.minimap-label)')!.textContent = `${FACILITY_SCENES[chapter].number} · ${getLanguage() === 'en' ? 'Scene map' : '场景地图'}`;
    resetHint();
  });
  const setOpen = (open: boolean): void => {
    if (open === (bigView !== null)) return;
    if (open) {
      resetHint();
      resetDrag();
      bigView = bigMapFit(limits());
      big.hidden = false;
      big.style.display = 'block';
      mini.style.display = 'none';
    } else {
      bigView = null;
      resetDrag();
      big.hidden = true;
      big.style.display = 'none';
      mini.style.display = '';
    }
  };
  const listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions | undefined]> = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void => {
    const l = fn as unknown as EventListener;
    t.addEventListener(type, l, opts);
    listeners.push([t, type, l, opts]);
  };
  on<Event>(close, 'click', () => setOpen(false));
  on<KeyLike>(close, 'keydown', (event) => { if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation(); });
  on<KeyLike>(keyTarget, 'keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return;
    if (options.toggleKey !== undefined && e.code === options.toggleKey) {
      setOpen(bigView === null);
      e.preventDefault();
    } else if (e.code === 'Escape' && bigView !== null) {
      setOpen(false);
      e.preventDefault();
    } else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
      const dir = e.code === 'Equal' || e.code === 'NumpadAdd' ? 1 : -1;
      if (bigView !== null) {
        resetDrag();
        const l = limits();
        bigView = zoomBigMapAt(bigView, MINIMAP_ZOOM_STEP ** dir, l.screenW / 2, l.screenH / 2, l);
      } else {
        zoom = stepZoom(zoom, dir);
      }
      e.preventDefault();
    }
  });
  on<WheelLike>(mini, 'wheel', (e) => {
    e.preventDefault();
    if (e.deltaY !== 0) zoom = stepZoom(zoom, -Math.sign(e.deltaY));
  }, { passive: false });
  on<WheelLike>(big, 'wheel', (e) => {
    e.preventDefault();
    if (bigView === null || e.deltaY === 0) return;
    resetDrag();
    bigView = zoomBigMapAt(bigView, MINIMAP_ZOOM_STEP ** -Math.sign(e.deltaY), e.clientX, e.clientY, limits());
  }, { passive: false });
  on<MouseLike>(big, 'mousedown', (e) => {
    if (e.button !== 0) {
      resetDrag();
      return;
    }
    if (bigView === null) return;
    e.preventDefault();
    resetHint();
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    big.style.cursor = teleportEnabled ? 'crosshair' : 'grabbing';
  });
  on<MouseLike>(keyTarget, 'mousemove', (e) => {
    if (drag === null || bigView === null) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return;
      drag.moved = true;
    }
    big.style.cursor = 'grabbing';
    bigView = panBigMap(bigView, e.clientX - drag.x, e.clientY - drag.y, limits());
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  on<MouseLike>(keyTarget, 'mouseup', (e) => {
    const gesture = drag;
    resetDrag();
    if (e.button !== 0 || gesture === null || gesture.moved || !teleportEnabled || bigView === null) return;
    if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) >= 5) return;
    const l = limits();
    if (e.clientX < 0 || e.clientY < 0 || e.clientX >= l.screenW || e.clientY >= l.screenH) return;
    const point = viewToWorld(bigMapRect(bigView, l), bigView.scale, e.clientX, e.clientY);
    if (point.x < 0 || point.y < 0 || point.x >= worldW || point.y >= worldH) return;
    if (options.onTeleport!(point)) setOpen(false);
    else bigHint.textContent = getLanguage() === 'en' ? 'No room for the player near this point. Try another location · Drag to pan · Scroll to zoom · M / Esc to close' : '该位置附近没有可容纳角色的空间，请点击其它位置 · 拖动平移 · 滚轮缩放 · M / Esc 关闭';
  });
  on(keyTarget, 'blur', resetDrag);
  const layer: WorldLayer = { base, raster, worldW, worldH, facilityChapter: chapter };
  return {
    update(frame) {
      if (disposed) throw new Error('minimap: update after dispose');
      if (!(Number.isFinite(frame.dt) && frame.dt >= 0)) throw new Error(`minimap: frame dt must be >= 0, got ${frame.dt}`);
      scanTimer += frame.dt;
      if (scanTimer >= scanInterval) {
        scanTimer = 0;
        raster.scanFluid();
      }
      if (raster.dirtyCount > 0) {
        for (const r of raster.flush()) baseCtx.putImageData(image, 0, 0, r.x, r.y, r.w, r.h);
        if (chapter !== undefined) drawFacilityMapBase(baseCtx, source, chapter, P);
      }
      const dpr = pixelRatio();
      if (bigView !== null) {
        const l = limits();
        fitCanvas(bigCanvas, l.screenW, l.screenH, dpr);
        drawWorld(layer, bigCtx, bigMapRect(bigView, l), bigView.scale, l.screenW, l.screenH, dpr, frame, MARKER_SIZE_BIG, null);
      } else if (!mini.hidden) {
        const v = viewport();
        const nextW = options.width ?? v.width * 0.18;
        const nextH = options.height ?? v.height * 0.18;
        if (nextW !== cssW || nextH !== cssH) {
          cssW = nextW;
          cssH = nextH;
          for (const node of [mini, miniCanvas]) setStyle(node, { width: `${cssW}px`, height: `${cssH}px` });
        }
        fitCanvas(miniCanvas, cssW, cssH, dpr);
        const scale = zoom * cssW / initialWidth * Math.max(1, 120 / worldW);
        const rect = followView({ centerX: frame.player.x, centerY: frame.player.y, viewW: cssW, viewH: cssH, scale, worldW, worldH });
        drawWorld(layer, miniCtx, rect, scale, cssW, cssH, dpr, frame, MARKER_SIZE_MINI, OUTSIDE);
      }
    },
    get visible() { return !mini.hidden; },
    setVisible(visible) { mini.hidden = !visible; },
    get opacity() { return opacity; },
    setOpacity(value) {
      opacity = value;
      mini.style.opacity = String(value / 100);
    },
    toggleBigMap(open) {
      setOpen(open ?? bigView === null);
    },
    get bigMapOpen() {
      return bigView !== null;
    },
    get teleportEnabled() {
      return teleportEnabled;
    },
    setTeleportEnabled(on) {
      if (on && options.onTeleport === undefined) throw new Error('minimap: onTeleport is required to enable map teleport');
      teleportEnabled = on;
      resetDrag();
      resetHint();
    },
    get zoom() {
      return zoom;
    },
    setZoom(z) {
      if (!(Number.isFinite(z) && z >= MINIMAP_ZOOM_MIN && z <= MINIMAP_ZOOM_MAX)) {
        throw new Error(`minimap: zoom must be in [${MINIMAP_ZOOM_MIN},${MINIMAP_ZOOM_MAX}], got ${z}`);
      }
      zoom = z;
    },
    get bigMapView() {
      return bigView;
    },
    raster,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      unsubscribeLanguage();
      for (const [t, type, l, opts] of listeners) t.removeEventListener(type, l, opts);
      listeners.length = 0;
      mini.remove();
      big.remove();
    },
  };
}
