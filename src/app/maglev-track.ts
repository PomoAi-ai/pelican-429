import * as THREE from 'three';
import { BUILDING_SCENE_TUNING, AI_CITY_HARBOR_LOOK } from '../config/ai-city-look.ts';
import { MAGLEV } from '../config/maglev.ts';
import { createStage } from '../render/stage.ts';
import { createCameraRig } from '../render/camera-rig.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createMaglevCar, createMaglevTrack, disposeMaglevResources } from '../render/maglev-model.ts';
import { createMaglevRailLights } from '../render/maglev-lighting.ts';
import { createMaglevDrive, stepMaglevDrive } from '../sim/maglev-drive.ts';

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

function mount(): void {
  const host = document.querySelector<HTMLDivElement>('#maglev-stage')!;
  const status = document.querySelector<HTMLParagraphElement>('#status')!;
  const stage = createStage(host, MAGLEV_SCENE_TUNING, { quality: 'high', antialias: 'smaa' });
  const studioEnvironment = stage.scene.environment;
  const lighting = createAiCityLighting(stage, {
    ...AI_CITY_HARBOR_LOOK,
    exposure: 1,
    keyColor: '#f7fbff', keyIntensity: 2.2,
    hemiSky: '#f3f6fa', hemiGround: '#e1e6eb', hemiIntensity: .35,
    environmentIntensity: .3, haze: '#e8eef4',
    rimColor: '#ecf5ff', rimIntensity: .35, rimDirection: { x: -.35, y: .45, z: .82 },
    aoIntensity: .2,
  });
  lighting.setEnabled(true);
  // Keep the studio's reflection bands so white and silver curves read against the outdoor sky.
  stage.scene.environment = studioEnvironment;
  stage.scene.environmentIntensity = .65;
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
  const abort = new AbortController();
  const input = installDriving(stage.canvas, abort.signal);
  const openButton = document.querySelector<HTMLButtonElement>('#open-car')!;
  const closedButton = document.querySelector<HTMLButtonElement>('#closed-car')!;
  const setRoof = (closed: boolean) => {
    for (const carriage of train.children) carriage.getObjectByName('canopy')!.visible = closed;
    openButton.setAttribute('aria-pressed', String(!closed));
    closedButton.setAttribute('aria-pressed', String(closed));
    stage.canvas.focus({ preventScroll: true });
  };
  openButton.addEventListener('click', () => setRoof(false), { signal: abort.signal });
  closedButton.addEventListener('click', () => setRoof(true), { signal: abort.signal });
  const zoom = document.querySelector<HTMLInputElement>('#zoom')!;
  zoom.addEventListener('input', () => rig.setZoom(Number(zoom.value)), { signal: abort.signal });
  document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
    input.clear(); Object.assign(drive, createMaglevDrive(MAGLEV.trackLength, trainLength));
    zoom.value = '1'; rig.setZoom(1); rig.snapTo(drive.x, 0, 1);
    stage.canvas.focus({ preventScroll: true });
  }, { signal: abort.signal });
  const speed = document.querySelector<HTMLOutputElement>('#speed')!;
  const position = document.querySelector<HTMLSpanElement>('#position')!;
  const progress = document.querySelector<HTMLSpanElement>('#progress')!;
  const direction = document.querySelector<HTMLParagraphElement>('#direction')!;
  let previous: number | null = null;
  let elapsed = 0, facing: -1 | 1 = 1;
  const frame = (now: number) => {
    const dt = previous === null ? 0 : Math.min((now - previous) / 1000, .05);
    previous = now; elapsed += dt;
    const previousLift = drive.lift;
    stepMaglevDrive(drive, input.read(), dt, bounds);
    const lift = drive.lift * drive.lift * (3 - 2 * drive.lift);
    railLights.update(lift);
    const bob = Math.sin(elapsed * 1.8) * .012 * lift * Math.min(1, Math.abs(drive.speed));
    train.position.set(drive.x, MAGLEV.railTop - MAGLEV.shoeBottom + MAGLEV.hoverHeight * lift + bob, 0);
    if (drive.speed !== 0) facing = drive.speed > 0 ? 1 : -1;
    rig.update(train.position.x, 0, facing, dt);
    lighting.update();
    stage.render();
    speed.value = Math.abs(drive.speed).toFixed(1);
    position.textContent = train.position.x.toFixed(1);
    progress.style.left = `${train.position.x / MAGLEV.trackLength * 100}%`;
    const half = bounds.trainLength / 2;
    direction.textContent = drive.lift === 0
      ? drive.x <= half || drive.x >= bounds.trackLength - half ? '落轨停靠 · 已到端点，可反向行驶' : '落轨停靠'
      : drive.lift < 1 ? drive.lift > previousLift ? '起浮中' : '下降停靠'
      : drive.speed > 0 ? '悬浮行驶 →' : drive.speed < 0 ? '← 悬浮行驶' : '悬浮待行';
  };
  stage.renderer.setAnimationLoop(frame);
  status.textContent = '';
  window.addEventListener('pagehide', event => {
    input.clear();
    if (event.persisted) return;
    abort.abort(); stage.renderer.setAnimationLoop(null);
    railLights.dispose(); disposeMaglevResources(root); lighting.dispose(); stage.dispose();
  });
}

try { mount(); }
catch (error) {
  document.querySelector<HTMLParagraphElement>('#status')!.textContent = `轨道场景加载失败：${String(error)}`;
  throw error;
}
