import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import { currentViewportHeight } from '../stage.ts';
import { glslFloat as f } from '../wind.ts';

const LIGHT_INTENSITY = 1.8;

/**
 * 光点着色器（uLayer 0 = 光核、1 = 弥散辉光、2 = 外围光点）：漂移、脉动、闪烁、高斯辉光与颜色，WebGPU 节点版本同表。
 * swarm / core 为外围光点与光核的位移（freq 乘 uCycle、amp 为幅度）。
 */
export const LUMA_RIG_SHADER = {
  tau: 6.2831853,
  swarm: { xFreq: 0.7, xAmp: 0.11, yFreq: 0.9, yPhase: 3, yAmp: 0.12, zFreq: 0.6, zAmp: 0.12 },
  core: { xAmp: 0.018, yFreq: 1.3, yAmp: 0.022 },
  pulse: { base: 0.88, amp: 0.12, freq: 1.4 },
  twinkle: { freq: 1.5, pow: 3, gain: 0.8 },
  haloOpacity: 0.19,
  falloff: 28,
  edge: [0.16, 0.25],
  haloColor: [0.18, 0.72, 1],
  moteColor: [1.15, 1.3, 1.18],
  alertColor: [1.3, 1, 0.45],
} as const;
const L = LUMA_RIG_SHADER;
const vec3 = (c: readonly number[]): string => `vec3(${c.map(f).join(', ')})`;

const lightVertex = /* glsl */`
  attribute float seed;
  attribute float size;
  uniform float uCycle;
  uniform float uSpread;
  uniform float uEnergy;
  uniform float uPixels;
  uniform float uLayer;
  varying float vOpacity;
  void main() {
    float phase = seed * ${f(L.tau)};
    vec3 p = position;
    if (uLayer > 1.5) {
      p.x += sin(uCycle * ${f(L.swarm.xFreq)} + phase) * ${f(L.swarm.xAmp)};
      p.y += sin(uCycle * ${f(L.swarm.yFreq)} + phase * ${f(L.swarm.yPhase)}) * ${f(L.swarm.yAmp)};
      p.z += cos(uCycle * ${f(L.swarm.zFreq)} + phase) * ${f(L.swarm.zAmp)};
      p *= uSpread;
    } else {
      p.x += sin(uCycle + phase) * ${f(L.core.xAmp)};
      p.y += cos(uCycle * ${f(L.core.yFreq)} + phase) * ${f(L.core.yAmp)};
    }
    float pulse = ${f(L.pulse.base)} + ${f(L.pulse.amp)} * sin(uCycle * ${f(L.pulse.freq)} + phase);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * pulse * length(modelMatrix[0].xyz)
      * uPixels * 0.5 * projectionMatrix[1][1] / -mv.z;
    vOpacity = uEnergy * (uLayer > 1.5
      ? pow(0.5 + 0.5 * sin(uCycle * ${f(L.twinkle.freq)} + phase), ${f(L.twinkle.pow)}) * ${f(L.twinkle.gain)}
      : (uLayer > 0.5 ? ${f(L.haloOpacity)} : 1.0));
  }
`;

const lightFragment = /* glsl */`
  uniform float uAlert;
  uniform float uLayer;
  varying float vOpacity;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float radius2 = dot(p, p);
    // Gaussian falloff vanishes before the point boundary; no visible shell.
    float glow = exp(-radius2 * ${f(L.falloff)}) * (1.0 - smoothstep(${f(L.edge[0])}, ${f(L.edge[1])}, radius2));
    vec3 color = uLayer > 0.5 && uLayer < 1.5
      ? ${vec3(L.haloColor)} : ${vec3(L.moteColor)};
    color = mix(color, ${vec3(L.alertColor)}, uAlert);
    gl_FragColor = vec4(color, glow * vOpacity);
  }
`;

export interface LumaRig {
  root: THREE.Group;
  motion: THREE.Group;
  particles: THREE.Group;
  light: THREE.PointLight;
  uniforms: {
    uCycle: THREE.IUniform<number>;
    uSpread: THREE.IUniform<number>;
    uEnergy: THREE.IUniform<number>;
    uAlert: THREE.IUniform<number>;
  };
  dispose(): void;
}

/** 光心、弥散辉光与三维光点共同成形，不绘制实体表面。 */
export function createLumaRig(): LumaRig {
  const root = new THREE.Group();
  root.name = 'luma-companion';
  const motion = new THREE.Group();
  const particles = new THREE.Group();
  root.add(motion);
  motion.add(particles);
  const light = new THREE.PointLight(0x8deaff, LIGHT_INTENSITY, 9, 2);
  light.position.z = 0.45;
  motion.add(light);
  const uniforms = {
    uCycle: { value: 0 }, uSpread: { value: 1 },
    uEnergy: { value: 1 }, uAlert: { value: 0 },
  };
  const materials: THREE.ShaderMaterial[] = [];
  const random = mulberry32(429);
  const viewport = new THREE.Vector4();
  const moteGeometries: THREE.BufferGeometry[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const count = layer === 0 ? 5 : layer === 1 ? 4 : 36;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const radius = layer === 2 ? 0.42 : 0.04;
      positions[i * 3] = (random() - 0.5) * radius * 2;
      positions[i * 3 + 1] = (random() - 0.5) * radius * 1.2;
      positions[i * 3 + 2] = (random() - 0.5) * radius * 2;
      seeds[i] = random();
      sizes[i] = layer === 0 ? 0.22 + random() * 0.1
        : layer === 1 ? 1.0 + i * 0.35 : 0.025 + random() * 0.045;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.3);
    const material = new THREE.ShaderMaterial({
      name: 'luma-rig-light',
      vertexShader: lightVertex, fragmentShader: lightFragment,
      uniforms: { ...uniforms, uPixels: { value: 1 }, uLayer: { value: layer } },
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.renderOrder = 3;
    points.onBeforeRender = renderer => {
      material.uniforms.uPixels!.value = currentViewportHeight(renderer, viewport);
    };
    particles.add(points);
    moteGeometries.push(geometry);
    materials.push(material);
  }
  return {
    root, motion, particles, light, uniforms,
    dispose() {
      root.removeFromParent();
      root.clear();
      for (const geometry of moteGeometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

export function animateLumaParticles(rig: LumaRig, cycle: number, spread: number, energy: number, alert: boolean): void {
  // 技能的高能量只放大光核和粒子，实体照明保留柔和的上限。
  rig.light.intensity = LIGHT_INTENSITY * Math.min(energy, 1.4);
  rig.uniforms.uCycle.value = cycle;
  rig.uniforms.uSpread.value = spread;
  rig.uniforms.uEnergy.value = energy;
  rig.uniforms.uAlert.value = alert ? 1 : 0;
}
