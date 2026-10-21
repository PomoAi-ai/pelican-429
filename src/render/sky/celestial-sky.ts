import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import type { WorldTime } from '../../core/calendar.ts';
import { createSkyTexture, SKY_BOTTOM, SKY_TOP } from '../stage/stage.ts';

export type SkyPhase = 'day' | 'night';

type Direction = Readonly<{ x: number; y: number; z: number }>;
/** 检查页手动模式下月亮的固定世界方向。 */
const MANUAL_MOON = new THREE.Vector3(-.07, .10, -1);

function canvas2d(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('celestial-sky: cannot create 2D context for celestial texture');
  return ctx;
}

function canvasTexture(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sunTexture(): THREE.CanvasTexture {
  const ctx = canvas2d();
  const glow = ctx.createRadialGradient(64, 64, 32, 64, 64, 64);
  glow.addColorStop(0, '#fff1b4');
  glow.addColorStop(.65, '#ffd77670');
  glow.addColorStop(1, '#ffd77600');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#fff6cc';
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.fill();
  return canvasTexture(ctx);
}

/** lit 为被照亮比例；暗面用 destination-out 挖掉 94%，只留极淡的地照轮廓，新月不至于像一轮灰月。 */
function drawMoon(ctx: CanvasRenderingContext2D, lit: number, waning: boolean): void {
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#e7eff6';
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b6c8d980';
  for (const [x, y, radius] of [[48, 48, 11], [77, 72, 14], [51, 84, 6], [83, 47, 5]]) {
    ctx.beginPath();
    ctx.arc(x!, y!, radius!, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  // 盈月右侧亮，亏月镜像为左侧亮。
  if (waning) { ctx.translate(128, 0); ctx.scale(-1, 1); }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,.94)';
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.moveTo(64, 24);
  ctx.arc(64, 64, 40, -Math.PI / 2, Math.PI / 2);
  ctx.ellipse(64, 64, 40 * Math.abs(1 - 2 * lit), 40, 0, Math.PI / 2, -Math.PI / 2, lit < .5);
  ctx.fill('evenodd');
  ctx.restore();
}

/** 晨昏按日月光强连续交接方向，避免切换阴影时受光面突然翻转。 */
export function keyLightDirection(sunDirection: Direction, sunPower: number, moonPower: number): Direction {
  const moonShare = moonPower / (sunPower + moonPower);
  return { x: sunDirection.x * (1 - 2 * moonShare), y: Math.max(.04, Math.abs(sunDirection.y)), z: sunDirection.z };
}

/**
 * 日月星放在跟随镜头位置与朝向的组里，按画面比例定位：世界时间驱动时走整屏弧线，
 * horizonLine 是起落线在画面中的高度（0 底、1 顶），按各场景远景的地平线设定。
 * setSunDirection 仍按世界方向摆放，供检查页手动控制。距离只控制遮挡，尺寸由画面占比决定。
 */
export function createCelestialSky({ radius = 700, horizonLine = .45, diskScale = 1 } = {}) {
  const view = { tan: 0, aspect: 0 };
  /** 画面坐标：x −1..1 为左右边缘，f 0..1 为底到顶。 */
  const onScreen = (target: THREE.Vector3, x: number, f: number): THREE.Vector3 =>
    target.set(x * view.tan * view.aspect, (2 * f - 1) * view.tan, -1).normalize().multiplyScalar(radius);
  const root = new THREE.Group();
  root.name = 'celestial-sky';
  const sky = new THREE.Group();
  root.add(sky);
  const backgrounds = {
    day: createSkyTexture(SKY_TOP, SKY_BOTTOM),
    night: createSkyTexture('#101c3d', '#526884'),
  };
  const moonCanvas = canvas2d();
  // 默认满月：只调用 setPhase('night') 的检查页保持原样。
  drawMoon(moonCanvas, 1, false);
  let shownMoonPhase = 4;
  const moonTexture = canvasTexture(moonCanvas);
  const bodies = ([['sun', sunTexture()], ['moon', moonTexture]] as const).map(([name, map]) => {
    const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.name = name;
    sprite.renderOrder = -3;
    sprite.visible = name === 'sun';
    sky.add(sprite);
    return sprite;
  });
  const rng = mulberry32(0xced157);
  const positions: number[] = [];
  const colors: number[] = [];
  // 星星按画面均匀撒在起落线略下到顶部之间，镜头视角或宽高比变化时重排。
  const starSpots: number[] = [];
  for (let i = 0; i < 900; i++) {
    starSpots.push((rng() - .5) * 2.2, horizonLine - .05 + rng() * (1.05 - horizonLine));
    const brightness = .45 + rng() * .55;
    colors.push(brightness * .9, brightness * .95, brightness);
    positions.push(0, 0, 0);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const starTexture = sunTexture();
  const starMaterial = new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, map: starTexture,
    vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.name = 'stars';
  stars.renderOrder = -4;
  stars.visible = false;
  sky.add(stars);
  let phase: SkyPhase = 'day';
  let arc: Pick<WorldTime, 'celestialSun' | 'celestialMoon'> | null = null;
  const manualSun = MANUAL_MOON.clone();
  const toSky = new THREE.Quaternion();

  return {
    root,
    get background(): THREE.Texture { return backgrounds[phase]; },
    setSunDirection(direction: Direction): void {
      arc = null;
      manualSun.set(direction.x, direction.y, direction.z);
    },
    setPhase(next: SkyPhase): void {
      phase = next;
      bodies[0]!.visible = phase === 'day';
      bodies[1]!.visible = stars.visible = phase === 'night';
    },
    /** occlusion：0..1，日月星被遮住的程度（云量或室内）。 */
    setWorldTime(world: WorldTime, occlusion = 0): void {
      const sun = bodies[0]!;
      const moon = bodies[1]!;
      arc = world;
      if (world.moonPhase !== shownMoonPhase) {
        shownMoonPhase = world.moonPhase;
        drawMoon(moonCanvas, world.moonIllumination, world.moonPhase >= 5);
        moonTexture.needsUpdate = true;
      }
      sun.material.opacity = world.daylight * (1 - occlusion * .98);
      sun.material.color.set('#ffffff').lerp(new THREE.Color('#ffba76'), world.twilight);
      moon.material.opacity = world.night * (1 - occlusion * .95);
      sun.visible = world.daylight > 0;
      moon.visible = stars.visible = world.night > 0;
      starMaterial.opacity = world.night * world.night * (1 - occlusion);
    },
    update(camera: THREE.PerspectiveCamera): void {
      root.position.copy(camera.position);
      sky.quaternion.copy(camera.quaternion);
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      if (tan !== view.tan || camera.aspect !== view.aspect) {
        view.tan = tan;
        view.aspect = camera.aspect;
        const star = new THREE.Vector3();
        const position = starGeometry.getAttribute('position');
        for (let i = 0; i < 900; i++) {
          onScreen(star, starSpots[2 * i]!, starSpots[2 * i + 1]!);
          position.setXYZ(i, star.x, star.y, star.z);
        }
        position.needsUpdate = true;
        starGeometry.computeBoundingSphere();
      }
      if (arc) {
        onScreen(bodies[0]!.position, arc.celestialSun.x, horizonLine + arc.celestialSun.y);
        onScreen(bodies[1]!.position, arc.celestialMoon.x, horizonLine + arc.celestialMoon.y);
      } else {
        toSky.copy(camera.quaternion).invert();
        bodies[0]!.position.copy(manualSun).applyQuaternion(toSky).normalize().multiplyScalar(radius);
        bodies[1]!.position.copy(MANUAL_MOON).applyQuaternion(toSky).normalize().multiplyScalar(radius);
      }
      const diameter = 2 * radius * tan * .1 * diskScale;
      // 纹理中的实体圆直径为画布的 5/8，补偿透明边距以保持日月大小。
      for (const body of bodies) body.scale.setScalar(diameter / .625);
    },
    dispose(): void {
      root.removeFromParent();
      for (const body of bodies) {
        body.material.map!.dispose();
        body.material.dispose();
      }
      starGeometry.dispose();
      starMaterial.dispose();
      starTexture.dispose();
      for (const texture of Object.values(backgrounds)) texture.dispose();
      root.clear();
    },
  };
}
