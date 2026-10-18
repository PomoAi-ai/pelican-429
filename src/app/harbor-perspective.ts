import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createHarborPerspective } from '../render/harbor-perspective.ts';

const VIEWS = {
  city: { position: [22, 28, 72], target: [-5, 20, -160] },
  waterfront: { position: [0, 38, 108], target: [0, 22, -175] },
  oblique: { position: [60, 36, 80], target: [0, 20, -150] },
} as const;
type ViewId = keyof typeof VIEWS;

function installMovement(canvas: HTMLCanvasElement, signal: AbortSignal): () => number {
  const keys = new Set<string>();
  const pointers = new Map<number, number>();
  const movementKeys = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, [contenteditable]')) return;
    if (!movementKeys.includes(event.code)) return;
    keys.add(event.code);
    event.preventDefault();
  }, { signal });
  window.addEventListener('keyup', event => { keys.delete(event.code); }, { signal });
  window.addEventListener('blur', () => { keys.clear(); pointers.clear(); }, { signal });
  canvas.addEventListener('pointerdown', () => { canvas.focus({ preventScroll: true }); }, { signal });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) {
    button.addEventListener('pointerdown', event => {
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, Number(button.dataset.move));
      event.preventDefault();
    }, { signal });
    const release = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    button.addEventListener('pointerup', release, { signal });
    button.addEventListener('pointercancel', release, { signal });
    button.addEventListener('lostpointercapture', release, { signal });
  }
  return () => THREE.MathUtils.clamp(
    Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
      + [...pointers.values()].reduce((sum, direction) => sum + direction, 0), -1, 1,
  );
}

async function mountHarbor(): Promise<void> {
  const stage = document.querySelector<HTMLDivElement>('#harbor-stage')!;
  const status = document.querySelector<HTMLParagraphElement>('#harbor-status')!;
  const pauseButton = document.querySelector<HTMLButtonElement>('#harbor-pause')!;
  const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];
  const events = new AbortController();
  const { signal } = events;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '潮汐之城透视场景。拖动环视，滚轮调整远近，A、D 或左右方向键沿水岸移动。');
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7c8599');
  scene.fog = new THREE.Fog('#6f819a', 190, 720);
  scene.add(new THREE.HemisphereLight('#b7c7de', '#18283e', .85));
  const sunset = new THREE.DirectionalLight('#ffcf9d', 3.2);
  sunset.position.set(-180, 140, 80);
  sunset.target.position.set(0, 0, -120);
  sunset.castShadow = true;
  sunset.shadow.mapSize.set(2048, 2048);
  sunset.shadow.camera.left = -170;
  sunset.shadow.camera.right = 170;
  sunset.shadow.camera.top = 170;
  sunset.shadow.camera.bottom = -170;
  sunset.shadow.camera.near = 1;
  sunset.shadow.camera.far = 550;
  sunset.shadow.normalBias = .08;
  sunset.shadow.bias = -.0003;
  sunset.shadow.camera.updateProjectionMatrix();
  scene.add(sunset, sunset.target);
  let environment: THREE.WebGLRenderTarget | undefined;
  scene.environmentIntensity = .65;
  const camera = new THREE.PerspectiveCamera(48, 1, .3, 1500);
  const composer = new EffectComposer(renderer);
  composer.renderTarget1.samples = 4;
  composer.renderTarget2.samples = 4;
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(stage.clientWidth, stage.clientHeight), .3, .4, 1);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.enablePan = false;
  controls.minDistance = 140;
  controls.maxDistance = 300;
  controls.minPolarAngle = THREE.MathUtils.degToRad(65);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(89.5);
  controls.minAzimuthAngle = THREE.MathUtils.degToRad(-32);
  controls.maxAzimuthAngle = THREE.MathUtils.degToRad(32);
  let activeView: ViewId = 'city';
  let paused = false;
  let frame = 0;
  let disposed = false;
  let harbor: Awaited<ReturnType<typeof createHarborPerspective>> | undefined;

  const updateCamera = () => {
    controls.update();
    if (camera.position.z < 10) {
      camera.position.z = 10;
      camera.lookAt(controls.target);
    }
  };
  const setView = (view: ViewId) => {
    activeView = view;
    camera.position.fromArray(VIEWS[view].position);
    controls.target.fromArray(VIEWS[view].target);
    updateCamera();
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  };
  const resize = () => {
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    composer.setSize(stage.clientWidth, stage.clientHeight);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    events.abort();
    harbor?.dispose();
    controls.dispose();
    renderPass.dispose();
    bloomPass.dispose();
    outputPass.dispose();
    composer.dispose();
    scene.environment = null;
    environment?.dispose();
    sunset.dispose();
    scene.clear();
    renderer.dispose();
    renderer.domElement.remove();
  };
  window.addEventListener('resize', resize, { signal });
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { signal });
  import.meta.hot?.dispose(dispose);
  for (const button of viewButtons) button.addEventListener('click', () => { setView(button.dataset.view as ViewId); }, { signal });
  document.querySelector<HTMLButtonElement>('#harbor-reset')!.addEventListener('click', () => { setView(activeView); }, { signal });
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = paused ? '继续全部动画' : '暂停全部动画';
  }, { signal });
  const movement = installMovement(renderer.domElement, signal);
  setView('city');
  resize();
  try {
    harbor = await createHarborPerspective();
  } catch (error) {
    dispose();
    throw error;
  }
  if (disposed) { harbor.dispose(); return; }
  const pmrem = new THREE.PMREMGenerator(renderer);
  environment = pmrem.fromEquirectangular(harbor.skyTexture);
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.add(harbor.root);
  harbor.update(0);
  status.hidden = true;
  let previous = performance.now();
  let time = 0;
  const animate = (now: number) => {
    const delta = Math.min((now - previous) / 1000, .1);
    previous = now;
    const targetX = THREE.MathUtils.clamp(controls.target.x + movement() * delta * 16, -30, 30);
    camera.position.x += targetX - controls.target.x;
    controls.target.x = targetX;
    if (!paused) { time += delta; harbor!.update(time); }
    updateCamera();
    composer.render();
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
}

void mountHarbor().catch((error: unknown) => {
  const status = document.querySelector<HTMLParagraphElement>('#harbor-status')!;
  status.hidden = false;
  status.dataset.error = '';
  status.setAttribute('role', 'alert');
  status.textContent = `城市加载失败：${error instanceof Error ? error.message : String(error)}`;
  throw error;
});
