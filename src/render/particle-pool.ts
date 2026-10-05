/**
 * 粒子对象池（任务 018）：一个 InstancedMesh（低模小球）承载固定上限的粒子，活跃粒子保持在前 count 个实例
 * （移除用末尾交换），每帧只写活跃实例的矩阵与颜色；不分配新 GPU 资源。
 * 粒子：位置/速度/重力/阻尼/寿命/起止尺寸/颜色；尺寸按寿命从 size0 线性到 size1（淡出靠缩小，实例不支持逐个透明度）。
 * lit=true：MeshBasicMaterial（由 light-texture 自动挂接瓦片光照，地下变暗）；lit=false：加性混合、userData.noLightMap（自发光火花）。
 */
import * as THREE from 'three';

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 寿命（秒，> 0）。 */
  life: number;
  size0: number;
  size1: number;
  /** 向下加速度（瓦片/秒²；负值向上飘）。 */
  gravity: number;
  /** 速度阻尼（1/秒）。 */
  drag: number;
  color: THREE.ColorRepresentation;
}

interface Particle extends Omit<ParticleSpec, 'color'> {
  age: number;
  readonly color: THREE.Color;
}

export interface ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  readonly capacity: number;
  readonly active: number;
  /** 发射一个粒子；池满时覆盖最老的（下标 0）。 */
  emit(spec: ParticleSpec): void;
  update(dt: number): void;
  clear(): void;
  dispose(): void;
}

export function createParticlePool(name: string, capacity: number, lit: boolean): ParticlePool {
  if (!(Number.isInteger(capacity) && capacity >= 1)) throw new Error(`particle-pool ${name}: capacity must be a positive integer, got ${capacity}`);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = lit
    ? new THREE.MeshBasicMaterial({ color: '#ffffff' })
    : new THREE.MeshBasicMaterial({ color: '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  material.name = `${name}-particles`;
  if (!lit) material.userData.noLightMap = true;
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `${name}-particles`;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color('#ffffff'));
  const parts: Particle[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  return {
    mesh,
    capacity,
    get active() {
      return parts.length;
    },
    emit(spec) {
      if (!(spec.life > 0) || !Number.isFinite(spec.x) || !Number.isFinite(spec.y)) throw new Error(`particle-pool ${name}: invalid particle (life ${spec.life}, at ${spec.x},${spec.y})`);
      const part: Particle = { ...spec, age: 0, color: new THREE.Color(spec.color) };
      if (parts.length >= capacity) parts.shift();
      parts.push(part);
    },
    update(dt) {
      if (!(dt >= 0)) throw new Error(`particle-pool ${name}: invalid dt ${dt}`);
      for (let i = parts.length - 1; i >= 0; i--) {
        const a = parts[i] as Particle;
        a.age += dt;
        if (a.age >= a.life) {
          parts[i] = parts[parts.length - 1] as Particle;
          parts.pop();
          continue;
        }
        const k = Math.max(0, 1 - a.drag * dt);
        a.vx *= k;
        a.vy = a.vy * k - a.gravity * dt;
        a.vz *= k;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.z += a.vz * dt;
      }
      for (let i = 0; i < parts.length; i++) {
        const a = parts[i] as Particle;
        const t = a.age / a.life;
        const size = a.size0 + (a.size1 - a.size0) * t;
        m.compose(p.set(a.x, a.y, a.z), q, s.setScalar(Math.max(1e-4, size)));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, a.color);
      }
      mesh.count = parts.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    clear() {
      parts.length = 0;
      mesh.count = 0;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      parts.length = 0;
    },
  };
}
