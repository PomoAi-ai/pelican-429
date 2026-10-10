import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import { createSkyTexture, SKY_BOTTOM, SKY_TOP } from './stage.ts';

export type SkyPhase = 'day' | 'night';

const SKY_RADIUS = 700;

function celestialTexture(phase: SkyPhase): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('celestial-sky: cannot create 2D context for celestial texture');
  if (phase === 'day') {
    const glow = ctx.createRadialGradient(64, 64, 32, 64, 64, 64);
    glow.addColorStop(0, '#fff1b4');
    glow.addColorStop(.65, '#ffd77670');
    glow.addColorStop(1, '#ffd77600');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
  }
  ctx.fillStyle = phase === 'day' ? '#fff6cc' : '#e7eff6';
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.fill();
  if (phase === 'night') {
    ctx.fillStyle = '#b6c8d980';
    for (const [x, y, radius] of [[48, 48, 11], [77, 72, 14], [51, 84, 6], [83, 47, 5]]) {
      ctx.beginPath();
      ctx.arc(x!, y!, radius!, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 天体跟随镜头平移但保持世界方向；距离只控制遮挡，尺寸由画面占比决定。 */
export function createCelestialSky() {
  const root = new THREE.Group();
  root.name = 'celestial-sky';
  const backgrounds = {
    day: createSkyTexture(SKY_TOP, SKY_BOTTOM),
    night: createSkyTexture('#101c3d', '#526884'),
  };
  const bodies = (['day', 'night'] as const).map(phase => {
    const material = new THREE.SpriteMaterial({ map: celestialTexture(phase), transparent: true,
      depthWrite: false, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.name = phase === 'day' ? 'sun' : 'moon';
    sprite.position.set(-.07, .10, -1).normalize().multiplyScalar(SKY_RADIUS);
    sprite.renderOrder = -3;
    sprite.visible = phase === 'day';
    root.add(sprite);
    return sprite;
  });
  const rng = mulberry32(0xced157);
  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < 180; i++) {
    const azimuth = (rng() - .5) * 2.5;
    const elevation = .02 + rng() * .78;
    positions.push(Math.sin(azimuth) * Math.cos(elevation) * SKY_RADIUS,
      Math.sin(elevation) * SKY_RADIUS, -Math.cos(azimuth) * Math.cos(elevation) * SKY_RADIUS);
    const brightness = .45 + rng() * .55;
    colors.push(brightness * .9, brightness * .95, brightness);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const starMaterial = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false,
    vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.name = 'stars';
  stars.renderOrder = -4;
  stars.visible = false;
  root.add(stars);
  let phase: SkyPhase = 'day';

  return {
    root,
    get background(): THREE.Texture { return backgrounds[phase]; },
    setSunDirection(direction: Readonly<{ x: number; y: number; z: number }>): void {
      bodies[0]!.position.set(direction.x, direction.y, direction.z).normalize().multiplyScalar(SKY_RADIUS);
    },
    setPhase(next: SkyPhase): void {
      phase = next;
      bodies[0]!.visible = phase === 'day';
      bodies[1]!.visible = stars.visible = phase === 'night';
    },
    update(camera: THREE.PerspectiveCamera): void {
      root.position.copy(camera.position);
      const diameter = 2 * SKY_RADIUS * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * .1;
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
      for (const texture of Object.values(backgrounds)) texture.dispose();
      root.clear();
    },
  };
}
