import * as THREE from 'three';
import { FORTRESS_BLACKHOLE } from '../../config/facility-structure.ts';
import { glslFloat as f } from '../sky/wind.ts';

/** 吸积流、盘面、透镜拱、光子环与逃逸光迹的程序化参数；WebGPU 节点版本同表。 */
export const BLACKHOLE_SHADER = {
  hash: { k: [127.1, 311.7], scale: 43758.5453 },
  thread: { lo: 0.88, hi: 0.99, aa: 0.025 },
  filaments: {
    minRadius: 0.08, spin: 0.22, spinNear: 0.12,
    turbulence: { circle: 3.8, radius: 8 },
    detail: { circle: 11, radius: 19 },
    fine: { radius: 260, angle: 3, time: 3.2, turbulence: 6, base: 0.24, detail: 0.76 },
    medium: { radius: 117, angle: 5, time: 2.3, turbulence: 4 },
    wisps: { radius: 418, angle: 7, time: 4.7, detail: 2 },
    clusters: { base: 0.35, noise: 0.65, circle: 5, radius: 3 },
    gain: { fine: 0.8, medium: 0.35, wisps: 0.22 },
    hot: { radius: 183, angle: 2, time: 1.7 },
  },
  plasma: { cold: [0.035, 0.12, 0.32], warm: [0.65, 0.86, 1.15], hot: [1.18, 0.83, 0.43], hotMix: 0.48, glow: [0.72, 0.85, 1.0], glowPower: 3, glowGain: 2 },
  trails: {
    count: 12,
    period: [2.1, 4.3],
    seed: { period: 1, offset: 31, slot: 113, cycle: 37, life: 2, launch: 3, tail: 4, bend: 5, path: 6, width: 7, color: 8 },
    life: [0.48, 0.84], launch: [0.09, 0.3], reach: 0.98, ease: [0.25, 0.75], tail: [0.1, 0.24],
    bend: [1.2, 3.4], tau: 6.2831853, bendRate: 5, minRadius: 0.05, width: [0.0015, 0.0035], aa: 1.5,
    glow: { sharp: 100, gain: 0.18 }, tip: { pixels: 2, base: 0.008 }, fade: { in: 0.07, out: 0.72 }, outer: [0.88, 0.99],
    cold: [0.48, 0.95, 1.8], warm: [1.7, 0.92, 0.36], gain: 1.8, tipGain: 2.5, maxAlpha: 0.95,
  },
  tilt: { cos: 0.94, sin: 0.342 },
  aaMin: 0.001,
  horizon: 0.306,
  envelope: { in: [0.304, 0.335], out: [0.42, 0.72], base: 0.035, flow: 0.12 },
  disk: {
    squash: 0.19, speed: 1.3, inner: [0.32, 0.38], outer: [0.81, 0.99], alpha: 0.65, flow: 0.7, maxAlpha: 0.98,
    approach: 0.55, receding: [1.35, 0.68, 0.3], toward: [0.8, 1.1, 1.4], gain: [0.85, 2.7], front: 0.004, frontGain: 1.15,
  },
  lens: {
    lift: 0.018, squash: 0.98, scale: 1.38, speed: 0.85, minWidth: 0.002, radius: 0.397, width: [0.012, 0.062], rise: [-0.045, 0.07],
    receding: [1.3, 0.73, 0.38], toward: [0.85, 1.1, 1.3], gain: [1.2, 3], alpha: 0.62, flow: 0.32,
  },
  secondary: { lift: 0.02, squash: 0.91, radius: 0.33, sharp: 150, below: -0.1, gain: 1.4, alpha: 0.7 },
  photon: {
    radius: 0.316, width: [0.0015, 0.005], halo: 75, haloColor: [0.38, 0.54, 0.85], haloAlpha: 0.45,
    warm: [1.3, 1.0, 0.72], cool: [1.15, 1.45, 1.8], alpha: 0.86,
  },
  cut: 0.001,
} as const;
const B = BLACKHOLE_SHADER;
const F = B.filaments;
const T = B.trails;
const D = B.disk;
const L = B.lens;
const P = B.photon;
const v3 = (c: readonly number[]): string => c.map(f).join(', ');
// 原 GLSL 写作 0.10 / 0.30 / -0.10，保留两位小数以保持着色器文本不变。
const f2 = (n: number): string => n.toFixed(2);
const HASH_K = `vec2(${v3(B.hash.k)})`;

const BLACKHOLE_FRAGMENT = `
uniform float uTime;
varying vec2 vUv;

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec4 h = fract(sin(vec4(dot(i, ${HASH_K}),
    dot(i + vec2(1.0, 0.0), ${HASH_K}),
    dot(i + vec2(0.0, 1.0), ${HASH_K}),
    dot(i + 1.0, ${HASH_K}))) * ${f(B.hash.scale)});
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

float thread(float phase) {
  float wave = 0.5 + 0.5 * sin(phase);
  // Derivatives of the periodic wave remain continuous across the polar seam.
  float aa = max(fwidth(wave), ${f(B.thread.aa)});
  return smoothstep(${f(B.thread.lo)} - aa, ${f(B.thread.hi)} + aa, wave);
}

vec3 filaments(vec2 p, float time) {
  float radius = max(length(p), ${f(F.minRadius)});
  float angle = atan(p.y, p.x);
  float orbit = angle - time * (${f(F.spin)} + ${f(F.spinNear)} / radius);
  vec2 circle = vec2(cos(orbit), sin(orbit));
  float turbulence = noise(circle * ${f(F.turbulence.circle)} + radius * ${f(F.turbulence.radius)});
  float detail = noise(circle * ${f(F.detail.circle)} - radius * ${f(F.detail.radius)});
  float phase = radius * ${f(F.fine.radius)} + angle * ${f(F.fine.angle)} - time * ${f(F.fine.time)} + turbulence * ${f(F.fine.turbulence)};
  float fine = thread(phase) * (${f(F.fine.base)} + ${f(F.fine.detail)} * detail);
  float medium = thread(radius * ${f(F.medium.radius)} + angle * ${f(F.medium.angle)} - time * ${f(F.medium.time)} + turbulence * ${f(F.medium.turbulence)});
  float wisps = thread(radius * ${f(F.wisps.radius)} - angle * ${f(F.wisps.angle)} + time * ${f(F.wisps.time)} + detail * ${f(F.wisps.detail)});
  float clusters = ${f(F.clusters.base)} + ${f(F.clusters.noise)} * noise(circle * ${f(F.clusters.circle)} + radius * ${f(F.clusters.radius)});
  return vec3((fine * ${f(F.gain.fine)} + medium * ${f(F.gain.medium)} + wisps * ${f(F.gain.wisps)}) * clusters,
    thread(radius * ${f(F.hot.radius)} + angle * ${f(F.hot.angle)} - time * ${f(F.hot.time)}) * detail, turbulence);
}

vec3 plasma(vec3 flow) {
  vec3 color = mix(vec3(${v3(B.plasma.cold)}), vec3(${v3(B.plasma.warm)}), flow.x);
  color = mix(color, vec3(${v3(B.plasma.hot)}), flow.y * ${f(B.plasma.hotMix)});
  return color + vec3(${v3(B.plasma.glow)}) * pow(flow.x, ${f(B.plasma.glowPower)}) * ${f(B.plasma.glowGain)};
}

void over(inout vec4 image, vec3 color, float alpha) {
  image.rgb = color * alpha + image.rgb * (1.0 - alpha);
  image.a = alpha + image.a * (1.0 - alpha);
}

float hash(float value) {
  return fract(sin(value * ${f(B.hash.k[0])}) * ${f(B.hash.scale)});
}

void escapeTrails(inout vec4 image, vec2 p) {
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float pixel = max(fwidth(radius), ${f(B.aaMin)});
  for (int i = 0; i < ${T.count}; i++) {
    float slot = float(i);
    float cycle = uTime / mix(${v3(T.period)}, hash(slot + ${f(T.seed.period)})) + hash(slot + ${f(T.seed.offset)});
    // 一次出生只选一次随机轨迹，避免逐帧噪声把运动变成闪烁。
    float seed = slot * ${f(T.seed.slot)} + floor(cycle) * ${f(T.seed.cycle)};
    float age = fract(cycle);
    float life = mix(${v3(T.life)}, hash(seed + ${f(T.seed.life)}));
    float progress = min(age / life, 1.0);
    float launch = mix(${f(T.launch[0])}, ${f2(T.launch[1])}, hash(seed + ${f(T.seed.launch)}));
    float head = launch + (${f(T.reach)} - launch) * (${f(T.ease[0])} * progress + ${f(T.ease[1])} * progress * progress);
    float tailLength = mix(${f2(T.tail[0])}, ${f(T.tail[1])}, hash(seed + ${f(T.seed.tail)}));
    float behind = head - radius;
    float tail = smoothstep(-pixel, pixel, behind)
      * (1.0 - smoothstep(0.0, tailLength, behind));
    float bend = mix(${v3(T.bend)}, hash(seed + ${f(T.seed.bend)}));
    float pathAngle = hash(seed + ${f(T.seed.path)}) * ${f(T.tau)}
      + bend * (1.0 - exp(-max(radius - launch, 0.0) * ${f(T.bendRate)}));
    float delta = angle - pathAngle;
    float distance = abs(atan(sin(delta), cos(delta))) * max(radius, ${f(T.minRadius)});
    float width = mix(${v3(T.width)}, hash(seed + ${f(T.seed.width)}));
    float line = 1.0 - smoothstep(width, width + pixel * ${f(T.aa)}, distance);
    float glow = exp(-distance * ${f(T.glow.sharp)}) * ${f(T.glow.gain)};
    float tipDistance = behind / (pixel * ${f(T.tip.pixels)} + ${f(T.tip.base)});
    float tip = exp(-tipDistance * tipDistance);
    float fade = smoothstep(0.0, ${f(T.fade.in)}, progress) * (1.0 - smoothstep(${f(T.fade.out)}, 1.0, progress));
    float mask = smoothstep(launch - pixel, launch + pixel, radius)
      * (1.0 - smoothstep(${v3(T.outer)}, radius));
    vec3 color = mix(vec3(${v3(T.cold)}), vec3(${v3(T.warm)}), hash(seed + ${f(T.seed.color)}));
    over(image, color * (${f(T.gain)} + tip * ${f(T.tipGain)}), min((line + glow) * tail * fade * mask, ${f(T.maxAlpha)}));
  }
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float radius = length(p);
  vec2 q = vec2(dot(p, vec2(${f(B.tilt.cos)}, ${f(-B.tilt.sin)})), dot(p, vec2(${f(B.tilt.sin)}, ${f(B.tilt.cos)})));
  float edge = max(fwidth(radius), ${f(B.aaMin)});
  float core = 1.0 - smoothstep(${f(B.horizon)} - edge, ${f(B.horizon)} + edge, radius);
  vec4 image = vec4(0.0);

  vec3 flow = filaments(p, uTime);
  // 外围仅保留稀薄光晕，让黑影、薄盘和透镜拱决定轮廓。
  float envelope = smoothstep(${v3(B.envelope.in)}, radius) * (1.0 - smoothstep(${v3(B.envelope.out)}, radius));
  float density = envelope * (${f(B.envelope.base)} + flow.x * ${f(B.envelope.flow)});
  over(image, plasma(flow), density);

  // The rear disk is hidden by the horizon; its bent image rises over it.
  vec2 diskPoint = vec2(q.x, q.y / ${f(D.squash)});
  float diskRadius = length(diskPoint);
  vec3 diskFlow = filaments(diskPoint, uTime * ${f(D.speed)});
  float diskMask = smoothstep(${v3(D.inner)}, diskRadius)
    * (1.0 - smoothstep(${v3(D.outer)}, diskRadius));
  float diskAlpha = diskMask * min(${f(D.alpha)} + ${f(D.flow)} * diskFlow.x, ${f(D.maxAlpha)});
  float approaching = 1.0 - smoothstep(${f(-D.approach)}, ${f(D.approach)}, q.x);
  vec3 diskColor = plasma(diskFlow) * mix(vec3(${v3(D.receding)}), vec3(${v3(D.toward)}), approaching);
  diskColor *= mix(${v3(D.gain)}, approaching);
  float front = 1.0 - smoothstep(${f(-D.front)}, ${f(D.front)}, q.y);
  over(image, diskColor, diskAlpha * (1.0 - front));

  // 拱顶必须在黑影之外，否则后续核心遮罩会把远侧盘面的透镜像吞掉。
  vec2 lensPoint = vec2(q.x, (q.y - ${f(L.lift)}) / ${f(L.squash)});
  float lensRadius = length(lensPoint);
  vec3 lensFlow = filaments(lensPoint * ${f(L.scale)}, uTime * ${f(L.speed)});
  float arcWidth = max(fwidth(lensRadius), ${f(L.minWidth)});
  float arc = (1.0 - smoothstep(${f(L.width[0])}, ${f(L.width[1])} + arcWidth, abs(lensRadius - ${f(L.radius)})))
    * smoothstep(${v3(L.rise)}, q.y);
  vec3 arcColor = plasma(lensFlow) * mix(vec3(${v3(L.receding)}), vec3(${v3(L.toward)}), approaching);
  over(image, arcColor * mix(${v3(L.gain)}, approaching), arc * (${f(L.alpha)} + ${f(L.flow)} * lensFlow.x));
  float secondary = exp(-abs(length(vec2(q.x, (q.y - ${f(B.secondary.lift)}) / ${f(B.secondary.squash)})) - ${f(B.secondary.radius)}) * ${f(B.secondary.sharp)})
    * (1.0 - smoothstep(${f2(B.secondary.below)}, 0.0, q.y));
  over(image, arcColor * ${f(B.secondary.gain)}, secondary * ${f(B.secondary.alpha)});

  float photonDistance = abs(radius - ${f(P.radius)});
  float photon = 1.0 - smoothstep(${f(P.width[0])}, ${f(P.width[1])} + edge, photonDistance);
  float halo = exp(-photonDistance * ${f(P.halo)}) * (1.0 - core);
  over(image, vec3(${v3(P.haloColor)}), halo * ${f(P.haloAlpha)});
  over(image, mix(vec3(${v3(P.warm)}), vec3(${v3(P.cool)}), flow.z), photon * ${f(P.alpha)});
  over(image, vec3(0.0), core);

  // 风格化外流，不将视界内部的光迹当作物理上的光逃逸。
  escapeTrails(image, q);
  over(image, diskColor * ${f(D.frontGain)}, diskAlpha * front);

  if (image.a < ${f(B.cut)}) discard;
  gl_FragColor = vec4(image.rgb / image.a, image.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Shared procedural accretion flow for the game, previews and home scene. */
export function createFortressBlackhole() {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    name: 'facility-blackhole',
    uniforms: { uTime: time },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: BLACKHOLE_FRAGMENT,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  material.userData.noLightMap = true;
  material.userData.noCloudShadow = true;
  material.userData.noPrecip = true;
  const geometry = new THREE.PlaneGeometry(24, 24);
  const root = new THREE.Mesh(geometry, material);
  root.name = 'fortress-black-hole';
  const { x, y, z } = FORTRESS_BLACKHOLE.position;
  root.position.set(x, y, z);
  return {
    root,
    update(value: number): void { time.value = value; },
    dispose(): void {
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
