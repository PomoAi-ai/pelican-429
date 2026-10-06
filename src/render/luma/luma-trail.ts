import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';

const CAPACITY = 128;
const INTERVAL = 1 / 60;

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
        float life = 1.0 + seed * 0.5;
        float t = clamp(age / life, 0.0, 1.0);
        vec3 p = position;
        p.x += sin(seed * 35.0) * age * 0.09;
        p.y += age * (0.05 + seed * 0.09);
        p.z += cos(seed * 23.0) * age * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (0.07 + seed * 0.065) * (1.0 - t * 0.55);
        gl_PointSize = size * uPixels * 0.5 * projectionMatrix[1][1] / -mv.z;
        vAlpha = strength * pow(1.0 - t, 1.6);
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
        float alpha = vAlpha * (core * 0.65 + glow * 0.35);
        if (alpha < 0.003) discard;
        vec3 color = mix(vec3(0.6, 1.25, 1.4), vec3(0.12, 0.55, 0.9), vAge);
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
    renderer.getCurrentViewport(viewport);
    material.uniforms.uPixels!.value = viewport.w;
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
