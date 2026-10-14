import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { D1_ACTIONS, D1_ANIMATED_MODELS, type D1AnimatedVariant } from '../config/grassy.ts';
import { D1_ARTWORK } from '../config/showcase.ts';
import { createD1Rig, disposeD1Assets, loadD1Asset } from '../render/grassy/d1-rig.ts';
import { applyD1LabLooks, D1_LAB_VERSIONS, type D1LabVersion } from '../render/grassy/d1-lab-looks.ts';
import { createD1LabMotion } from '../render/grassy/d1-lab-motion.ts';
import { createD1LabGaits } from '../render/grassy/d1-lab-gait.ts';
import { fitD1LabHair } from '../render/grassy/d1-lab-hair-fit.ts';
import { contourD1LabHair } from '../render/grassy/d1-lab-hair-contour.ts';
import { characterModelPath } from '../render/character-model.ts';

type PreviewCard = { version: D1LabVersion; element: HTMLElement; button: HTMLButtonElement; viewport: HTMLElement };
type Projection = 'perspective' | 'orthographic';
type BlenderHairStyle = 'blender' | 'blender-bob' | 'blender-ear' | 'blender-crown' | 'blender-rooted' | 'blender-redrawn' | 'blender-swept' | 'blender-volumes' | 'blender-curves' | 'blender-flow' | 'blender-layered' | 'blender-fine' | 'blender-profile' | 'blender-scalp' | 'blender-plait' | 'blender-arc' | 'blender-clumps' | 'blender-rear' | 'blender-parting' | 'blender-inner' | 'blender-return' | 'blender-bob-fit' | 'blender-temple-root' | 'blender-eye-surface' | 'blender-smooth-color' | 'blender-native-flow';
type HairStyle = 'showcase' | 'classic' | 'rodin' | 'rodin-fit' | 'rodin-contour' | 'authored' | 'sculpted' | BlenderHairStyle;

const HAIR_ASSETS = {
  showcase: './characters/human/render-lab/d1-base-showcase.web-1k.glb',
  classic: './characters/human/render-lab/d1-outfit-baseline.web-1k.glb',
  rodin: './characters/human/render-lab/d1-outfit-rodin-hair.web-1k.glb',
  blender: './characters/human/render-lab/d1-outfit-blender-hair.glb',
  'blender-bob': './characters/human/render-lab/d1-outfit-blender-bob.glb',
  'blender-ear': './characters/human/render-lab/d1-outfit-blender-ear.glb',
  'blender-crown': './characters/human/render-lab/d1-outfit-blender-crown.glb',
  'blender-rooted': './characters/human/render-lab/d1-outfit-blender-rooted.glb',
  'blender-redrawn': './characters/human/render-lab/d1-outfit-blender-redrawn-v1.glb',
  'blender-swept': './characters/human/render-lab/d1-outfit-blender-swept-v1.glb',
  'blender-volumes': './characters/human/render-lab/d1-outfit-blender-volumes-v1.glb',
  'blender-curves': './characters/human/render-lab/d1-outfit-blender-curves-v1.glb',
  'blender-flow': './characters/human/render-lab/d1-outfit-blender-flow-v1.glb',
  'blender-layered': './characters/human/render-lab/d1-outfit-blender-layered-v1.glb',
  'blender-fine': './characters/human/render-lab/d1-outfit-blender-fine-v1.glb',
  'blender-profile': './characters/human/render-lab/d1-outfit-blender-profile-v1.glb',
  'blender-scalp': './characters/human/render-lab/d1-outfit-blender-scalp-v1.glb',
  'blender-plait': './characters/human/render-lab/d1-outfit-blender-plait-v1.glb',
  'blender-arc': './characters/human/render-lab/d1-outfit-blender-arc-v1.glb',
  'blender-clumps': './characters/human/render-lab/d1-outfit-blender-clumps-v1.glb',
  'blender-rear': './characters/human/render-lab/d1-outfit-blender-rear-v1.glb',
  'blender-parting': './characters/human/render-lab/d1-outfit-blender-parting-v1.glb',
  'blender-inner': './characters/human/render-lab/d1-outfit-blender-inner-v2.glb',
  'blender-return': './characters/human/render-lab/d1-outfit-blender-return-v1.glb',
  'blender-bob-fit': './characters/human/render-lab/d1-outfit-blender-bob-fit-v1.glb',
  'blender-temple-root': './characters/human/render-lab/d1-outfit-blender-temple-root-v1.glb',
  'blender-eye-surface': './characters/human/render-lab/d1-outfit-blender-eye-surface-v1.glb',
  'blender-smooth-color': './characters/human/render-lab/d1-outfit-blender-smooth-color-v1.glb',
  'blender-native-flow': './characters/human/render-lab/d1-outfit-blender-native-flow-v1.glb',
};

function isBlenderHair(value: string): value is BlenderHairStyle {
  return value === 'blender' || value === 'blender-bob' || value === 'blender-ear' || value === 'blender-crown' || value === 'blender-rooted' || value === 'blender-redrawn' || value === 'blender-swept' || value === 'blender-volumes' || value === 'blender-curves' || value === 'blender-flow' || value === 'blender-layered' || value === 'blender-fine' || value === 'blender-profile' || value === 'blender-scalp' || value === 'blender-plait' || value === 'blender-arc' || value === 'blender-clumps' || value === 'blender-rear' || value === 'blender-parting' || value === 'blender-inner' || value === 'blender-return' || value === 'blender-bob-fit' || value === 'blender-temple-root' || value === 'blender-eye-surface' || value === 'blender-smooth-color' || value === 'blender-native-flow';
}

function readHairStyle(value: string): HairStyle {
  if (value !== 'showcase' && value !== 'classic' && value !== 'rodin' && value !== 'rodin-fit' && value !== 'rodin-contour' && value !== 'authored' && value !== 'sculpted' && !isBlenderHair(value)) throw new Error(`未知头发版本：${value}`);
  return value;
}

function readVersion(value: string, cards: PreviewCard[]): D1LabVersion {
  const version = cards.find(candidate => candidate.version === value);
  if (!version) throw new Error(`未知渲染版本：${value}`);
  return version.version;
}

function createPreviewCards(includeShowcase: boolean): PreviewCard[] {
  const gallery = document.querySelector<HTMLElement>('#lab-gallery')!;
  gallery.replaceChildren();
  const versions = D1_LAB_VERSIONS.filter(version => includeShowcase || version.id !== 'showcase');
  gallery.setAttribute('aria-label', `${versions.length} 套渲染版本`);
  document.querySelector<HTMLButtonElement>('#lab-show-all')!.textContent = `← 返回全部 ${versions.length} 版`;
  return versions.map(version => {
    const element = document.createElement('article');
    element.className = 'lab-preview-card';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lab-card-title';
    button.textContent = version.label;
    button.title = version.description;
    button.setAttribute('aria-label', `放大 ${version.label}`);
    const viewport = document.createElement('div');
    viewport.className = 'lab-card-viewport';
    element.append(button, viewport);
    gallery.append(element);
    return { version: version.id, element, button, viewport };
  });
}

function createStudio(host: HTMLElement, cards: PreviewCard[], projection: Projection) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-label', 'D1 三维角色，可拖动旋转视角');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e4dfd6');
  scene.fog = new THREE.Fog('#e4dfd6', 16, 35);
  const camera = projection === 'perspective'
    ? new THREE.PerspectiveCamera(35, 1, .1, 80)
    : new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = .8;
  controls.maxDistance = 12;
  controls.minZoom = .4;
  controls.maxZoom = 4;
  controls.maxPolarAngle = Math.PI * (projection === 'orthographic' ? .5 : .49);

  const key = new THREE.DirectionalLight('#fff3e5', 3);
  key.target.position.set(0, 1.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 3;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 16 });
  key.shadow.normalBias = .025;
  key.shadow.bias = -.00008;
  const rim = new THREE.DirectionalLight('#e6eeff', .65);
  rim.position.set(3, 4, -4);
  const fill = new THREE.DirectionalLight('#fff1e6', 1.8);
  fill.position.set(-1, 3, 6);
  scene.add(key, key.target, rim, fill, new THREE.HemisphereLight('#e7ecf5', '#b7aaa0', 1.5));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#d4cdc1', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.012;
  ground.receiveShadow = true;
  scene.add(ground);

  let views: Array<{ version: D1LabVersion; x: number; y: number; width: number; height: number }> = [];
  let viewAspect = 1;
  let frameHeight = 4.3;
  let frameWidth = 2.1;
  const framingDistance = (aspect: number): number => camera instanceof THREE.PerspectiveCamera
    ? Math.max(frameHeight, frameWidth / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    : 4;
  const updateProjection = (aspect: number): void => {
    if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
    else {
      const height = Math.max(frameHeight, frameWidth / aspect);
      camera.left = -height * aspect / 2;
      camera.right = height * aspect / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
    }
    camera.updateProjectionMatrix();
  };
  const resizeViewport = (): void => {
    const hostRect = host.getBoundingClientRect();
    views = cards.filter(card => !card.element.hidden).map(card => {
      const rect = card.viewport.getBoundingClientRect();
      return { version: card.version, x: rect.left - hostRect.left, y: hostRect.bottom - rect.bottom, width: rect.width, height: rect.height };
    });
    const aspect = views[0]!.width / views[0]!.height;
    // 按视口比例调整取景，保留手动旋转、平移与缩放的相对位置。
    camera.position.sub(controls.target).multiplyScalar(framingDistance(aspect) / framingDistance(viewAspect)).add(controls.target);
    viewAspect = aspect;
    updateProjection(aspect);
    controls.rotateSpeed = host.clientHeight / views[0]!.height;
    renderer.setSize(host.clientWidth, host.clientHeight);
  };
  const resize = new ResizeObserver(resizeViewport);
  resize.observe(host);
  resizeViewport();
  const setLightAngle = (degrees: number): void => {
    const angle = THREE.MathUtils.degToRad(degrees);
    key.position.set(Math.sin(angle) * 4, 6, Math.cos(angle) * 4);
  };
  setLightAngle(-35);
  return {
    renderer, scene, camera, controls, key, setLightAngle,
    resize: resizeViewport,
    frame(head: boolean, angle: number) {
      frameHeight = head ? (projection === 'orthographic' ? 1.5 : 1.55) : 4.3;
      frameWidth = head ? frameHeight : 2.1;
      const distance = framingDistance(viewAspect);
      const radians = THREE.MathUtils.degToRad(angle);
      controls.target.set(0, head ? (projection === 'orthographic' ? 2.64 : 2.52) : 1.7, 0);
      camera.zoom = 1;
      camera.position.set(-Math.sin(radians) * distance, controls.target.y + (projection === 'perspective' ? distance * .035 : 0), Math.cos(radians) * distance);
      updateProjection(viewAspect);
      controls.update();
    },
    render(look: ReturnType<typeof applyD1LabLooks>) {
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      let shadowGroup: string | null = null;
      for (const view of views) {
        updateProjection(view.width / view.height);
        renderer.setViewport(view.x, view.y, view.width, view.height);
        renderer.setScissor(view.x, view.y, view.width, view.height);
        look.setVersion(view.version);
        // 原材质、摄影棚和研究材质的头发/眼部投影不同，同组可复用投影。
        const study = view.version === 'v7' || view.version === 'v8' || view.version === 'v9' || view.version === 'v10';
        const group = view.version === 'showcase' ? 'showcase' : study ? 'study' : 'studio';
        renderer.shadowMap.needsUpdate = shadowGroup !== group;
        shadowGroup = group;
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      key.dispose();
      rim.dispose();
      fill.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function bindGallery(studio: ReturnType<typeof createStudio>, cards: PreviewCard[], signal: AbortSignal): void {
  const stage = document.querySelector<HTMLElement>('.lab-stage')!;
  const back = document.querySelector<HTMLButtonElement>('#lab-show-all')!;
  const title = document.querySelector<HTMLElement>('#lab-view-title')!;
  const description = document.querySelector<HTMLElement>('#lab-view-description')!;
  let focused: D1LabVersion | null = null;
  const show = (version: D1LabVersion | null): void => {
    focused = version;
    stage.dataset.viewMode = version ? 'focus' : 'all';
    studio.controls.enableZoom = version !== null;
    studio.renderer.domElement.style.touchAction = version ? 'none' : 'pan-y pinch-zoom';
    document.querySelector<HTMLElement>('.lab-stage-help')!.textContent = version ? '拖动旋转 · 滚轮缩放 · 右键平移' : '拖动旋转 · 滚动浏览全部版本';
    const selected = D1_LAB_VERSIONS.find(candidate => candidate.id === version);
    title.textContent = selected ? selected.label : `全部 ${cards.length} 版`;
    description.textContent = selected ? selected.description : '点击任一角色放大 · 拖动任一角色同步旋转';
    back.hidden = version === null;
    for (const card of cards) card.element.hidden = version !== null && card.version !== version;
    studio.resize();
    const url = new URL(location.href);
    url.searchParams.delete('left');
    url.searchParams.delete('right');
    if (version) url.searchParams.set('version', version);
    else url.searchParams.delete('version');
    history.replaceState(history.state, '', url);
  };
  for (const card of cards) card.button.addEventListener('click', () => {
    show(card.version);
    back.focus();
  }, { signal });
  back.addEventListener('click', () => {
    const previous = focused;
    show(null);
    cards.find(card => card.version === previous)!.button.focus();
  }, { signal });
  let pointerStart: { x: number; y: number; id: number } | null = null;
  const canvas = studio.renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    pointerStart = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (pointerStart && event.pointerId === pointerStart.id && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) pointerStart = null;
  }, { signal });
  canvas.addEventListener('pointerup', event => {
    const start = pointerStart;
    pointerStart = null;
    if (focused || !start || event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    const card = cards.find(candidate => {
      const rect = candidate.viewport.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (card) { show(card.version); back.focus(); }
  }, { signal });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; }, { signal });
  const version = new URLSearchParams(location.search).get('version');
  show(version === null ? null : readVersion(version, cards));
}

function bindHairControl(hairStyle: HairStyle, signal: AbortSignal): void {
  const select = document.querySelector<HTMLSelectElement>('#lab-hair-version')!;
  select.value = hairStyle;
  if (hairStyle === 'showcase') {
    document.querySelector<HTMLElement>('#lab-hair-version-hint')!.textContent = '已单独保留这次链接中的白色基础服游戏标准版、完整头发和原动作；原材质基准与全部实验渲染使用统一棚光。';
    document.querySelector<HTMLElement>('#lab-hair-hint')!.textContent = '此项保留展示场头发，随原骨骼动作，不叠加实验发梢变形。';
    document.querySelector<HTMLInputElement>('#lab-hair-motion')!.checked = false;
    document.querySelector<HTMLInputElement>('#lab-hair-motion')!.disabled = true;
    document.querySelector<HTMLSelectElement>('#lab-gait')!.disabled = true;
    document.querySelector<HTMLElement>('#lab-gait-hint')!.textContent = '基础版使用展示场的原始动作。';
    document.querySelector<HTMLElement>('.lab-intro > p:last-child')!.textContent = '原材质基准与全部实验渲染同时展示。镜头、动作和闭合度同步，点击任一版本放大查看。';
    document.querySelector<HTMLElement>('.lab-definition dl > div:last-child dd')!.textContent = '本次展示场完整发型已单独保留，原材质基准与全部渲染统一比较；顶部链接打开当前展示场，会随正式模型更新。';
    const link = document.querySelector<HTMLAnchorElement>('#lab-showcase-link')!;
    link.href = './?mode=showcase&stageActor=d1.idle,1,0,1.5708,0,1,1,game,1&stageZoom=3.5&stageAngle=0&stageEnvironment=surface&textures=web-1k';
    link.textContent = '查看当前展示场 ↗';
  }
  if (hairStyle === 'authored' || hairStyle === 'sculpted' || isBlenderHair(hairStyle)) {
    const animation = document.querySelector<HTMLSelectElement>('#lab-animation-version')!;
    animation.options[0]!.text = '逐束动态';
    animation.options[1]!.text = '刚性跟随对照';
    document.querySelector<HTMLElement>('#lab-hair-hint')!.textContent = isBlenderHair(hairStyle)
      ? '发根与编辫固定，发梢随头部运动弯曲；可关闭惯性检查贴合。'
      : '各束独立摆动，发根保持连接；可关闭惯性查看静态轮廓。';
  }
  select.addEventListener('change', () => {
    const url = new URL(location.href);
    const selected = readHairStyle(select.value);
    url.searchParams.set('hair', selected);
    if (selected !== 'showcase' && url.searchParams.get('version') === 'showcase') url.searchParams.delete('version');
    location.assign(url.href);
  }, { signal });
}

function bindMotionControls(motion: ReturnType<typeof createD1LabMotion>, signal: AbortSignal): () => void {
  const actionSelect = document.querySelector<HTMLSelectElement>('#lab-action')!;
  const speed = document.querySelector<HTMLSelectElement>('#lab-speed')!;
  const gait = document.querySelector<HTMLSelectElement>('#lab-gait')!;
  const timeline = document.querySelector<HTMLInputElement>('#lab-timeline')!;
  const time = document.querySelector<HTMLOutputElement>('#lab-time')!;
  const pause = document.querySelector<HTMLButtonElement>('#lab-pause')!;
  const previous = document.querySelector<HTMLButtonElement>('#lab-step-back')!;
  const next = document.querySelector<HTMLButtonElement>('#lab-step-forward')!;
  actionSelect.replaceChildren(...D1_ACTIONS.map(action => new Option(action.label, action.id)));
  const sync = (): void => {
    actionSelect.value = motion.action;
    speed.value = String(motion.speed);
    gait.value = motion.gait;
    timeline.value = String(motion.time / motion.duration);
    time.value = `${motion.time.toFixed(2)} / ${motion.duration.toFixed(2)} 秒`;
    timeline.setAttribute('aria-valuetext', time.value);
    pause.setAttribute('aria-pressed', String(motion.paused));
    pause.textContent = motion.paused ? '继续动作' : '暂停动作';
    previous.disabled = motion.time <= 0;
    next.disabled = motion.time >= motion.duration;
  };
  actionSelect.addEventListener('change', () => {
    const selected = D1_ACTIONS.find(candidate => candidate.id === actionSelect.value);
    if (!selected) throw new Error(`实验页面未知动作：${actionSelect.value}`);
    motion.select(selected.id);
    sync();
  }, { signal });
  speed.addEventListener('change', () => {
    const value = Number(speed.value);
    if (![.25, .5, 1, 1.5].includes(value)) throw new Error(`实验页面未知动作速度：${speed.value}`);
    motion.setSpeed(value);
    sync();
  }, { signal });
  gait.addEventListener('change', () => {
    const value = gait.value;
    if (value !== 'original' && value !== 'smooth') throw new Error(`实验页面未知步态版本：${value}`);
    motion.setGait(value);
    sync();
  }, { signal });
  timeline.addEventListener('input', () => { motion.seek(timeline.valueAsNumber * motion.duration); sync(); }, { signal });
  previous.addEventListener('click', () => { motion.step(-1); sync(); }, { signal });
  next.addEventListener('click', () => { motion.step(1); sync(); }, { signal });
  pause.addEventListener('click', () => { motion.togglePause(); sync(); }, { signal });
  document.querySelector<HTMLButtonElement>('#lab-replay')!.addEventListener('click', () => { motion.replay(); sync(); }, { signal });
  sync();
  return sync;
}

function bindControls(studio: ReturnType<typeof createStudio>, motion: ReturnType<typeof createD1LabMotion>, look: ReturnType<typeof applyD1LabLooks>, variant: D1AnimatedVariant, signal: AbortSignal): () => void {
  const params = new URLSearchParams(location.search);
  const framing = params.get('framing') ?? 'body';
  if (framing !== 'body' && framing !== 'head') throw new Error(`未知取景范围：${framing}`);
  let head = framing === 'head';
  let angle = Number(params.get('angle') ?? '45');
  if (![0, 45, 90, 180].includes(angle)) throw new Error(`未知观察角度：${angle}`);
  const frame = (): void => {
    studio.frame(head, angle);
    const url = new URL(location.href);
    url.searchParams.set('framing', head ? 'head' : 'body');
    url.searchParams.set('angle', String(angle));
    history.replaceState(null, '', url);
  };
  const referenceImage = document.querySelector<HTMLImageElement>('#lab-reference-image')!;
  const referenceLink = document.querySelector<HTMLAnchorElement>('#lab-reference-link')!;
  const referenceLabel = variant === 'game' ? '基础版 · 白色基础服' : '外服 · 细腿定稿';
  referenceImage.src = D1_ARTWORK[variant];
  referenceImage.alt = `D1 ${referenceLabel}原画，包含正面、侧面与背面多视图`;
  referenceLink.href = D1_ARTWORK[variant];
  referenceLink.setAttribute('aria-label', `打开 D1 ${referenceLabel}原画大图`);
  document.querySelector<HTMLElement>('.lab-reference figcaption span')!.textContent = referenceLabel;
  const framingButtons = document.querySelectorAll<HTMLButtonElement>('[data-framing]');
  const angleButtons = document.querySelectorAll<HTMLButtonElement>('[data-angle]');
  for (const button of framingButtons) button.setAttribute('aria-pressed', String((button.dataset.framing === 'head') === head));
  for (const button of angleButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.angle) === angle));
  for (const button of framingButtons) button.addEventListener('click', () => {
    head = button.dataset.framing === 'head';
    for (const peer of framingButtons) peer.setAttribute('aria-pressed', String(peer === button));
    frame();
  }, { signal });
  for (const button of angleButtons) button.addEventListener('click', () => {
    angle = Number(button.dataset.angle);
    for (const peer of angleButtons) peer.setAttribute('aria-pressed', String(peer === button));
    frame();
  }, { signal });
  frame();

  const automatic = document.querySelector<HTMLInputElement>('#lab-auto-blink')!;
  const closure = document.querySelector<HTMLInputElement>('#lab-closure')!;
  const closureValue = document.querySelector<HTMLOutputElement>('#lab-closure-value')!;
  const changeClosure = (): void => {
    closure.disabled = automatic.checked;
    const value = closure.valueAsNumber;
    closureValue.value = automatic.checked ? '自动' : `${Math.round(value * 100)}%`;
    look.setClosure(automatic.checked ? null : value);
  };
  automatic.addEventListener('change', changeClosure, { signal });
  closure.addEventListener('input', changeClosure, { signal });
  const animation = document.querySelector<HTMLSelectElement>('#lab-animation-version')!;
  const animationVersion = params.get('animation') ?? 'refined';
  if (animationVersion !== 'original' && animationVersion !== 'refined') throw new Error(`未知模型动画版本：${animationVersion}`);
  animation.value = animationVersion;
  look.setAnimationVersion(animationVersion);
  animation.addEventListener('change', () => {
    const value = animation.value;
    if (value !== 'original' && value !== 'refined') throw new Error(`未知模型动画版本：${value}`);
    look.setAnimationVersion(value);
    const url = new URL(location.href);
    url.searchParams.set('animation', value);
    history.replaceState(history.state, '', url);
  }, { signal });
  const hairMotion = document.querySelector<HTMLInputElement>('#lab-hair-motion')!;
  hairMotion.addEventListener('change', () => look.setHairMotion(hairMotion.checked), { signal });
  look.setHairMotion(hairMotion.checked);

  const lightAngle = document.querySelector<HTMLInputElement>('#lab-light-angle')!;
  const lightAngleValue = document.querySelector<HTMLOutputElement>('#lab-light-angle-value')!;
  lightAngle.addEventListener('input', () => {
    studio.setLightAngle(lightAngle.valueAsNumber);
    lightAngleValue.value = `${lightAngle.value}°`;
  }, { signal });
  const lightPower = document.querySelector<HTMLInputElement>('#lab-light-power')!;
  const lightPowerValue = document.querySelector<HTMLOutputElement>('#lab-light-power-value')!;
  lightPower.addEventListener('input', () => {
    studio.key.intensity = lightPower.valueAsNumber;
    lightPowerValue.value = lightPower.valueAsNumber.toFixed(1);
  }, { signal });
  return bindMotionControls(motion, signal);
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const projection = params.get('projection') ?? 'perspective';
  if (projection !== 'perspective' && projection !== 'orthographic') throw new Error(`未知镜头方式：${projection}`);
  const hairStyle = readHairStyle(params.get('hair') ?? 'blender');
  const hairFamily = hairStyle === 'classic' ? 'classic' : isBlenderHair(hairStyle) ? 'blender' : 'rodin';
  const variant = hairStyle === 'showcase' ? 'game' : 'outfit';
  const cards = createPreviewCards(hairStyle === 'showcase');
  const status = document.querySelector<HTMLElement>('#lab-status')!;
  const studio = createStudio(document.querySelector<HTMLElement>('#lab-canvas')!, cards, projection);
  const events = new AbortController();
  let rig: ReturnType<typeof createD1Rig> | null = null;
  let look: ReturnType<typeof applyD1LabLooks> | null = null;
  let fit: ReturnType<typeof fitD1LabHair> | null = null;
  let motion: ReturnType<typeof createD1LabMotion> | null = null;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    events.abort();
    motion?.dispose();
    look?.dispose();
    fit?.dispose();
    rig?.dispose();
    disposeD1Assets();
    THREE.DefaultLoadingManager.setURLModifier(url => url);
    studio.dispose();
  };
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { signal: events.signal });
  import.meta.hot?.dispose(dispose);
  try {
    const projectionSelect = document.querySelector<HTMLSelectElement>('#lab-projection')!;
    projectionSelect.value = projection;
    projectionSelect.addEventListener('change', () => {
      const url = new URL(location.href);
      url.searchParams.set('projection', projectionSelect.value);
      location.assign(url.href);
    }, { signal: events.signal });
    bindHairControl(hairStyle, events.signal);
    // 独立文档只替换这一项资源，继续复用游戏的模型加载、尺寸与骨骼装配。
    const hairAsset = hairStyle === 'showcase' ? HAIR_ASSETS.showcase : isBlenderHair(hairStyle) ? HAIR_ASSETS[hairStyle] : HAIR_ASSETS[hairFamily];
    const modelPath = characterModelPath(D1_ANIMATED_MODELS.find(model => model.id === variant)!.path, 'web-1k');
    THREE.DefaultLoadingManager.setURLModifier(url => url === modelPath ? hairAsset : url);
    await loadD1Asset(variant, 'web-1k');
    if (disposed) return;
    const actor = createD1Rig(variant, 'anime', 'web-1k');
    rig = actor;
    if (hairStyle === 'rodin-fit') fit = fitD1LabHair(actor.root);
    if (hairStyle === 'rodin-contour') fit = contourD1LabHair(actor.root);
    const material = applyD1LabLooks(actor.root, hairStyle === 'showcase' || hairStyle === 'authored' || hairStyle === 'sculpted' ? hairStyle : hairFamily);
    look = material;
    studio.scene.add(actor.root);
    // 基础版赤脚，不能使用从外服版鞋底生成的实验步态。
    motion = createD1LabMotion(actor, () => material.resetMotion(), hairStyle === 'showcase' ? null : createD1LabGaits(actor));
    bindGallery(studio, cards, events.signal);
    const syncMotion = bindControls(studio, motion, material, variant, events.signal);
    await studio.renderer.compileAsync(studio.scene, studio.camera);
    if (disposed) return;
    document.querySelector<HTMLFieldSetElement>('#lab-controls')!.disabled = false;
    status.hidden = true;
    let previous = performance.now();
    studio.renderer.setAnimationLoop(now => {
      const dt = Math.min((now - previous) / 1000, .05);
      previous = now;
      const actualDt = motion!.update(dt);
      material.update(actualDt);
      syncMotion();
      studio.controls.update();
      studio.render(material);
    });
  } catch (error) {
    dispose();
    throw error;
  }
}

void start().catch(error => {
  const status = document.querySelector<HTMLElement>('#lab-status')!;
  status.hidden = false;
  status.dataset.error = '';
  status.setAttribute('role', 'alert');
  status.textContent = `渲染实验加载失败\n${error instanceof Error ? error.message : String(error)}`;
});
