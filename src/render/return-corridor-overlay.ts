import * as THREE from 'three';
import { createExhaustEmbers, updateCruiseEmbers } from './transit-center-fx.ts';
import { createPodBody } from './transit-landing-pod.ts';
import { createTimeCorridorMaterial } from './transit-time-corridor.ts';
import { createTransitSurface } from './transit-surface.ts';

// 着陆舱返回主世界只是近距离跳跃：同一条走廊，流速、扭转与时间冲击都比星舰弱一半。
const CALM = .5;
// 跳过走廊的入口加速段：机房页淡入时它已在巡航，城区页接着同样的巡航画面。
const CRUISE_START = 1;
/** 走廊着色器底色经 sRGB 编码后的颜色，两页跳转期间铺在页面上。 */
export const RETURN_CORRIDOR_BASE = '#0d162d';
// Like the starship's travel shot, the camera sits on the pod axis below the heat shield looking up the corridor.
const CAMERA_DROP = 18, FOV = 42;

/**
 * 全屏穿梭层，自带画布与渲染器，跨整页跳转时两页各建一个；画面照星舰穿越镜头：同轴仰视着陆舱舱底的发热喷管、
 * 沿轴尾流、火花与环绕边光，其后是走廊。
 * shown 为 true 时立即盖满；否则先隐藏着建好渲染器并画一帧，show 时才淡入——新建 WebGL 上下文要卡顿一两秒，留在加载期间。
 */
export function createReturnCorridorOverlay(parent: HTMLElement, shown: boolean) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.createElement('div');
  root.style.cssText = `position:fixed;inset:0;z-index:30;background:${RETURN_CORRIDOR_BASE};pointer-events:none;opacity:${shown ? 1 : 0}`;
  root.innerHTML = '<canvas aria-hidden="true" style="display:block;width:100%;height:100%"></canvas>'
    + '<p role="status" aria-live="polite" style="position:absolute;left:0;right:0;bottom:max(24px,env(safe-area-inset-bottom));margin:0;text-align:center;font:12px/1.6 ui-monospace,\'SF Mono\',Menlo,monospace;letter-spacing:.12em;color:#b9d4ff99"></p>';
  parent.append(root);
  const canvas = root.querySelector('canvas')!;
  const status = root.querySelector('p')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const material = createTimeCorridorMaterial();
  material.uniforms.uCenter!.value.set(.5, .5);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const scene = new THREE.Scene();
  const backdrop = new THREE.Mesh(geometry, material);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);
  const surface = createTransitSurface(new THREE.PMREMGenerator(renderer));
  // No ground in the corridor: the jets are only clipped behind the camera.
  const pod = createPodBody(surface, -CAMERA_DROP);
  scene.add(pod.root);
  // The boarding sill juts past the skirt: seen from below it is a bare plate outside the hull silhouette.
  const sill = pod.root.getObjectByName('port boarding threshold');
  if (!sill) throw new Error('return corridor: landing pod has no port boarding threshold to hide');
  sill.visible = false;
  // The steel mirrors the corridor as in the starship's travel shot.
  const reflective = new Set<THREE.MeshStandardMaterial>();
  pod.root.traverse(object => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.material.envMap === surface.environment) reflective.add(object.material);
  });
  for (const item of reflective) item.envMap = surface.corridor;
  const embers = createExhaustEmbers();
  pod.root.add(embers.points);
  // The starship's travel lights: a cool glow at the nozzles and two corridor-coloured rims circling the hull.
  const nozzleLight = new THREE.PointLight(0x93bdff, 60, 22, 1.8);
  nozzleLight.position.y = -1;
  const rims = [0x5fb4ff, 0xc46bff].map(color => new THREE.PointLight(color, 75, 26, 1.6));
  scene.add(nozzleLight, ...rims);
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 200);
  camera.position.y = -CAMERA_DROP;
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  let start = performance.now(), frame = 0;
  const draw = (now: number): void => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    const time = CRUISE_START + (now - start) / 1000;
    const still = reducedMotion.matches;
    material.uniforms.uAspect!.value = camera.aspect = w / h;
    camera.updateProjectionMatrix();
    material.uniforms.uPixel!.value = 2 / canvas.height;
    material.uniforms.uElapsed!.value = time;
    material.uniforms.uCalm!.value = still ? 1 : CALM;
    // A slow roll about the axis and a small wander off it keep the pod flying rather than pinned to the screen.
    const motion = still ? 0 : 1;
    pod.root.rotation.set(.035 * Math.sin(time * .53) * motion, time * .14 * motion, .035 * Math.sin(time * .41 + 1) * motion);
    pod.root.position.set(.35 * Math.sin(time * .37) * motion, 0, .25 * Math.sin(time * .29 + 2) * motion);
    for (const item of reflective) item.envMapRotation.y = time * .35 * motion;
    rims.forEach((light, i) => {
      const angle = time * .9 * motion + i * Math.PI;
      light.position.set(Math.cos(angle) * 4.6, -1.6, Math.sin(angle) * 4.6);
    });
    pod.cruise(time);
    updateCruiseEmbers(embers, pod.emitters, time, 0);
    nozzleLight.intensity = 60 * (1 + .08 * Math.sin(time * 43) + .04 * Math.sin(time * 79));
    renderer.render(scene, camera);
  };
  const loop = (now: number): void => {
    draw(now);
    frame = requestAnimationFrame(loop);
  };
  if (shown) loop(start);
  else draw(start);
  return {
    /** 从隐藏状态淡入，穿梭画面从巡航开头播起。 */
    show(seconds: number): void {
      start = performance.now();
      loop(start);
      root.style.transition = `opacity ${seconds}s ease-in`;
      root.style.opacity = '1';
    },
    progress(phase: string, completed?: number, total?: number): void {
      status.textContent = total === undefined ? phase : `${phase} · ${completed} / ${total}`;
    },
    /** 开始淡出后立即返回，淡出结束释放渲染器与画布。 */
    hide(seconds: number): void {
      root.style.transition = `opacity ${seconds}s ease-out`;
      root.style.opacity = '0';
      window.setTimeout(() => {
        cancelAnimationFrame(frame);
        geometry.dispose();
        material.dispose();
        pod.dispose();
        embers.points.geometry.dispose();
        embers.points.material.dispose();
        surface.dispose();
        renderer.dispose();
        // 外壳内反复切关卡会各建一个上下文，不主动释放会累积到浏览器上限。
        renderer.forceContextLoss();
        root.remove();
      }, seconds * 1000);
    },
  };
}
