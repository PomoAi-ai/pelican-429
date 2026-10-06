import * as THREE from 'three';
import { grassyAction } from '../../config/grassy.ts';
import type { GrassyAction, GrassyFlightState } from '../../config/grassy.ts';
import { createParticleCloud, createThruster } from './grassy-particles.ts';
import { createCodeBolts, createBugSwarm } from './grassy-projectiles.ts';
import { createServerOverload } from './grassy-overload.ts';

export const GRASSY_EFFECT_SOCKETS = ['fx_keyboard', 'fx_wrist_L', 'fx_wrist_R', 'fx_pack_L', 'fx_pack_R'] as const;

const clamp = THREE.MathUtils.clamp;
const ease = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

function createKeyboardSmash(parent: THREE.Group, clip: THREE.AnimationClip, scale: THREE.Vector3) {
  const root = new THREE.Group();
  root.name = 'grassy-keyboard-combo';
  parent.add(root);
  // 从真实键盘轨道采样远端，挥击弧线随烘焙动作更新，不再独立猜测圆弧。
  const samplePosition = clip.tracks.find((track) => track.name === 'KeyboardWeapon.position')!.InterpolantFactoryMethodLinear();
  const sampleRotation = clip.tracks.find((track) => track.name === 'KeyboardWeapon.quaternion')!.InterpolantFactoryMethodLinear();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const point = new THREE.Vector3();
  function sample(progress: number): void {
    const time = progress * clip.duration;
    matrix.compose(position.fromArray(samplePosition.evaluate(time)), rotation.fromArray(sampleRotation.evaluate(time)), scale);
  }
  const sparks = createParticleCloud(96, '#ffb749');
  root.add(sparks.points);
  const swings = [[0.30, 22 / 60, 0.43], [0.60, 42 / 60, 0.76]] as const;
  const ribbons = swings.map(([, impact]) => {
    sample(impact);
    const contact = new THREE.Vector3(0.525, 0, 0).applyMatrix4(matrix);
    const positions = new THREE.Float32BufferAttribute(new Float32Array(28 * 6 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positions);
    const material = new THREE.MeshBasicMaterial({ color: '#59dfff', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    root.add(mesh);
    return { mesh, positions, contact };
  });
  const corners = [[0, 0.36], [0, 0.55], [1, 0.55], [0, 0.36], [1, 0.55], [1, 0.36]] as const;
  return {
    root,
    update(progress: number, side: 0 | 1 | null) {
      sparks.points.visible = side === null;
      for (let swing = 0; swing < 2; swing++) {
        const [start, impact, end] = swings[swing]!;
        const { mesh, positions, contact } = ribbons[swing]!;
        mesh.visible = (side === null || side === swing) && progress >= start && progress < end + 0.07;
        mesh.material.opacity = ease((progress - start) / 0.025) * (1 - ease((progress - end) / 0.07)) * 0.82;
        const head = clamp(progress, start, end);
        const tail = side === 1 ? Math.min(end, head + 0.10) : Math.max(start, head - 0.10);
        for (let j = 0; j < 28; j++) for (let k = 0; k < 6; k++) {
          const [next, x] = corners[k]!;
          sample(THREE.MathUtils.lerp(tail, head, (j + next) / 28));
          point.set(x, 0, 0).applyMatrix4(matrix);
          positions.setXYZ(j * 6 + k, point.x, point.y, point.z);
        }
        positions.needsUpdate = true;
        const age = (progress - impact) / 0.16;
        const active = age >= 0 && age < 1;
        const t = clamp(age, 0, 1);
        for (let i = 0; i < 48; i++) {
          const angle = i * 2.39996;
          const seed = (i * 0.618034) % 1;
          const radius = 0.02 + t * (0.22 + seed * 0.38);
          const id = swing * 48 + i;
          sparks.positions.setXYZ(id, contact.x + Math.cos(angle) * radius,
            contact.y + Math.sin(angle) * radius * 0.8 - t * t * 0.12, contact.z + Math.sin(i * 1.7) * radius * 0.6);
          sparks.sizes.setX(id, (0.08 + seed * 0.11) * (1 - t * 0.45));
          sparks.alphas.setX(id, active ? (1 - t) ** 1.3 : 0);
        }
      }
      sparks.positions.needsUpdate = sparks.sizes.needsUpdate = sparks.alphas.needsUpdate = true;
    },
  };
}

/** 动作和特效共用绝对时间；离开键盘的投射物留在角色坐标中，不被收刀动作牵回。 */
export function createGrassyEffects(model: THREE.Group, smashClip: THREE.AnimationClip) {
  const attackRoot = new THREE.Group();
  attackRoot.name = 'grassy-attack-effects';
  attackRoot.matrixAutoUpdate = false;
  model.add(attackRoot);
  const smash = createKeyboardSmash(attackRoot, smashClip, model.getObjectByName('KeyboardWeapon')!.scale.clone());
  const bolts = createCodeBolts(attackRoot);
  const bugs = createBugSwarm(attackRoot);
  const previewProjectiles = [
    { root: bolts.root, muzzle: new THREE.Vector3(0, 1.65, 0.58) },
    { root: bugs.root, muzzle: new THREE.Vector3(0, 1.70, 0.58) },
  ];
  for (const projectile of previewProjectiles) projectile.root.matrixAutoUpdate = false;
  const muzzleDelta = new THREE.Vector3();
  const previewTranslation = new THREE.Matrix4();
  const servers = createServerOverload(attackRoot);
  const thrusters = GRASSY_EFFECT_SOCKETS.slice(1).map((name) => createThruster(model.getObjectByName(name)!));
  const roots = [attackRoot, ...thrusters.map((thruster) => thruster.root)];
  let projectilePreview = true;
  const serverOrientation = new THREE.Quaternion();
  return {
    setProjectilePreview(enabled: boolean) { projectilePreview = enabled; },
    update(action: GrassyAction, time: number, duration: number, flight: GrassyFlightState | null, attackTransform: THREE.Matrix4, strikeSide: 0 | 1 | null) {
      attackRoot.matrix.copy(attackTransform);
      attackRoot.matrixWorldNeedsUpdate = true;
      const progress = time / duration;
      smash.root.visible = action === 'keyboard_smash';
      bolts.root.visible = projectilePreview && action === 'codex_attack';
      bugs.root.visible = projectilePreview && action === 'bug_attack';
      servers.root.visible = action === 'server_overload';
      for (const projectile of previewProjectiles) {
        projectile.root.matrix.identity();
        if (projectilePreview && flight && projectile.root.visible) {
          // 起点随握持姿势移动；离手弹道保持向前，不能随快飞前倾扎入脚下。
          muzzleDelta.copy(projectile.muzzle).applyMatrix4(attackTransform).sub(projectile.muzzle);
          previewTranslation.makeTranslation(muzzleDelta.x, muzzleDelta.y, muzzleDelta.z);
          projectile.root.matrix.copy(attackTransform).invert().multiply(previewTranslation);
        }
        projectile.root.matrixWorldNeedsUpdate = true;
      }
      if (smash.root.visible) smash.update(progress, strikeSide);
      if (bolts.root.visible) bolts.update(progress);
      if (bugs.root.visible) bugs.update(progress);
      if (servers.root.visible) {
        // 机柜沿横版场景展开，避免角色侧转时所有机柜重叠遮住主角。
        if (!projectilePreview) {
          model.updateMatrixWorld(true);
          attackRoot.getWorldQuaternion(serverOrientation).invert();
          servers.root.quaternion.copy(serverOrientation);
        }
        servers.update(time / grassyAction(action).seconds);
      }
      const flightAction = flight ? flight.action : action;
      const flightTime = flight ? flight.time : time;
      const flightProgress = flight ? flightTime / grassyAction(flight.action).seconds : progress;
      const fastFlight = flightAction === 'fly_fast';
      const thrust = flightAction === 'hover' ? 0.8 : fastFlight ? 2.1 : flightAction === 'fly_forward' ? 1.15 : flightAction === 'takeoff' ? ease((flightProgress - 0.15) / 0.4) * 0.8 : flightAction === 'land' ? (1 - ease((flightProgress - 0.05) / 0.65)) * 0.8 : 0;
      for (let i = 0; i < thrusters.length; i++) {
        // 施法双臂自由活动，升力由腰背承担；护腕不朝敌人或键盘喷出长尾焰。
        const thruster = thrusters[i]!;
        // 0.8 秒快飞对应现有 1.2 秒粒子周期，增强流速后循环仍连续。
        thruster.update(flightTime * (fastFlight ? 1.5 : 1), thrust * (flight ? i < 2 ? 0.16 : 1.3 : 1));
        if (fastFlight && (!flight || i >= 2)) thruster.root.scale.y *= 1.45;
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const root of roots) {
        root.traverse((node) => {
          if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments || node instanceof THREE.Points) {
            geometries.add(node.geometry);
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
          }
          if (node instanceof THREE.InstancedMesh) node.dispose();
        });
        root.removeFromParent();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

export type GrassyEffects = ReturnType<typeof createGrassyEffects>;
