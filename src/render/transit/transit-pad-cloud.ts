import * as THREE from 'three';
import { TRANSIT } from '../../config/transit.ts';
import { mulberry32 } from '../../core/rng.ts';
import { glslShort as g } from './transit-exhaust.ts';

const CLOUD_COUNT = 96;

/** 发射台蒸汽云着色器参数（GLSL 与 WebGPU 节点版本共用）；[a, b] 为 smoothstep 区间或 a + b * x。 */
export const PAD_CLOUD_SHADER = {
  hash: { scale: .1031, offset: 33.33 },
  minAlpha: .002,
  flow: { scale: 2.2, speed: .14 },
  detail: { scale: 2.6, offset: [3.1, 8.7], speed: .13 },
  edge: { billow: .42, detail: .15 },
  density: { base: 1.1, billow: .8, detail: .3 },
  opacity: 9, soft: .5, cut: .005, coreCut: .94,
  fold: { base: .72, billow: .18, detail: .05, normal: .3 },
  floor: .025, ambient: .16, hemi: .2,
  sun: { base: .035, transmission: .85, extinction: 1.35 },
  inner: { range: [4, 22], dim: .16 },
  folds: { range: [.2, .78], billow: .82, detail: .18, shade: .64 },
  point: .22,
  smoke: [[.76, .8, .83], [.92, .94, .94]],
  grain: [.93, .1],
} as const;
const C = PAD_CLOUD_SHADER;
// The smoke colour keeps its two-digit spelling (.80) so the generated GLSL text is unchanged.
const smoke = (c: readonly number[]): string => `vec3(${c.map(x => x.toFixed(2).slice(1)).join(', ')})`;

const CLOUD_VERTEX = /* glsl */`
  attribute vec3 aCenter;
  attribute vec3 aShape;
  attribute vec2 aCloud;
  varying vec2 vQ;
  varying vec3 vShape;
  varying vec3 vCenter;
  varying vec3 vWorldCenter;
  varying vec2 vCloud;
  void main() {
    vQ = position.xy;
    vShape = aShape;
    vCloud = aCloud;
    vCenter = (modelViewMatrix * vec4(aCenter, 1.0)).xyz;
    vWorldCenter = (modelMatrix * vec4(aCenter, 1.0)).xyz;
    gl_Position = projectionMatrix * vec4(vCenter + vec3(position.xy * aShape.xy, 0.0), 1.0);
  }
`;

const CLOUD_FRAGMENT = /* glsl */`
  #include <common>
  #ifndef CLOUD_CORE
    #include <lights_pars_begin>
  #endif
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSourceX;
  uniform float uFloorY;
  varying vec2 vQ;
  varying vec3 vShape;
  varying vec3 vCenter;
  varying vec3 vWorldCenter;
  varying vec2 vCloud;
  float cloudHash(vec3 p) {
    p = fract(p * ${g(C.hash.scale)});
    p += dot(p, p.yzx + ${g(C.hash.offset)});
    return fract((p.x + p.y) * p.z);
  }
  float cloudNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(cloudHash(i), cloudHash(i + vec3(1, 0, 0)), f.x),
      mix(cloudHash(i + vec3(0, 1, 0)), cloudHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(cloudHash(i + vec3(0, 0, 1)), cloudHash(i + vec3(1, 0, 1)), f.x),
      mix(cloudHash(i + vec3(0, 1, 1)), cloudHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  void main() {
    if (vCloud.x < ${g(C.minAlpha)}) discard;
    vec3 flow = vec3(vQ * ${g(C.flow.scale)}, vCloud.y + uTime * ${g(C.flow.speed)});
    float billow = cloudNoise(flow);
    float detail = cloudNoise(flow * ${g(C.detail.scale)} + vec3(${g(C.detail.offset[0])}, -uTime * ${g(C.detail.speed)}, ${g(C.detail.offset[1])}));
    float r = length(vQ) + (billow - .5) * ${g(C.edge.billow)} + (detail - .5) * ${g(C.edge.detail)};
    if (r >= 1.0) discard;
    float thickness = sqrt(max(0.0, 1.0 - r * r));
    float density = ${g(C.density.base)} + billow * ${g(C.density.billow)} + detail * ${g(C.density.detail)};
    float alpha = (1.0 - exp(-thickness * density * ${g(C.opacity)}))
      * smoothstep(0.0, ${g(C.soft)}, thickness) * vCloud.x;
    if (alpha < ${g(C.cut)}) discard;
    #ifdef CLOUD_CORE
      if (alpha < ${g(C.coreCut)}) discard;
      alpha = 1.0;
    #endif

    float foldedDepth = thickness * (${g(C.fold.base)} + billow * ${g(C.fold.billow)} + detail * ${g(C.fold.detail)});
    vec3 surface = vCenter + vec3(vQ * vShape.xy, foldedDepth * vShape.z);
    vec3 surfaceOffset = transpose(mat3(viewMatrix)) * (surface - vCenter);
    vec3 worldSurface = vWorldCenter + surfaceOffset;
    if (worldSurface.y < uFloorY) discard;
    vec4 clip = projectionMatrix * vec4(surface, 1.0);
    gl_FragDepth = (clip.z / clip.w) * .5 + .5;
    #ifdef CLOUD_CORE
      gl_FragColor = vec4(0.0);
    #else
    vec3 foldedNormal = normalize(cross(dFdx(surface), dFdy(surface)));
    foldedNormal *= foldedNormal.z < 0.0 ? -1.0 : 1.0;
    vec3 sphereNormal = normalize(vec3(vQ / vShape.xy, thickness / vShape.z));
    vec3 normal = normalize(mix(sphereNormal, foldedNormal, ${g(C.fold.normal)}));

    // Extinction through each billow makes its sunward rim brighter than its dense inner face.
    vec3 lighting = vec3(${g(C.floor)}) + ambientLightColor * ${g(C.ambient)};
    #if NUM_HEMI_LIGHTS > 0
      for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
        float up = dot(normal, hemisphereLights[i].direction) * .5 + .5;
        lighting += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, up) * ${g(C.hemi)};
      }
    #endif
    #if NUM_DIR_LIGHTS > 0
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        float facing = dot(normal, directionalLights[i].direction);
        float transmission = exp(-(1.0 - facing) * thickness * density * ${g(C.sun.extinction)});
        lighting += directionalLights[i].color * (${g(C.sun.base)} + transmission * ${g(C.sun.transmission)});
      }
    #endif
    float inner = 1.0 - smoothstep(${g(C.inner.range[0])}, ${g(C.inner.range[1])}, abs(vWorldCenter.x - uSourceX));
    float folds = smoothstep(${g(C.folds.range[0])}, ${g(C.folds.range[1])}, billow * ${g(C.folds.billow)} + detail * ${g(C.folds.detail)});
    lighting *= mix(${g(C.folds.shade)}, 1.0, folds) * (1.0 - inner * ${g(C.inner.dim)});

    // Engine point lights illuminate the inward faces with the same falloff as the steel gantry.
    #if NUM_POINT_LIGHTS > 0
      for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
        vec3 delta = pointLights[i].position - surface;
        float distanceToLight = max(length(delta), .01);
        float facing = max(0.0, dot(normal, delta / distanceToLight));
        float attenuation = getDistanceAttenuation(distanceToLight,
          pointLights[i].distance, pointLights[i].decay);
        lighting += pointLights[i].color * attenuation * facing * facing * ${g(C.point)};
      }
    #endif
    vec3 smoke = mix(${smoke(C.smoke[0])}, ${smoke(C.smoke[1])}, billow);
    smoke *= lighting * (${g(C.grain[0])} + detail * ${g(C.grain[1])});
    gl_FragColor = vec4(smoke, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #endif
  }
`;

/** Ground-anchored billows keep their mass after the engines climb away from the pad. */
export function createTransitPadCloud(root: THREE.Group) {
  const plane = new THREE.PlaneGeometry(2.7, 2.7);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(plane.index);
  geometry.setAttribute('position', plane.getAttribute('position'));
  plane.dispose();
  geometry.instanceCount = CLOUD_COUNT;
  const centers = new THREE.InstancedBufferAttribute(new Float32Array(CLOUD_COUNT * 3), 3);
  const shapes = new THREE.InstancedBufferAttribute(new Float32Array(CLOUD_COUNT * 3), 3);
  const clouds = new THREE.InstancedBufferAttribute(new Float32Array(CLOUD_COUNT * 2), 2);
  for (const attribute of [centers, shapes, clouds]) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aCenter', centers);
  geometry.setAttribute('aShape', shapes);
  geometry.setAttribute('aCloud', clouds);
  const material = new THREE.ShaderMaterial({
    name: 'transit-pad-cloud',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
      uTime: { value: 0 }, uSourceX: { value: 0 }, uFloorY: { value: 0 },
    }]),
    vertexShader: CLOUD_VERTEX, fragmentShader: CLOUD_FRAGMENT,
    lights: true, transparent: true, depthWrite: false,
  });
  const cloud = new THREE.Mesh(geometry, material);
  cloud.name = 'opaque rolling launch steam with sun and engine scattering';
  cloud.position.x = TRANSIT.rocketX;
  cloud.frustumCulled = false;
  cloud.visible = false;
  root.add(cloud);
  // Dense cores write only depth; the soft color pass shades each visible billow once.
  const coreMaterial = material.clone();
  coreMaterial.uniforms = material.uniforms;
  coreMaterial.defines = { CLOUD_CORE: true };
  coreMaterial.transparent = false;
  coreMaterial.depthWrite = true;
  coreMaterial.colorWrite = false;
  coreMaterial.lights = false;
  const core = new THREE.Mesh(geometry, coreMaterial);
  core.name = 'depth writing dense launch cloud cores';
  core.position.copy(cloud.position);
  core.frustumCulled = false;
  core.visible = false;
  root.add(core);
  const rng = mulberry32(0x70c10d);
  const clusters = Array.from({ length: CLOUD_COUNT / 3 }, (_, i) => ({
    birth: Math.floor(i / 8) * .72 + (i % 8) * .045,
    angle: i * 2.399963 + rng() * .35,
    reach: 5.5 + rng() * 17,
    size: 2.4 + rng() * 2.5,
    lift: 1.2 + rng() * 3.7,
    speed: .22 + rng() * .18,
  }));
  const billows = clusters.flatMap(cluster => Array.from({ length: 3 }, (_, kind) => ({
    ...cluster, kind,
    birth: cluster.birth + kind * .2,
    size: cluster.size * (kind === 2 ? .4 : kind === 0 ? 1 : .86),
    aspect: kind === 0 ? .45 + rng() * .2 : .75 + rng() * .5,
    offset: (rng() - .5) * 2.4,
    seed: rng() * 83,
    position: new THREE.Vector3(), shape: new THREE.Vector3(1, 1, 1), alpha: 0, depth: 0,
  })));
  const sorted = [...billows];
  const modelView = new THREE.Matrix4();
  const viewCenter = new THREE.Vector3();
  cloud.onBeforeRender = (_renderer, _scene, camera) => {
    modelView.multiplyMatrices(camera.matrixWorldInverse, cloud.matrixWorld);
    // The cloud sits on the pad, so its world origin is both the engine axis and the ground plane.
    material.uniforms.uSourceX!.value = cloud.matrixWorld.elements[12];
    material.uniforms.uFloorY!.value = cloud.matrixWorld.elements[13] + .08;
  };
  core.onBeforeRender = cloud.onBeforeRender;
  return {
    update(burnTime: number): void {
      cloud.visible = core.visible = burnTime > 0;
      material.uniforms.uTime!.value = burnTime;
      for (const billow of billows) {
        const age = Math.max(0, burnTime - billow.birth);
        const expansion = 1 - Math.exp(-age * billow.speed * 1.3);
        const radius = .55 + billow.size * expansion;
        const travel = billow.reach * (1 - Math.exp(-age * billow.speed));
        const rise = THREE.MathUtils.smoothstep(age, 1, 11) * billow.lift;
        const roll = age * .42 + billow.seed;
        billow.shape.set(radius * (billow.kind === 0 ? 1.18 : .92), radius * billow.aspect, radius * .85);
        const height = billow.kind === 0 ? billow.shape.y * .52
          : billow.kind === 1 ? billow.shape.y * .7 + rise * .7
            : billow.shape.y + expansion * (1.6 + billow.size) + rise;
        billow.position.set(Math.cos(billow.angle) * travel + billow.offset * expansion
          + Math.sin(roll) * expansion * .65,
          height + .05,
          Math.sin(billow.angle) * travel * .35 + Math.cos(roll) * expansion * .45);
        billow.alpha = THREE.MathUtils.smoothstep(age, 0, .65)
          * (1 - THREE.MathUtils.smoothstep(age, 10, 23));
        billow.depth = viewCenter.copy(billow.position).applyMatrix4(modelView).z;
      }
      sorted.sort((a, b) => a.depth - b.depth);
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const billow = sorted[i]!;
        centers.setXYZ(i, billow.position.x, billow.position.y, billow.position.z);
        shapes.setXYZ(i, billow.shape.x, billow.shape.y, billow.shape.z);
        clouds.setXY(i, billow.alpha, billow.seed);
      }
      centers.needsUpdate = shapes.needsUpdate = clouds.needsUpdate = true;
    },
  };
}
