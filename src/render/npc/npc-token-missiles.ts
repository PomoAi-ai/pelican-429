import * as THREE from 'three';
import { createParticleCloud } from '../grassy/grassy-particles.ts';
import { caption } from './npc-effects.ts';

const COLORS = ['#53eaff', '#ffdc85'] as const;
const TRAIL_COUNT = 24;
const FRAGMENT_COUNT = 16;

/** 六枚码块导弹只负责表现；发射和命中时间由调用方已有的技能时间轴决定。 */
export function createTokenMissiles(parent: THREE.Group) {
  const root = new THREE.Group();
  root.name = 'token-missiles';
  parent.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const headGeometry = new THREE.OctahedronGeometry(.19);
  const flameGeometry = new THREE.ConeGeometry(.14, .65, 8);
  flameGeometry.rotateZ(Math.PI / 2);
  const shellMaterial = new THREE.MeshStandardMaterial({ color: '#d4ffff', metalness: .55, roughness: .28, emissive: '#087282', emissiveIntensity: .5 });
  const goldMaterial = new THREE.MeshStandardMaterial({ color: COLORS[1], metalness: .7, roughness: .24, emissive: '#b27516', emissiveIntensity: .35 });
  const headMaterial = new THREE.MeshBasicMaterial({ color: '#eeffff', toneMapped: false });
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const missiles = Array.from({ length: 6 }, (_, index) => {
    const body = new THREE.Group();
    const blocks = new THREE.InstancedMesh(cube, shellMaterial, 4);
    const contacts = new THREE.InstancedMesh(cube, goldMaterial, 8);
    for (let block = 0; block < 4; block++) {
      const x = -.45 + block * .25;
      transform.position.set(x, 0, 0);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(.21, .23, .26);
      transform.updateMatrix();
      blocks.setMatrixAt(block, transform.matrix);
      blocks.setColorAt(block, color.set(COLORS[(block + index) % 2]!));
      for (let side = 0; side < 2; side++) {
        transform.position.set(x, side === 0 ? -.15 : .15, 0);
        transform.scale.set(.075, .09, .08);
        transform.updateMatrix();
        contacts.setMatrixAt(block * 2 + side, transform.matrix);
      }
    }
    const spine = new THREE.Mesh(cube, goldMaterial);
    spine.scale.set(1.12, .18, .18);
    spine.position.x = -.08;
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.scale.x = 1.6;
    head.position.x = .58;
    const flame = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({ color: COLORS[index % 2]!, transparent: true, opacity: .8, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    flame.position.x = -.86;
    body.add(blocks, contacts, spine, head, flame);
    const label = caption('TOKEN', COLORS[index % 2]!, 2.6, true);
    root.add(body, label);
    const trail = createParticleCloud(TRAIL_COUNT, COLORS[index % 2]!);
    root.add(trail.points);
    return { body, label, head, flame, trail };
  });
  const fragments = new THREE.InstancedMesh(cube, shellMaterial, 6 * FRAGMENT_COUNT);
  fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fragments.frustumCulled = false;
  for (let index = 0; index < fragments.count; index++) fragments.setColorAt(index, color.set(COLORS[index % 2]!));
  root.add(fragments);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const hide = (): void => {
    root.visible = false;
    for (const missile of missiles) {
      missile.body.visible = missile.label.visible = missile.trail.points.visible = false;
    }
    fragments.visible = false;
  };
  hide();
  return {
    hide,
    /** 每帧先 hide，再取样 0–5；progress < 0 表示未发射，hitAge < 0 表示尚未命中。 */
    sample(index: number, from: Readonly<{ x: number; y: number; z: number }>, to: Readonly<{ x: number; y: number; z: number }>, progress: number, facing: -1 | 1, hitAge: number) {
      const missile = missiles[index]!;
      const flying = progress >= 0 && progress < 1 && hitAge < 0;
      const bursting = hitAge >= 0 && hitAge < .6;
      if (flying || bursting) root.visible = true;
      missile.body.visible = missile.label.visible = missile.trail.points.visible = flying;
      const arc = .8 + index % 3 * .35;
      const u = THREE.MathUtils.clamp(progress, 0, 1);
      point.set(THREE.MathUtils.lerp(from.x, to.x, u), THREE.MathUtils.lerp(from.y, to.y, u) + 4 * arc * u * (1 - u), THREE.MathUtils.lerp(from.z, to.z, u));
      direction.set(to.x - from.x, to.y - from.y + 4 * arc * (1 - 2 * u), 0).normalize();
      missile.body.position.copy(point);
      missile.body.rotation.z = Math.atan2(direction.y, direction.x);
      missile.head.rotation.x = u * Math.PI * 5;
      missile.flame.scale.set(.8 + Math.sin(u * 50 + index) * .15, 1, 1);
      missile.label.position.copy(point);
      missile.label.position.y += .32;
      missile.label.position.z += .25;
      for (let particle = 0; particle < TRAIL_COUNT; particle++) {
        const p = u - particle * .013;
        missile.trail.positions.setXYZ(particle,
          THREE.MathUtils.lerp(from.x, to.x, p),
          THREE.MathUtils.lerp(from.y, to.y, p) + 4 * arc * p * (1 - p),
          THREE.MathUtils.lerp(from.z, to.z, p));
        missile.trail.sizes.setX(particle, .14 - particle * .004);
        missile.trail.alphas.setX(particle, flying && p >= 0 ? (1 - particle / TRAIL_COUNT) * .8 : 0);
      }
      missile.trail.positions.needsUpdate = missile.trail.sizes.needsUpdate = missile.trail.alphas.needsUpdate = true;
      if (bursting) fragments.visible = true;
      const burst = THREE.MathUtils.clamp(hitAge / .6, 0, 1);
      for (let fragment = 0; fragment < FRAGMENT_COUNT; fragment++) {
        const angle = fragment * 2.399963 + index;
        const radius = burst * (1.1 + fragment % 4 * .2);
        transform.position.set(to.x + Math.cos(angle) * radius + facing * burst * .25, to.y + Math.sin(angle) * radius + burst * .55 - burst * burst * .8, to.z + Math.sin(fragment * 1.7) * radius * .35);
        transform.rotation.set(angle + burst * 5, burst * 8, angle - burst * 4);
        const size = bursting ? (1 - burst) * (.09 + fragment % 3 * .03) : 0;
        transform.scale.set(size * 1.5, size, size * .55);
        transform.updateMatrix();
        fragments.setMatrixAt(index * FRAGMENT_COUNT + fragment, transform.matrix);
      }
      fragments.instanceMatrix.needsUpdate = true;
    },
  };
}
