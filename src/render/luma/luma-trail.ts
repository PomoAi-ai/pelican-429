import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import { currentViewportHeight } from '../stage/stage.ts';
import { glslFloat as f } from '../sky/wind.ts';

const CAPACITY = 128;
const INTERVAL = 1 / 60;

/** 尾迹光点着色器：寿命、漂移、尺寸、衰减与新旧颜色，WebGPU 节点版本同表。 */
export const LUMA_TRAIL_SHADER = {
  life: { base: 1, seed: 0.5 },
  drift: { xFreq: 35, x: 0.09, rise: 0.05, riseSeed: 0.09, zFreq: 23, z: 0.06 },
  size: { base: 0.07, seed: 0.065, shrink: 0.55 },
  fadePow: 1.6,
  core: 0.65,
  glow: 0.35,
  cut: 0.003,
  fresh: [0.6, 1.25, 1.4],
  aged: [0.12, 0.55, 0.9],
} as const;
const T = LUMA_TRAIL_SHADER;
const vec3 = (c: readonly number[]): string => `vec3(${c.map(f).join(', ')})`;

export interface LumaTrail {
  update(worldPosition: THREE.Vector3, dt: number): void;
  reset(): void;
  dispose(): void;
}

/** 出生点留在场景坐标中，角色转身或移动时不会把已经落下的光点带走。 */
export function createLumaTrail(scene: THREE.Object3D): LumaTrail {
  const positions = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const births = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY).fill(-100), 1).setUsage(THREE.DynamicDrawUsage);
  const strengths = new THREE.Float32BufferAttribute(new Float32Array(CAPACITY), 1).setUsage(THREE.DynamicDrawUsage);
  const random = mulberry32(518);
  const seeds = new THREE.Float32BufferAttribute(Array.from({ length: CAPACITY }, () => random()), 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setAttribute('birth', births);
  geometry.setAttribute('strength', strengths);
  geometry.setAttribute('seed', seeds);
  const material = new THREE.ShaderMaterial({
    name: 'luma-trail',
    uniforms: { uTime: { value: 0 }, uPixels: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float birth;
      attribute float strength;
      attribute float seed;
      uniform float uTime;
      uniform float uPixels;
      varying float vAlpha;
      varying float vAge;
      void main() {
        float age = max(0.0, uTime - birth);
        float life = ${f(T.life.base)} + seed * ${f(T.life.seed)};
        float t = clamp(age / life, 0.0, 1.0);
        vec3 p = position;
        p.x += sin(seed * ${f(T.drift.xFreq)}) * age * ${f(T.drift.x)};
        p.y += age * (${f(T.drift.rise)} + seed * ${f(T.drift.riseSeed)});
        p.z += cos(seed * ${f(T.drift.zFreq)}) * age * ${f(T.drift.z)};
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (${f(T.size.base)} + seed * ${f(T.size.seed)}) * (1.0 - t * ${f(T.size.shrink)});
        gl_PointSize = size * uPixels * 0.5 * projectionMatrix[1][1] / -mv.z;
        vAlpha = strength * pow(1.0 - t, ${f(T.fadePow)});
        vAge = t;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      varying float vAge;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.0, 0.5, r);
        float glow = pow(max(0.0, 1.0 - r), 2.0);
        float alpha = vAlpha * (core * ${f(T.core)} + glow * ${f(T.glow)});
        if (alpha < ${f(T.cut)}) discard;
        vec3 color = mix(${vec3(T.fresh)}, ${vec3(T.aged)}, vAge);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'luma-world-trail';
  // 位置缓冲跨越世界各处，固定数量的轻量尾迹不采用失效的静态包围球。
  points.frustumCulled = false;
  const viewport = new THREE.Vector4();
  points.onBeforeRender = renderer => {
    material.uniforms.uPixels!.value = currentViewportHeight(renderer, viewport);
  };
  scene.add(points);
  const previous = new THREE.Vector3();
  let initialized = false;
  let clock = 0;
  let nextBirth = INTERVAL;
  let cursor = 0;

  return {
    update(worldPosition, dt) {
      if (dt === 0) return;
      if (!initialized) {
        previous.copy(worldPosition);
        initialized = true;
      }
      const end = clock + dt;
      const speed = previous.distanceTo(worldPosition) / dt;
      const strength = 0.18 + Math.min(speed / 3, 1) * 0.82;
      let emitted = false;
      while (nextBirth <= end) {
        const blend = (nextBirth - clock) / dt;
        const seed = seeds.getX(cursor);
        positions.setXYZ(cursor,
          THREE.MathUtils.lerp(previous.x, worldPosition.x, blend) + Math.sin(seed * 21) * 0.045,
          THREE.MathUtils.lerp(previous.y, worldPosition.y, blend) + Math.cos(seed * 17) * 0.045,
          THREE.MathUtils.lerp(previous.z, worldPosition.z, blend) + Math.sin(seed * 13) * 0.035,
        );
        births.setX(cursor, nextBirth);
        strengths.setX(cursor, strength);
        cursor = (cursor + 1) % CAPACITY;
        nextBirth += INTERVAL;
        emitted = true;
      }
      if (emitted) {
        positions.needsUpdate = true;
        births.needsUpdate = true;
        strengths.needsUpdate = true;
      }
      clock = end;
      material.uniforms.uTime!.value = clock;
      previous.copy(worldPosition);
    },
    reset() {
      births.array.fill(-100);
      births.needsUpdate = true;
      initialized = false;
      clock = 0;
      nextBirth = INTERVAL;
      cursor = 0;
      material.uniforms.uTime!.value = 0;
    },
    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
