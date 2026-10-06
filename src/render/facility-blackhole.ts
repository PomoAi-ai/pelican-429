import * as THREE from 'three';
import { FORTRESS_BLACKHOLE } from '../config/facility-structure.ts';

const BLACKHOLE_FRAGMENT = `
uniform float uTime;
varying vec2 vUv;

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)),
    dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)),
    dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)),
    dot(i + 1.0, vec2(127.1, 311.7)))) * 43758.5453);
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

float thread(float phase) {
  float wave = 0.5 + 0.5 * sin(phase);
  // Derivatives of the periodic wave remain continuous across the polar seam.
  float aa = max(fwidth(wave), 0.025);
  return smoothstep(0.88 - aa, 0.99 + aa, wave);
}

vec3 filaments(vec2 p, float time) {
  float radius = max(length(p), 0.08);
  float angle = atan(p.y, p.x);
  float orbit = angle - time * (0.22 + 0.12 / radius);
  vec2 circle = vec2(cos(orbit), sin(orbit));
  float turbulence = noise(circle * 3.8 + radius * 8.0);
  float detail = noise(circle * 11.0 - radius * 19.0);
  float phase = radius * 260.0 + angle * 3.0 - time * 3.2 + turbulence * 6.0;
  float fine = thread(phase) * (0.24 + 0.76 * detail);
  float medium = thread(radius * 117.0 + angle * 5.0 - time * 2.3 + turbulence * 4.0);
  float wisps = thread(radius * 418.0 - angle * 7.0 + time * 4.7 + detail * 2.0);
  float clusters = 0.35 + 0.65 * noise(circle * 5.0 + radius * 3.0);
  return vec3((fine * 0.8 + medium * 0.35 + wisps * 0.22) * clusters,
    thread(radius * 183.0 + angle * 2.0 - time * 1.7) * detail, turbulence);
}

vec3 plasma(vec3 flow) {
  vec3 color = mix(vec3(0.035, 0.12, 0.32), vec3(0.65, 0.86, 1.15), flow.x);
  color = mix(color, vec3(1.18, 0.83, 0.43), flow.y * 0.48);
  return color + vec3(0.72, 0.85, 1.0) * pow(flow.x, 3.0) * 2.0;
}

void over(inout vec4 image, vec3 color, float alpha) {
  image.rgb = color * alpha + image.rgb * (1.0 - alpha);
  image.a = alpha + image.a * (1.0 - alpha);
}

float hash(float value) {
  return fract(sin(value * 127.1) * 43758.5453);
}

void escapeTrails(inout vec4 image, vec2 p) {
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float pixel = max(fwidth(radius), 0.001);
  for (int i = 0; i < 12; i++) {
    float slot = float(i);
    float cycle = uTime / mix(2.1, 4.3, hash(slot + 1.0)) + hash(slot + 31.0);
    // 一次出生只选一次随机轨迹，避免逐帧噪声把运动变成闪烁。
    float seed = slot * 113.0 + floor(cycle) * 37.0;
    float age = fract(cycle);
    float life = mix(0.48, 0.84, hash(seed + 2.0));
    float progress = min(age / life, 1.0);
    float launch = mix(0.09, 0.30, hash(seed + 3.0));
    float head = launch + (0.98 - launch) * (0.25 * progress + 0.75 * progress * progress);
    float tailLength = mix(0.10, 0.24, hash(seed + 4.0));
    float behind = head - radius;
    float tail = smoothstep(-pixel, pixel, behind)
      * (1.0 - smoothstep(0.0, tailLength, behind));
    float bend = mix(1.2, 3.4, hash(seed + 5.0));
    float pathAngle = hash(seed + 6.0) * 6.2831853
      + bend * (1.0 - exp(-max(radius - launch, 0.0) * 5.0));
    float delta = angle - pathAngle;
    float distance = abs(atan(sin(delta), cos(delta))) * max(radius, 0.05);
    float width = mix(0.0015, 0.0035, hash(seed + 7.0));
    float line = 1.0 - smoothstep(width, width + pixel * 1.5, distance);
    float glow = exp(-distance * 100.0) * 0.18;
    float tipDistance = behind / (pixel * 2.0 + 0.008);
    float tip = exp(-tipDistance * tipDistance);
    float fade = smoothstep(0.0, 0.07, progress) * (1.0 - smoothstep(0.72, 1.0, progress));
    float mask = smoothstep(launch - pixel, launch + pixel, radius)
      * (1.0 - smoothstep(0.88, 0.99, radius));
    vec3 color = mix(vec3(0.48, 0.95, 1.8), vec3(1.7, 0.92, 0.36), hash(seed + 8.0));
    over(image, color * (1.8 + tip * 2.5), min((line + glow) * tail * fade * mask, 0.95));
  }
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float radius = length(p);
  vec2 q = vec2(dot(p, vec2(0.94, -0.342)), dot(p, vec2(0.342, 0.94)));
  float edge = max(fwidth(radius), 0.001);
  float core = 1.0 - smoothstep(0.306 - edge, 0.306 + edge, radius);
  vec4 image = vec4(0.0);

  vec3 flow = filaments(p, uTime);
  // 外围仅保留稀薄光晕，让黑影、薄盘和透镜拱决定轮廓。
  float envelope = smoothstep(0.304, 0.335, radius) * (1.0 - smoothstep(0.42, 0.72, radius));
  float density = envelope * (0.035 + flow.x * 0.12);
  over(image, plasma(flow), density);

  // The rear disk is hidden by the horizon; its bent image rises over it.
  vec2 diskPoint = vec2(q.x, q.y / 0.19);
  float diskRadius = length(diskPoint);
  vec3 diskFlow = filaments(diskPoint, uTime * 1.3);
  float diskMask = smoothstep(0.32, 0.38, diskRadius)
    * (1.0 - smoothstep(0.81, 0.99, diskRadius));
  float diskAlpha = diskMask * min(0.65 + 0.7 * diskFlow.x, 0.98);
  float approaching = 1.0 - smoothstep(-0.55, 0.55, q.x);
  vec3 diskColor = plasma(diskFlow) * mix(vec3(1.35, 0.68, 0.3), vec3(0.8, 1.1, 1.4), approaching);
  diskColor *= mix(0.85, 2.7, approaching);
  float front = 1.0 - smoothstep(-0.004, 0.004, q.y);
  over(image, diskColor, diskAlpha * (1.0 - front));

  // 拱顶必须在黑影之外，否则后续核心遮罩会把远侧盘面的透镜像吞掉。
  vec2 lensPoint = vec2(q.x, (q.y - 0.018) / 0.98);
  float lensRadius = length(lensPoint);
  vec3 lensFlow = filaments(lensPoint * 1.38, uTime * 0.85);
  float arcWidth = max(fwidth(lensRadius), 0.002);
  float arc = (1.0 - smoothstep(0.012, 0.062 + arcWidth, abs(lensRadius - 0.397)))
    * smoothstep(-0.045, 0.07, q.y);
  vec3 arcColor = plasma(lensFlow) * mix(vec3(1.3, 0.73, 0.38), vec3(0.85, 1.1, 1.3), approaching);
  over(image, arcColor * mix(1.2, 3.0, approaching), arc * (0.62 + 0.32 * lensFlow.x));
  float secondary = exp(-abs(length(vec2(q.x, (q.y - 0.02) / 0.91)) - 0.33) * 150.0)
    * (1.0 - smoothstep(-0.10, 0.0, q.y));
  over(image, arcColor * 1.4, secondary * 0.7);

  float photonDistance = abs(radius - 0.316);
  float photon = 1.0 - smoothstep(0.0015, 0.005 + edge, photonDistance);
  float halo = exp(-photonDistance * 75.0) * (1.0 - core);
  over(image, vec3(0.38, 0.54, 0.85), halo * 0.45);
  over(image, mix(vec3(1.3, 1.0, 0.72), vec3(1.15, 1.45, 1.8), flow.z), photon * 0.86);
  over(image, vec3(0.0), core);

  // 风格化外流，不将视界内部的光迹当作物理上的光逃逸。
  escapeTrails(image, q);
  over(image, diskColor * 1.15, diskAlpha * front);

  if (image.a < 0.001) discard;
  gl_FragColor = vec4(image.rgb / image.a, image.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Shared procedural accretion flow for the game, previews and home scene. */
export function createFortressBlackhole() {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
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
