import * as THREE from 'three';
import { glslFloat } from '../sky/wind.ts';

// 出口与腹部钢圈同宽，满推力时向下约 0.9，末端张开到出口的 1.9 倍。
const WIDTH = 0.56;
const LENGTH = 0.9;
const SPREAD = 0.9;

/**
 * 尾焰着色器常量（WebGPU 节点版本同表）：hash 为值噪声哈希；coarse/medium/fine 三层噪声的横向/纵向缩放、偏移与流速，weights 为混合权重；
 * drift 横向漂移；core 白热核心（半径随 t 收窄、噪声抖动、出口段可见区间）；sheath 外鞘半径（先收后扩）与边缘撕裂；
 * breakup / tail / field 为外鞘碎裂、尾部消散与能量场强度；ring 为向下推移的能量环；alpha 为合成权重；颜色区间。
 */
export const DRONE_EXHAUST_SHADER = {
  spread: SPREAD,
  hash: { x: 127.1, y: 311.7, scale: 43758.5453 },
  coarse: { x: 2.2, y: 2.4, speed: 5 },
  medium: { x: 5, offset: 21.3, y: 5.5, speed: 9 },
  fine: { x: 11, offset: 8.2, y: 11, speed: 15 },
  weights: [0.5, 0.33, 0.17],
  drift: { y: 2, speed: 1.5, seed: 17.1, amp: 0.18 },
  core: { min: 0.02, base: 0.46, taper: 0.8, jitterBase: 0.9, jitter: 0.25, inner: 0.15, fade: [0.05, 0.45] },
  sheath: { base: 0.78, pinch: 0.18, turn: 0.3, flare: 0.34, coarse: 0.5, fine: 0.16, ragged: [0.1, 0.8], inner: 0.45 },
  breakup: { flow: [0.18, 0.7], t: [0.15, 0.9] },
  tail: { start: 0.35, jitter: 0.2 },
  field: { base: 0.45, gain: 0.5 },
  ring: { freq: 3.2, speed: 2.4, sharp: 70, fade: [0.1, 0.75] },
  alpha: { max: 0.92, core: 0.95, field: 1.1, ring: 0.45, cut: 0.004 },
  cool: [0.12, 0.62, 1.6],
  warm: [0.5, 1.5, 2.1],
  ringColor: [0.4, 0.9, 1],
  hot: [2.4, 2.9, 3.2],
  hotFrom: 0.35,
} as const;
const D = DRONE_EXHAUST_SHADER;
// 原 GLSL 的小数写成 .78 这样省略前导 0；按同样格式生成，WebGL 着色器文本逐字不变。
const f = (n: number): string => glslFloat(n).replace(/^0\./, '.');
const vec3 = (c: readonly number[]): string => `vec3(${c.map(f).join(', ')})`;

/**
 * 腹部喷口下方的青色能量尾焰，写法同星舰尾焰：三片交叉平面，流动噪声撕开外鞘，
 * 白热核心贴着出口，能量环随气流向下推移。
 */
export function createDroneExhaust() {
  const root = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(WIDTH, 1);
  geometry.translate(0, -0.5, 0);
  const material = new THREE.ShaderMaterial({
    name: 'drone-exhaust',
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    defines: { SPREAD: SPREAD.toFixed(2) },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // 平面向下张开成锥形光束，横向坐标仍按 uv 归一化。
        vec3 cone = vec3(position.x * (1.0 - position.y * SPREAD), position.yz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(cone, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uPower;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(${f(D.hash.x)}, ${f(D.hash.y)}))) * ${f(D.hash.scale)}); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float t = 1.0 - vUv.y;
        float lateral = (vUv.x - .5) * 2.0;
        float coarse = noise(vec2(lateral * ${f(D.coarse.x)}, t * ${f(D.coarse.y)} - uTime * ${f(D.coarse.speed)}));
        float medium = noise(vec2(lateral * ${f(D.medium.x)} + ${f(D.medium.offset)}, t * ${f(D.medium.y)} - uTime * ${f(D.medium.speed)}));
        float fine = noise(vec2(lateral * ${f(D.fine.x)} - ${f(D.fine.offset)}, t * ${f(D.fine.y)} - uTime * ${f(D.fine.speed)}));
        float flow = coarse * ${f(D.weights[0])} + medium * ${f(D.weights[1])} + fine * ${f(D.weights[2])};
        float drift = (noise(vec2(t * ${f(D.drift.y)} - uTime * ${f(D.drift.speed)}, ${f(D.drift.seed)})) - .5) * t * ${f(D.drift.amp)};
        float x = abs(lateral + drift);

        // 出口处是收窄的白热核心，向下很快化开。
        float coreRadius = max(${f(D.core.min)}, ${f(D.core.base)} - t * ${f(D.core.taper)}) * (${f(D.core.jitterBase)} + (medium - .5) * ${f(D.core.jitter)});
        float core = (1.0 - smoothstep(coreRadius * ${f(D.core.inner)}, coreRadius, x)) * (1.0 - smoothstep(${f(D.core.fade[0])}, ${f(D.core.fade[1])}, t));
        // 外鞘先略收后扩散，边缘被噪声撕碎，末端消散成柔和的能量场。
        float radius = ${f(D.sheath.base)} - ${f(D.sheath.pinch)} * smoothstep(0.0, ${f(D.sheath.turn)}, t) + ${f(D.sheath.flare)} * smoothstep(${f(D.sheath.turn)}, 1.0, t);
        float ragged = radius + ((coarse - .5) * ${f(D.sheath.coarse)} + (fine - .5) * ${f(D.sheath.fine)}) * smoothstep(${f(D.sheath.ragged[0])}, ${f(D.sheath.ragged[1])}, t);
        float sheath = 1.0 - smoothstep(ragged * ${f(D.sheath.inner)}, ragged, x);
        float breakup = mix(1.0, smoothstep(${f(D.breakup.flow[0])}, ${f(D.breakup.flow[1])}, flow), smoothstep(${f(D.breakup.t[0])}, ${f(D.breakup.t[1])}, t));
        float tail = 1.0 - smoothstep(${f(D.tail.start)} + coarse * ${f(D.tail.jitter)}, 1.0, t);
        float field = sheath * breakup * tail * (${f(D.field.base)} + flow * ${f(D.field.gain)});
        // 能量环：沿轴向下推移的亮带，靠近出口最清楚。
        float phase = fract(t * ${f(D.ring.freq)} - uTime * ${f(D.ring.speed)}) - .5;
        float ring = exp(-phase * phase * ${f(D.ring.sharp)}) * sheath * (1.0 - smoothstep(${f(D.ring.fade[0])}, ${f(D.ring.fade[1])}, t));

        float alpha = min(${f(D.alpha.max)}, (core * ${f(D.alpha.core)} + field * ${f(D.alpha.field)} + ring * ${f(D.alpha.ring)}) * uPower);
        if (alpha < ${f(D.alpha.cut)}) discard;
        vec3 color = mix(${vec3(D.cool)}, ${vec3(D.warm)}, flow);
        color += ${vec3(D.ringColor)} * ring;
        color = mix(color, ${vec3(D.hot)}, smoothstep(${f(D.hotFrom)}, 1.0, core));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
  });
  for (let i = 0; i < 3; i++) {
    const sheet = new THREE.Mesh(geometry, material);
    sheet.rotation.y = i * Math.PI / 3;
    sheet.frustumCulled = false;
    root.add(sheet);
  }
  return {
    root,
    update(time: number, thrust: number): void {
      root.visible = thrust > 0.015;
      root.scale.set(0.85 + thrust * 0.15, LENGTH * (0.5 + thrust * 0.5), 0.85 + thrust * 0.15);
      material.uniforms.uTime!.value = time;
      material.uniforms.uPower!.value = thrust;
    },
    dispose(): void { geometry.dispose(); material.dispose(); },
  };
}
