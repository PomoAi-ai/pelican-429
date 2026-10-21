import * as THREE from 'three';
import { TUNING } from '../../config/tuning.ts';
import { loadCharacterModel } from '../../render/character/character-model.ts';
import { disposeModelResources } from '../../render/character/model-resources.ts';
import { createD1HairGameStage } from '../../render/grassy/d1-hair-game-stage.ts';
import { createD1Rig, disposeD1Asset, loadD1Asset } from '../../render/grassy/d1-rig.ts';
import { applyD1LabLooks, D1_LAB_VERSIONS, type D1LabVersion } from '../../render/grassy/d1-lab-looks.ts';
import { contourD1LabHair } from '../../render/grassy/d1-lab-hair-contour.ts';
import { HAIR_ASSETS, HAIR_LABELS, hairTitle, isBlenderHair, type HairStyle } from './d1-lab-hair-catalog.ts';
import type { PageContext } from '../shell/page-context.ts';
import { pageRenderer } from '../shell/page-renderer.ts';
import { createStudioLights } from '../../render/stage/light-presets.ts';
import '../../ui/lab/d1-hair-gallery.css';

const TEMPLATE = `
<header class="hair-header">
  <div><p>PELICAN 429 / HAIR COLLECTION</p><h1>全部头发预览</h1></div>
</header>
<nav class="hair-toolbar" aria-label="预览设置">
  <div class="hair-control"><span>统一渲染</span><div id="hair-looks" class="hair-buttons" role="group" aria-label="渲染风格"></div></div>
  <div class="hair-control"><span>光照环境</span><div id="hair-environments" class="hair-buttons" role="group" aria-label="光照环境">
    <button type="button" data-environment="game" aria-pressed="true">游戏日光 · 展示场同款</button>
    <button type="button" data-environment="studio" aria-pressed="false">检查棚光</button>
  </div></div>
  <div class="hair-control"><span>统一视角</span><div id="hair-angles" class="hair-buttons" role="group" aria-label="查看角度">
    <button type="button" data-angle="0" aria-pressed="true">正面</button>
    <button type="button" data-angle="45" aria-pressed="false">45°</button>
    <button type="button" data-angle="90" aria-pressed="false">侧面</button>
    <button type="button" data-angle="180" aria-pressed="false">背面</button>
  </div></div>
  <p id="hair-status" role="status">正在读取头发目录…</p>
</nav>
<main id="hair-gallery" class="hair-grid" aria-label="全部头发"></main>
`;

type Model = {
  scene: THREE.Scene;
  rig: ReturnType<typeof createD1Rig>;
  look: ReturnType<typeof applyD1LabLooks>;
  fit: ReturnType<typeof contourD1LabHair> | null;
  lights: ReturnType<typeof createStudioLights>;
  used: number;
};
type Card = {
  hair: HairStyle;
  element: HTMLElement;
  viewport: HTMLElement;
  snapshot: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  loading: HTMLElement;
  path: string;
  variant: 'game' | 'outfit' | 'detailed';
  model: Model | null;
  error: boolean;
};

// 页面元素在挂载时由模板生成后取得。
let gallery: HTMLElement;
let lookControls: HTMLElement;
let environmentControls: HTMLElement;
let angleControls: HTMLElement;
let status: HTMLElement;
let toolbar: HTMLElement;
let environment: 'game' | 'studio' = 'game';
let gameStage: ReturnType<typeof createD1HairGameStage>;
const versions = D1_LAB_VERSIONS;
const cards: Card[] = [];
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 80);
const target = new THREE.Vector3(0, 2.64, 0);
let version: D1LabVersion = 'v2';
let theta = 0;
let phi = Math.PI / 2;
let zoom = 1;
let frame = 0;
let saving = 0;
let loadingCard: Card | null = null;
let closed = false;
let sequence = 0;
let renderer: THREE.WebGLRenderer;
let visible: Card[] = [];
let sphericalEyeAsset: THREE.Object3D | undefined;
const SPHERICAL_EYE_CARDS: readonly HairStyle[] = ['blender-scalp-flow', 'blender-shp-rooted', 'blender-haircurves'];

function previewUrl(hair: HairStyle): string {
  const url = new URL('./', location.href);
  url.search = new URLSearchParams({ mode: 'render-lab', hair, version, framing: 'head', angle: String(theta * 180 / Math.PI), projection: 'orthographic' }).toString();
  return url.href;
}

function updateLinks(): void {
  for (const card of cards) card.element.querySelector<HTMLAnchorElement>('a')!.href = previewUrl(card.hair);
}

function invalidateSnapshots(): void {
  for (const card of cards) {
    card.snapshot.hidden = true;
    if (!card.model) card.loading.hidden = false;
  }
}

function updateCamera(aspect: number): void {
  const height = Math.max(1.5, 1.5 / aspect);
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.zoom = zoom;
  camera.position.set(-4 * Math.sin(phi) * Math.sin(theta), target.y + 4 * Math.cos(phi), 4 * Math.sin(phi) * Math.cos(theta));
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

function findVisible(): Card[] {
  const top = toolbar.getBoundingClientRect().bottom;
  return cards.filter(card => {
    const rect = card.viewport.getBoundingClientRect();
    return rect.bottom > top && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  });
}

function render(save: boolean): void {
  frame = 0;
  if (closed) return;
  visible = findVisible();
  renderer.setScissorTest(false);
  renderer.setClearColor(0, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  const toolbarBottom = Math.max(0, toolbar.getBoundingClientRect().bottom);
  for (const card of visible) {
    const model = card.model;
    if (!model) continue;
    model.used = ++sequence;
    if (environment === 'game' && !card.snapshot.hidden) continue;
    const rect = card.viewport.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(innerWidth, rect.right);
    const top = Math.max(toolbarBottom, rect.top);
    const bottom = Math.min(innerHeight, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) continue;
    updateCamera(rect.width / rect.height);
    renderer.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    renderer.setScissor(left, innerHeight - bottom, width, height);
    renderer.shadowMap.needsUpdate = model.lights.key.shadow.needsUpdate;
    if (environment === 'game') {
      gameStage.render(model.rig.root, camera, target, rect, new DOMRect(left, top, width, height));
    } else {
      renderer.toneMappingExposure = 1;
      renderer.render(model.scene, camera);
    }
    if ((save || card.snapshot.hidden) && left === rect.left && right === rect.right && top === rect.top && bottom === rect.bottom) {
      const ratio = renderer.getPixelRatio();
      const snapshotWidth = Math.round(rect.width * ratio);
      const snapshotHeight = Math.round(rect.height * ratio);
      if (card.snapshot.width !== snapshotWidth || card.snapshot.height !== snapshotHeight) {
        card.snapshot.width = snapshotWidth;
        card.snapshot.height = snapshotHeight;
      }
      // 只保留完整卡片，避免滚动裁片或不同角度拼成不完整快照。
      card.context.drawImage(renderer.domElement, left * ratio, top * ratio, width * ratio, height * ratio, 0, 0, snapshotWidth, snapshotHeight);
      card.snapshot.hidden = false;
    }
    card.loading.hidden = true;
  }
  renderer.setScissorTest(false);
  evict();
  void loadNext();
}

function requestRender(): void {
  if (!frame && !closed) frame = requestAnimationFrame(() => render(false));
  clearTimeout(saving);
  saving = window.setTimeout(() => render(true), 180);
}

function release(card: Card): void {
  const model = card.model!;
  model.look.dispose();
  model.fit?.dispose();
  model.rig.dispose();
  model.lights.dispose();
  model.scene.clear();
  card.model = null;
  card.loading.hidden = !card.snapshot.hidden;
  if (!(loadingCard && loadingCard !== card && loadingCard.path === card.path && loadingCard.variant === card.variant)
    && !cards.some(other => other.model && other.path === card.path && other.variant === card.variant)) {
    disposeD1Asset(card.variant, 'web-1k', card.path);
  }
}

function evict(): void {
  const loaded = cards.filter(card => card.model);
  const candidates = loaded.filter(card => !visible.includes(card)).sort((a, b) => a.model!.used - b.model!.used);
  for (const card of candidates.slice(0, Math.max(0, loaded.length - Math.max(12, visible.length)))) release(card);
}

function createModel(card: Card): Model {
  const family = isBlenderHair(card.hair) ? 'blender' : 'rodin';
  const rig = createD1Rig(card.variant, 'anime', 'web-1k', SPHERICAL_EYE_CARDS.includes(card.hair) ? sphericalEyeAsset : undefined, card.path);
  let fit: Model['fit'] = null;
  let look: Model['look'] | null = null;
  try {
    if (card.hair === 'rodin-contour') fit = contourD1LabHair(rig.root);
    look = applyD1LabLooks(rig.root, card.hair === 'showcase' || card.hair === 'game-detailed' ? 'showcase' : family);
    look.setVersion(version);
    look.setHairMotion(false);
    look.setClosure(0);
    rig.setEyeClosure(0);
    rig.actions.idle.play();
    rig.update(0);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e4dfd6');
    // 每张卡片一套灯，阴影图只在换风格、换环境时重画。
    const lights = createStudioLights(1024);
    lights.key.shadow.autoUpdate = false;
    lights.key.shadow.needsUpdate = true;
    scene.add(rig.root, ...lights.objects);
    return { scene, rig, look, fit, lights, used: ++sequence };
  } catch (error) {
    look?.dispose();
    fit?.dispose();
    rig.dispose();
    throw error;
  }
}

async function loadNext(): Promise<void> {
  if (loadingCard || closed) return;
  const card = visible.find(candidate => !candidate.model && !candidate.error);
  if (!card) return;
  loadingCard = card;
  card.loading.textContent = '正在加载模型…';
  try {
    // 大模型按队列解码，避免多份 GLB 同时解析阻塞页面。
    await loadD1Asset(card.variant, 'web-1k', card.path);
    if (closed) {
      disposeD1Asset(card.variant, 'web-1k', card.path);
      return;
    }
    if (SPHERICAL_EYE_CARDS.includes(card.hair) && !sphericalEyeAsset) {
      const loaded = await loadCharacterModel('./characters/human/render-lab/d1-spherical-eyes-v3.glb', 'original');
      if (closed) { disposeModelResources(loaded.scene); return; }
      sphericalEyeAsset = loaded.scene;
    }
    card.model = createModel(card);
    updateCamera(card.viewport.clientWidth / card.viewport.clientHeight);
    if (environment === 'game') await gameStage.compile(card.model.rig.root);
    else await renderer.compileAsync(card.model.scene, camera);
  } catch (error) {
    card.error = true;
    card.loading.hidden = false;
    card.loading.classList.add('hair-error');
    card.loading.textContent = `模型加载失败：${error instanceof Error ? error.message : String(error)}`;
    if (card.model) release(card);
    else if (!cards.some(other => other.model && other.path === card.path)) disposeD1Asset(card.variant, 'web-1k', card.path);
  } finally {
    loadingCard = null;
    if (!cards.some(other => other.model && other.path === card.path && other.variant === card.variant)) {
      disposeD1Asset(card.variant, 'web-1k', card.path);
    }
    requestRender();
  }
}

function bindInteraction(): void {
  let drag: { pointer: number; x: number; y: number; height: number } | null = null;
  gallery.addEventListener('pointerdown', event => {
    const viewport = (event.target as HTMLElement).closest<HTMLElement>('.hair-viewport');
    if (!viewport || event.button !== 0) return;
    event.preventDefault();
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, height: viewport.clientHeight };
    gallery.setPointerCapture(event.pointerId);
  });
  gallery.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    theta += (event.clientX - drag.x) / drag.height * Math.PI * 2;
    phi = THREE.MathUtils.clamp(phi - (event.clientY - drag.y) / drag.height * Math.PI * 2, .15, Math.PI - .15);
    drag.x = event.clientX;
    drag.y = event.clientY;
    invalidateSnapshots();
    for (const button of angleControls.querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
    requestRender();
  });
  const endDrag = (): void => {
    drag = null;
    updateLinks();
    requestRender();
  };
  gallery.addEventListener('pointerup', endDrag);
  gallery.addEventListener('pointercancel', endDrag);
  gallery.addEventListener('wheel', event => {
    if (!event.ctrlKey || !(event.target as HTMLElement).closest('.hair-viewport')) return;
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * Math.exp(-event.deltaY * .002), .4, 4);
    invalidateSnapshots();
    requestRender();
  }, { passive: false });
  gallery.addEventListener('keydown', event => {
    if (!(event.target as HTMLElement).classList.contains('hair-viewport')) return;
    if (event.key === 'ArrowLeft') theta -= Math.PI / 12;
    else if (event.key === 'ArrowRight') theta += Math.PI / 12;
    else if (event.key === 'ArrowUp') phi = Math.max(.15, phi - Math.PI / 12);
    else if (event.key === 'ArrowDown') phi = Math.min(Math.PI - .15, phi + Math.PI / 12);
    else if (event.key === '+' || event.key === '=') zoom = Math.min(4, zoom * 1.1);
    else if (event.key === '-') zoom = Math.max(.4, zoom / 1.1);
    else return;
    event.preventDefault();
    updateLinks();
    invalidateSnapshots();
    requestRender();
  });
}

function addCard(hair: HairStyle): void {
  const element = document.createElement('article');
  element.className = 'hair-card';
  element.dataset.hair = hair;
  const heading = document.createElement('h2');
  heading.textContent = hairTitle(hair);
  const viewport = document.createElement('div');
  viewport.className = 'hair-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', `${HAIR_LABELS[hair]}：拖动同步旋转，Ctrl 加滚轮缩放，方向键旋转`);
  const snapshot = document.createElement('canvas');
  snapshot.className = 'hair-snapshot';
  snapshot.hidden = true;
  const context = snapshot.getContext('2d');
  if (!context) throw new Error('浏览器无法创建头发预览快照画布');
  const loadingMessage = document.createElement('p');
  loadingMessage.className = 'hair-loading';
  loadingMessage.textContent = '等待加载…';
  viewport.append(snapshot, loadingMessage);
  const link = document.createElement('a');
  link.href = previewUrl(hair);
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = '单独打开 ↗';
  element.append(heading, viewport, link);
  const path = HAIR_ASSETS[hair];
  cards.push({ hair, element, viewport, snapshot, context, loading: loadingMessage, path, variant: hair === 'showcase' ? 'game' : hair === 'game-detailed' ? 'detailed' : 'outfit', model: null, error: false });
  gallery.append(element);
}

export function mountD1HairGallery(ctx: PageContext): void {
  document.getElementById('loading')!.hidden = true;
  document.title = 'D1 · 全部头发预览';
  ctx.root.innerHTML = TEMPLATE;
  gallery = document.querySelector<HTMLElement>('#hair-gallery')!;
  lookControls = document.querySelector<HTMLElement>('#hair-looks')!;
  environmentControls = document.querySelector<HTMLElement>('#hair-environments')!;
  angleControls = document.querySelector<HTMLElement>('#hair-angles')!;
  status = document.querySelector<HTMLElement>('#hair-status')!;
  toolbar = document.querySelector<HTMLElement>('.hair-toolbar')!;
  const params = new URLSearchParams(location.search);
  const requestedVersion = params.get('version') ?? 'v2';
  const requestedEnvironment = params.get('environment') ?? 'game';
  const selected = versions.find(candidate => candidate.id === requestedVersion);
  if (!selected) throw new Error(`未知渲染风格：${requestedVersion}`);
  version = selected.id;
  if (requestedEnvironment !== 'game' && requestedEnvironment !== 'studio') throw new Error(`未知光照环境：${requestedEnvironment}`);
  environment = requestedEnvironment;
  renderer = pageRenderer(ctx, 'studio', TUNING);
  renderer.setPixelRatio(environment === 'game' ? Math.min(devicePixelRatio, TUNING.render.lighting.maxPixelRatio) : 1);
  renderer.setClearColor(0, 0);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'hair-renderer';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  ctx.root.append(renderer.domElement);
  gameStage = createD1HairGameStage(renderer);
  for (const hair of Object.keys(HAIR_LABELS) as HairStyle[]) addCard(hair);
  for (const look of versions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = look.label;
    button.title = look.description;
    button.setAttribute('aria-pressed', String(look.id === version));
    button.addEventListener('click', () => {
      version = look.id;
      for (const sibling of lookControls.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === button));
      for (const card of cards) if (card.model) {
        card.model.look.setVersion(version);
        card.model.lights.key.shadow.needsUpdate = true;
      }
      invalidateSnapshots();
      const url = new URL(location.href);
      url.searchParams.set('version', version);
      history.replaceState(null, '', url);
      updateLinks();
      requestRender();
    });
    lookControls.append(button);
  }
  for (const button of environmentControls.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.environment === environment));
    button.addEventListener('click', () => {
      environment = button.dataset.environment === 'game' ? 'game' : 'studio';
      for (const sibling of environmentControls.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === button));
      renderer.setPixelRatio(environment === 'game' ? Math.min(devicePixelRatio, TUNING.render.lighting.maxPixelRatio) : 1);
      renderer.setSize(innerWidth, innerHeight);
      for (const card of cards) if (card.model) card.model.lights.key.shadow.needsUpdate = true;
      invalidateSnapshots();
      const url = new URL(location.href);
      url.searchParams.set('environment', environment);
      history.replaceState(null, '', url);
      requestRender();
    });
  }
  for (const button of angleControls.querySelectorAll<HTMLButtonElement>('button')) {
    button.addEventListener('click', () => {
      theta = Number(button.dataset.angle) * Math.PI / 180;
      phi = Math.PI / 2;
      zoom = 1;
      invalidateSnapshots();
      for (const sibling of angleControls.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === button));
      updateLinks();
      requestRender();
    });
  }
  bindInteraction();
  window.addEventListener('scroll', requestRender, { passive: true, signal: ctx.signal });
  window.addEventListener('resize', () => {
    renderer.setPixelRatio(environment === 'game' ? Math.min(devicePixelRatio, TUNING.render.lighting.maxPixelRatio) : 1);
    renderer.setSize(innerWidth, innerHeight);
    invalidateSnapshots();
    requestRender();
  }, { signal: ctx.signal });
  ctx.onDispose(() => {
    closed = true;
    cancelAnimationFrame(frame);
    clearTimeout(saving);
    for (const card of cards) if (card.model) release(card);
    if (sphericalEyeAsset) disposeModelResources(sphericalEyeAsset);
    gameStage.dispose();
    renderer.domElement.remove();
  });
  status.textContent = `共 ${cards.length} 款 · 拖动同步旋转 · Ctrl + 滚轮同步缩放 · 滚轮正常浏览 · 宽屏最多 5 列`;
  requestRender();
}

