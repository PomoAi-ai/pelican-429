import { t } from '../../config/i18n.ts';
import { definitionColliderSection, type DefinitionCollision } from '../../physics/definition-collision.ts';
import { bigMapFit, bigMapFitScale, bigMapRect, clampBigMap, followView, panBigMap, rasterBlit, worldToView, zoomBigMapAt,
  type BigMapView } from '../../ui/model/minimap-model.ts';

interface WorldRect { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

const TILE_PX = 4;
// 玩家站立需要的净高；落点上方被实体占住时换下一个落脚面。
const CLEARANCE = 1.7;

function drawCollisionMap(canvas: HTMLCanvasElement, collision: DefinitionCollision, world: WorldRect): void {
  const context = canvas.getContext('2d')!;
  const toPixel = (x: number, y: number): [number, number] => [(x - world.minX) * TILE_PX, (world.maxY - y) * TILE_PX];
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#9fb3a8';
  for (const solid of collision.solids) {
    context.beginPath();
    for (const [x, y] of solid.points) context.lineTo(...toPixel(x, y));
    context.closePath(); context.fill();
  }
  context.fillStyle = '#d09c52';
  for (const platform of collision.platforms) {
    const [x, y] = toPixel(platform.left, platform.top);
    context.fillRect(x, y, (platform.right - platform.left) * TILE_PX, 2);
  }
}

/** 大场景小地图：按碰撞体画出地形，点击传送到所点位置下方最近的可站立面。 */
export function createPerspectiveMinimap(host: HTMLElement, collision: DefinitionCollision, world: WorldRect,
  onTeleport: (x: number, y: number) => void) {
  const width = world.maxX - world.minX;
  const height = world.maxY - world.minY;
  const root = document.createElement('div');
  root.className = 'room-preview-minimap hud-map';
  root.title = t('点击小地图传送');
  // 标记与点击按画布区域换算，不受外框顶栏留白影响。
  const view = document.createElement('div');
  Object.assign(view.style, { position: 'relative', aspectRatio: `${width} / ${height}` });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * TILE_PX);
  canvas.height = Math.ceil(height * TILE_PX);
  const marker = document.createElement('i');
  view.append(canvas, marker);
  root.append(view);
  host.append(root);

  drawCollisionMap(canvas, collision, world);

  const landing = (x: number, y: number): number => {
    const spans = collision.solids.map(solid => definitionColliderSection(solid, 0, x - .3, x + .3))
      .filter((span): span is [number, number] => span !== null);
    const tops = [...spans.map(([, top]) => top), ...collision.platforms.filter(p => p.left <= x && x <= p.right).map(p => p.top)];
    const free = tops.filter(top => top <= y + .5 && !spans.some(([low, high]) => low < top + CLEARANCE && high > top + .05));
    // 所点一列没有落脚面时照常传送，角色下落后由游玩逻辑送回当前分区。
    return free.length > 0 ? Math.max(...free) : y;
  };
  const onClick = (event: MouseEvent): void => {
    const rect = view.getBoundingClientRect();
    const x = world.minX + (event.clientX - rect.left) / rect.width * width;
    const y = world.maxY - (event.clientY - rect.top) / rect.height * height;
    onTeleport(x, landing(x, y));
  };
  view.addEventListener('click', onClick);
  let markerLeft = '', markerTop = '';

  return {
    root,
    update(x: number, y: number): void {
      // 每帧调用：位置没变不写样式。
      const left = `${((x - world.minX) / width * 100).toFixed(2)}%`;
      const top = `${((world.maxY - y) / height * 100).toFixed(2)}%`;
      if (left === markerLeft && top === markerTop) return;
      markerLeft = left; markerTop = top;
      marker.style.left = left;
      marker.style.top = top;
    },
    dispose(): void {
      view.removeEventListener('click', onClick);
      root.remove();
    },
  };
}

/** 自由搭建世界没有 TileMap；沿用透视地图的真实碰撞轮廓及正式地图的坐标变换。 */
export function createPlayableDefinitionMinimap(host: HTMLElement, collision: DefinitionCollision, world: WorldRect) {
  const events = new AbortController();
  const width = world.maxX - world.minX;
  const height = world.maxY - world.minY;
  const base = document.createElement('canvas');
  base.width = Math.ceil(width * TILE_PX); base.height = Math.ceil(height * TILE_PX);
  const root = document.createElement('div');
  root.className = 'scene-definition-map hud-map';
  Object.assign(root.style, { position: 'absolute', top: '12px', right: '12px', width: 'min(280px, 38%)', height: '140px',
    overflow: 'hidden', zIndex: '4', pointerEvents: 'auto' });
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
  const label = document.createElement('span');
  Object.assign(label.style, { position: 'absolute', left: '8px', bottom: '6px', color: '#e8f2df', font: '11px system-ui', pointerEvents: 'none' });
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = t('关闭地图'); close.hidden = true;
  Object.assign(close.style, { position: 'absolute', right: '12px', top: '12px', padding: '8px', color: '#e8f2df', background: '#15252d', border: '1px solid #d5e4ca88', borderRadius: '6px' });
  const fit = close.cloneNode(false) as HTMLButtonElement;
  fit.textContent = t('全图'); fit.style.right = '104px';
  root.append(canvas, label, fit, close); host.append(root);
  const ctx = canvas.getContext('2d')!;
  let bigView: BigMapView | null = null;
  let drag: { x: number; y: number } | null = null;
  let position = { x: world.minX, y: world.minY };
  const limits = () => ({ worldW: width, worldH: height, screenW: host.clientWidth, screenH: host.clientHeight });
  // 尺寸由 ResizeObserver 缓存，重画时不读布局。
  let size = { width: canvas.clientWidth, height: canvas.clientHeight };
  const redraw = (): void => {
    const w = size.width; const h = size.height;
    const dpr = Math.min(2, window.devicePixelRatio);
    const pixelW = Math.round(w * dpr); const pixelH = Math.round(h * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) { canvas.width = pixelW; canvas.height = pixelH; }
    const scale = bigView ? bigView.scale : w / Math.min(80, width);
    const rect = bigView ? bigMapRect(bigView, { worldW: width, worldH: height, screenW: w, screenH: h })
      : followView({ centerX: position.x - world.minX, centerY: position.y - world.minY, viewW: w, viewH: h, scale, worldW: width, worldH: height });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const blit = rasterBlit(rect, scale, width, height, TILE_PX);
    if (blit) ctx.drawImage(base, blit.sx, blit.sy, blit.sw, blit.sh, blit.dx, blit.dy, blit.dw, blit.dh);
    const marker = worldToView(rect, scale, position.x - world.minX, position.y - world.minY);
    ctx.fillStyle = '#ff866a'; ctx.strokeStyle = '#10191e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(marker.x, marker.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const text = `${t(bigView ? '拖动平移 · 滚轮缩放 · M / Esc 关闭' : 'M 地图')} · ${position.x.toFixed(1)}, ${position.y.toFixed(1)}`;
    if (label.textContent !== text) label.textContent = text;
  };
  const resize = new ResizeObserver(([entry]) => { size = entry!.contentRect; redraw(); });
  resize.observe(canvas);
  const setOpen = (open: boolean): void => {
    const mapLimits = limits();
    bigView = open ? clampBigMap({ centerX: position.x - world.minX, centerY: position.y - world.minY,
      scale: Math.max(bigMapFitScale(mapLimits), 4) }, mapLimits) : null;
    drag = null;
    root.classList.toggle('is-open', open);
    Object.assign(root.style, { inset: open ? '0' : '12px 12px auto auto', width: open ? 'auto' : 'min(280px, 38%)',
      height: open ? 'auto' : '140px', zIndex: open ? '6' : '4', cursor: open ? 'grab' : 'pointer' });
    close.hidden = !open; fit.hidden = !open; redraw();
  };
  fit.addEventListener('click', () => { bigView = bigMapFit(limits()); drag = null; redraw(); }, { signal: events.signal });
  close.addEventListener('click', () => setOpen(false), { signal: events.signal });
  canvas.addEventListener('click', () => { if (!bigView) setOpen(true); }, { signal: events.signal });
  canvas.addEventListener('pointerdown', event => {
    if (!bigView || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', event => {
    if (!drag || !bigView) return;
    bigView = panBigMap(bigView, event.clientX - drag.x, event.clientY - drag.y, limits());
    drag = { x: event.clientX, y: event.clientY }; redraw();
  }, { signal: events.signal });
  canvas.addEventListener('pointerup', () => { drag = null; }, { signal: events.signal });
  canvas.addEventListener('pointercancel', () => { drag = null; }, { signal: events.signal });
  canvas.addEventListener('wheel', event => {
    if (!bigView) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    bigView = zoomBigMapAt(bigView, 1.25 ** -Math.sign(event.deltaY), event.clientX - rect.left, event.clientY - rect.top, limits()); redraw();
  }, { passive: false, signal: events.signal });
  drawCollisionMap(base, collision, world);
  return {
    root,
    get bigMapOpen(): boolean { return bigView !== null; },
    toggleBigMap(open?: boolean): void { setOpen(open ?? bigView === null); },
    update(x: number, y: number): void {
      // 每帧调用：玩家没动就不重画整张地图。
      if (x === position.x && y === position.y) return;
      position = { x, y }; redraw();
    },
    refresh(): void { drawCollisionMap(base, collision, world); redraw(); },
    dispose(): void { events.abort(); resize.disconnect(); root.remove(); },
  };
}
