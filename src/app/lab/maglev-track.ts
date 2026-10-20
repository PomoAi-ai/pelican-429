import * as THREE from 'three';
import { AI_CITY_HARBOR_LOOK, AI_CITY_LOOK, BUILDING_SCENE_TUNING } from '../../config/ai-city-look.ts';
import { MAGLEV } from '../../config/maglev.ts';
import { attachStage, WEBGL_STAGE_BACKEND } from '../../render/stage/stage.ts';
import { createCameraRig } from '../../render/stage/camera-rig.ts';
import { DEFAULT_PRECIP } from '../../config/precip-rules.ts';
import { createDaylight } from '../../render/sky/daylight.ts';
import { createPrecipController } from '../../render/sky/precip.ts';
import { createPrecipSky } from '../../render/sky/precip-sky.ts';
import { createMaglevCar, createMaglevTrack, disposeMaglevResources } from '../../render/transit/maglev-model.ts';
import { createMaglevRailLights } from '../../render/transit/maglev-lighting.ts';
import { createMaglevDrive, stepMaglevDrive } from '../../sim/maglev-drive.ts';
import type { PageContext } from '../shell/page-context.ts';
import { pageRenderer } from '../shell/page-renderer.ts';
import { createViewLoop } from '../shell/view-loop.ts';
import '../../ui/lab/maglev-track.css';

const TEMPLATE = `
<main id="maglev-app">
  <div id="maglev-stage"></div>
  <header class="heading">
    <p>SKYLINE / MAGLEV</p>
    <h1>晴空线</h1>
    <span>160 格直线 · 三节连挂 · 每节两座</span>
  </header>
  <nav class="toolbar" aria-label="车厢和镜头">
    <div class="variants" role="group" aria-label="车厢形态">
      <button id="open-car" type="button" aria-pressed="true">敞开式</button>
      <button id="closed-car" type="button" aria-pressed="false">有棚式</button>
    </div>
    <label class="zoom">远近 <input id="zoom" type="range" min="0.75" max="2" step="0.05" value="1" aria-label="镜头缩放" /></label>
    <button id="reset" type="button">回到起点</button>
  </nav>
  <aside class="telemetry" aria-label="行驶状态">
    <div><output id="speed">0.0</output><span>格 / 秒</span></div>
    <p id="direction">停车</p>
    <div class="line-progress"><span id="progress"></span></div>
    <p><span id="position">80.0</span> / 160 格</p>
  </aside>
  <footer class="controls">
    <p>轨道深 2 格 · 底座深 3 格<br /><span>正面游戏透视 · A / D 行驶 · 空格刹车</span></p>
    <div role="group" aria-label="驾驶控制">
      <button data-drive="left" type="button" aria-label="按住向左行驶">← <span>向左</span></button>
      <button data-drive="brake" type="button" class="brake">刹车</button>
      <button data-drive="right" type="button" aria-label="按住向右行驶"><span>向右</span> →</button>
    </div>
  </footer>
  <details class="downloads">
    <summary>模型文件</summary>
    <a href="./models/maglev/open-car.glb" download>敞开式 GLB</a>
    <a href="./models/maglev/closed-car.glb" download>有棚式 GLB</a>
    <a href="./models/maglev/track.glb" download>轨道 GLB</a>
  </details>
  <p id="status" role="status">正在准备轨道……</p>
</main>
`;

const MAGLEV_SCENE_TUNING = {
  ...BUILDING_SCENE_TUNING,
  render: {
    ...BUILDING_SCENE_TUNING.render,
    lighting: {
      ...BUILDING_SCENE_TUNING.render.lighting,
      ao: { ...BUILDING_SCENE_TUNING.render.lighting.ao, radius: .24, thickness: .22, intensity: .2, samples: 8, denoiseSamples: 8 },
      ssr: { ...BUILDING_SCENE_TUNING.render.lighting.ssr, enabled: false },
      // Keep white bodywork below the bloom threshold; only the HDR lamp cores spread light.
      bloom: { strength: .18, radius: .15, threshold: 2.4, resolutionScale: .75 },
      grade: { ...BUILDING_SCENE_TUNING.render.lighting.grade, vignette: .04 },
    },
  },
};

function createLine(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'straight-maglev-line';
  const template = createMaglevTrack();
  template.updateMatrixWorld(true);
  const count = MAGLEV.trackLength / MAGLEV.trackModuleLength;
  const translation = new THREE.Matrix4();
  template.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const repeats = new THREE.InstancedMesh(object.geometry, object.material, count);
    repeats.name = object.name;
    repeats.castShadow = object.castShadow;
    repeats.receiveShadow = object.receiveShadow;
    for (let i = 0; i < count; i++) {
      translation.makeTranslation(1 + i * MAGLEV.trackModuleLength, 0, 0);
      repeats.setMatrixAt(i, translation.clone().multiply(object.matrixWorld));
    }
    repeats.computeBoundingSphere();
    root.add(repeats);
  });
  const pierGeometry = new THREE.BoxGeometry(.5, 4, 1.5);
  const pierMaterial = new THREE.MeshStandardMaterial({ color: '#bdcdd3', roughness: .6, metalness: .25 });
  const piers = new THREE.InstancedMesh(pierGeometry, pierMaterial, count / 4);
  piers.name = 'guideway-supports';
  piers.castShadow = true;
  for (let i = 0; i < piers.count; i++) piers.setMatrixAt(i, new THREE.Matrix4().makeTranslation(4 + i * 8, -2.22, 0));
  root.add(piers);
  const stopGeometry = new THREE.BoxGeometry(.14, .4, 1.8);
  const stopMaterial = new THREE.MeshStandardMaterial({ color: '#66828e', metalness: .5, roughness: .4 });
  for (const x of [.1, MAGLEV.trackLength - .1]) {
    const stop = new THREE.Mesh(stopGeometry, stopMaterial);
    stop.name = 'line-end-stop';
    stop.position.set(x, .2, 0);
    root.add(stop);
  }
  return root;
}

function installDriving(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const keys = new Set<string>();
  const pointers = new Map<number, string>();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-drive]')];
  const clear = () => { keys.clear(); pointers.clear(); };
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, summary, a')) return;
    if (!['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  }, { signal });
  window.addEventListener('keyup', event => { keys.delete(event.code); }, { signal });
  window.addEventListener('blur', clear, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); }, { signal });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }), { signal });
  for (const button of buttons) {
    button.addEventListener('pointerdown', event => {
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, button.dataset.drive!);
      event.preventDefault();
    }, { signal });
    const release = (event: PointerEvent) => pointers.delete(event.pointerId);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, release, { signal });
    button.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'Enter') {
        pointers.set(-1, button.dataset.drive!);
        event.preventDefault();
      }
    }, { signal });
    button.addEventListener('keyup', () => pointers.delete(-1), { signal });
    button.addEventListener('blur', () => pointers.delete(-1), { signal });
  }
  return { clear, read() {
    const held = [...pointers.values()];
    const left = keys.has('KeyA') || keys.has('ArrowLeft') || held.includes('left');
    const right = keys.has('KeyD') || keys.has('ArrowRight') || held.includes('right');
    return { throttle: (Number(right) - Number(left)) as -1 | 0 | 1, brake: keys.has('Space') || held.includes('brake') };
  } };
}

export function mountMaglevTrack(ctx: PageContext): void {
  document.getElementById('loading')!.hidden = true;
  document.title = '晴空线 · 磁悬浮试车场';
  ctx.root.innerHTML = TEMPLATE;
  const host = document.querySelector<HTMLDivElement>('#maglev-stage')!;
  const status = document.querySelector<HTMLParagraphElement>('#status')!;
  const stage = attachStage(host, pageRenderer(ctx, 'game', MAGLEV_SCENE_TUNING), MAGLEV_SCENE_TUNING, { quality: 'high', antialias: 'smaa' }, WEBGL_STAGE_BACKEND);
  // 试车场固定在上午十点的晴天，与城区走同一条昼夜与天色路径。
  const daylight = createDaylight({ stage, clock: { day: 1, second: 36000 }, openSky: () => 1, look: {
    ...AI_CITY_HARBOR_LOOK,
    keyColor: '#f7fbff', keyIntensity: 2.2,
    hemiSky: '#f3f6fa', hemiGround: '#e1e6eb', hemiIntensity: .35,
    // Keep the studio's reflection bands so white and silver curves read against the outdoor sky.
    environmentIntensity: .65,
    rimColor: '#ecf5ff', rimIntensity: .35,
    atmosphere: { ...AI_CITY_LOOK.atmosphere, exposure: 1, haze: '#e8eef4', rimDirection: { x: -.35, y: .45, z: .82 },
      aoIntensity: .2, skyReflection: false },
  } });
  const clearSky = createPrecipController(DEFAULT_PRECIP);
  const sky = createPrecipSky({ scene: stage.scene, base: daylight.base, keyLight: stage.keyLight, hemiLight: stage.hemiLight,
    rimLight: stage.rimLight, grade: stage.postFx.grade }, DEFAULT_PRECIP.seed);
  stage.scene.add(sky.root);
  const root = new THREE.Group();
  const train = new THREE.Group();
  train.name = 'three-car-maglev';
  const car = createMaglevCar();
  for (let i = 0; i < MAGLEV.carCount; i++) {
    const copy = i === 0 ? car : car.clone();
    copy.position.x = (i - (MAGLEV.carCount - 1) / 2) * MAGLEV.carPitch;
    train.add(copy);
  }
  const railLights = createMaglevRailLights(train);
  root.add(createLine(), train);
  stage.scene.add(root);
  // Include the actual couplers when reserving space at the two ends.
  const trainLength = new THREE.Box3().setFromObject(train).getSize(new THREE.Vector3()).x;
  const bounds = { trackLength: MAGLEV.trackLength, trainLength: trainLength + .5 };
  const drive = createMaglevDrive(MAGLEV.trackLength, trainLength);
  const rig = createCameraRig({ camera: stage.camera, tuning: BUILDING_SCENE_TUNING,
    bounds: { width: MAGLEV.trackLength, height: 20, minY: -8 },
    viewport: () => stage.canvas.getBoundingClientRect() });
  rig.snapTo(drive.x, 0, 1);
  const { signal } = ctx;
  const input = installDriving(stage.canvas, signal);
  const openButton = document.querySelector<HTMLButtonElement>('#open-car')!;
  const closedButton = document.querySelector<HTMLButtonElement>('#closed-car')!;
  const setRoof = (closed: boolean) => {
    for (const carriage of train.children) carriage.getObjectByName('canopy')!.visible = closed;
    openButton.setAttribute('aria-pressed', String(!closed));
    closedButton.setAttribute('aria-pressed', String(closed));
    stage.canvas.focus({ preventScroll: true });
  };
  openButton.addEventListener('click', () => setRoof(false), { signal });
  closedButton.addEventListener('click', () => setRoof(true), { signal });
  const zoom = document.querySelector<HTMLInputElement>('#zoom')!;
  zoom.addEventListener('input', () => rig.setZoom(Number(zoom.value)), { signal });
  document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
    input.clear(); Object.assign(drive, createMaglevDrive(MAGLEV.trackLength, trainLength));
    zoom.value = '1'; rig.setZoom(1); rig.snapTo(drive.x, 0, 1);
    stage.canvas.focus({ preventScroll: true });
  }, { signal });
  const speed = document.querySelector<HTMLOutputElement>('#speed')!;
  const position = document.querySelector<HTMLSpanElement>('#position')!;
  const progress = document.querySelector<HTMLSpanElement>('#progress')!;
  const direction = document.querySelector<HTMLParagraphElement>('#direction')!;
  let elapsed = 0, facing: -1 | 1 = 1;
  const loop = createViewLoop(dt => {
    elapsed += dt;
    const previousLift = drive.lift;
    stepMaglevDrive(drive, input.read(), dt, bounds);
    const lift = drive.lift * drive.lift * (3 - 2 * drive.lift);
    railLights.update(lift);
    const bob = Math.sin(elapsed * 1.8) * .012 * lift * Math.min(1, Math.abs(drive.speed));
    train.position.set(drive.x, MAGLEV.railTop - MAGLEV.shoeBottom + MAGLEV.hoverHeight * lift + bob, 0);
    if (drive.speed !== 0) facing = drive.speed > 0 ? 1 : -1;
    rig.update(train.position.x, 0, facing, dt);
    daylight.update();
    sky.update({ visual: clearSky.visual, lightning: clearSky.lightning, camera: stage.camera, view: { x: train.position.x, y: 0, w: 1, h: 1 } });
    daylight.updateSky(sky.look!);
    stage.render();
    speed.value = Math.abs(drive.speed).toFixed(1);
    position.textContent = train.position.x.toFixed(1);
    progress.style.left = `${train.position.x / MAGLEV.trackLength * 100}%`;
    const half = bounds.trainLength / 2;
    direction.textContent = drive.lift === 0
      ? drive.x <= half || drive.x >= bounds.trackLength - half ? '落轨停靠 · 已到端点，可反向行驶' : '落轨停靠'
      : drive.lift < 1 ? drive.lift > previousLift ? '起浮中' : '下降停靠'
      : drive.speed > 0 ? '悬浮行驶 →' : drive.speed < 0 ? '← 悬浮行驶' : '悬浮待行';
  }, ctx.reportError);
  loop.start();
  status.textContent = '';
  ctx.onDispose(() => {
    loop.stop();
    railLights.dispose(); disposeMaglevResources(root); sky.dispose(); daylight.dispose(); stage.dispose();
  });
}

