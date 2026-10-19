import * as THREE from 'three';
import { glslFloat } from './wind.ts';

/** GLSL 浮点字面量，沿用 transit 着色器省略前导 0 的写法（.5），生成的着色器文本与手写时一致。 */
export const glslShort = (n: number): string => glslFloat(n).replace(/^0\./, '.');
/** GLSL vec3 字面量。 */
export const glslVec3 = (c: readonly number[]): string => `vec3(${c.map(glslShort).join(', ')})`;

/** 值噪声的哈希系数（喷焰、巡航尾流、时间走廊共用的写法）。 */
export const TRANSIT_HASH = { x: 127.1, y: 311.7, scale: 43758.5453 } as const;

/**
 * 发射喷焰着色器参数（GLSL 与 WebGPU 节点版本共用）。成对值：smoothstep 区间，或 mix(单喷管, 合流, uMerged) 的两端；
 * [基值, 斜率] 为 基值 + t * 斜率。
 */
export const PLUME_SHADER = {
  coarse: { lateral: 1.8, axial: .72, speed: 9 },
  medium: { lateral: 4.8, offset: 21.3, axial: 2.1, speed: 18 },
  fine: { lateral: 12, offset: 8.2, axial: 5.1, speed: 31 },
  flowWeights: [.5, .33, .17],
  mixing: [.12, .85],
  drift: { axial: .37, speed: 2, seed: 17.1, amount: .12 },
  cell: { length: 1.45, stretch: .72, offsetSeed: 4.7, offset: .16, sharpness: 95, brightSeed: 9.3, bright: [.72, .28] },
  core: {
    single: [.32, .27], merged: [1.78, .27], swell: [.05, .55], ragged: [.3, .17], squeeze: [.16, .055], inner: .8,
    breakup: [.72, .28], breakupFlow: [.24, .66], end: [.45, .6], endHi: .97, endJitter: .13, pulse: [.85, .15],
  },
  sheath: {
    single: [.5, .66], merged: [2.3, 1.4], swell: [.1, .96], ragged: [.86, .22], inner: .64, soft: .07,
    breakup: [.2, .68], tail: [.45, .74], tailJitter: .15, glow: [.48, .4],
  },
  joinAxial: .8,
  alpha: { max: .97, core: .92, combustion: .72, power: 1.8, cut: .004, coreCut: .65, opaqueCut: .94 },
  fire: [[3.4, .64, .07], [4.8, 1.85, .34]],
  throat: { axial: [.35, 2], color: [1.45, 1.4, 3.1], mix: .78 },
  whiteHeat: [.12, .7],
  white: [5.8, 5.2, 5.5],
  shockGlow: [.4, .5, .65],
} as const;
const P = PLUME_SHADER, H = TRANSIT_HASH, g = glslShort, v3 = glslVec3;
const HASH_GLSL = `float hash(vec2 p) { return fract(sin(dot(p, vec2(${g(H.x)}, ${g(H.y)}))) * ${g(H.scale)}); }`;

/** floorY: world height below which the flame is clipped, so ground contact reads as a flat cut. */
export function createPlume(parent: THREE.Object3D, width: number, merged: boolean, floorY: number) {
  const root = new THREE.Group();
  root.name = merged ? 'combined high pressure engine plume' : 'short individual nozzle jet';
  parent.add(root);
  const geometry = new THREE.PlaneGeometry(width, 1);
  geometry.translate(0, -.5, 0);
  const material = new THREE.ShaderMaterial({
    name: 'transit-plume',
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uLength: { value: 1 },
      uWidth: { value: width }, uMerged: { value: Number(merged) }, uFloorY: { value: floorY } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vWorldY;
      void main() {
        vUv = uv;
        vWorldY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uPower;
      uniform float uLength;
      uniform float uWidth;
      uniform float uMerged;
      uniform float uFloorY;
      varying vec2 vUv;
      varying float vWorldY;
      ${HASH_GLSL}
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        if (vWorldY < uFloorY) discard;
        float t = 1.0 - vUv.y;
        float axial = t * uLength;
        float lateral = (vUv.x - .5) * uWidth;
        float coarse = noise(vec2(lateral * ${g(P.coarse.lateral)}, axial * ${g(P.coarse.axial)} - uTime * ${g(P.coarse.speed)}));
        float medium = noise(vec2(lateral * ${g(P.medium.lateral)} + ${g(P.medium.offset)}, axial * ${g(P.medium.axial)} - uTime * ${g(P.medium.speed)}));
        float fine = noise(vec2(lateral * ${g(P.fine.lateral)} - ${g(P.fine.offset)}, axial * ${g(P.fine.axial)} - uTime * ${g(P.fine.speed)}));
        float flow = coarse * ${g(P.flowWeights[0])} + medium * ${g(P.flowWeights[1])} + fine * ${g(P.flowWeights[2])};
        float mixing = smoothstep(${g(P.mixing[0])}, ${g(P.mixing[1])}, t);
        float drift = (noise(vec2(axial * ${g(P.drift.axial)} - uTime * ${g(P.drift.speed)}, ${g(P.drift.seed)})) - .5) * mixing * ${g(P.drift.amount)};
        float x = abs(lateral + drift);

        float cell = axial / (${g(P.cell.length)} + t * ${g(P.cell.stretch)});
        float cellIndex = floor(cell);
        float cellOffset = (hash(vec2(cellIndex, ${g(P.cell.offsetSeed)})) - .5) * ${g(P.cell.offset)};
        float cellPhase = fract(cell) - .5 + cellOffset;
        float compression = exp(-cellPhase * cellPhase * ${g(P.cell.sharpness)}) * (${g(P.cell.bright[0])} + ${g(P.cell.bright[1])} * hash(vec2(cellIndex, ${g(P.cell.brightSeed)})));
        float coreRadius = mix(${g(P.core.single[0])} + t * ${g(P.core.single[1])}, ${g(P.core.merged[0])} + ${g(P.core.merged[1])} * smoothstep(${g(P.core.swell[0])}, ${g(P.core.swell[1])}, t), uMerged);
        coreRadius += ((medium - .5) * ${g(P.core.ragged[0])} + (fine - .5) * ${g(P.core.ragged[1])}) * uMerged;
        coreRadius *= 1.0 - compression * mix(${g(P.core.squeeze[0])}, ${g(P.core.squeeze[1])}, uMerged);
        float core = 1.0 - smoothstep(coreRadius * ${g(P.core.inner)}, coreRadius, x);
        float coreBreakup = mix(1.0, ${g(P.core.breakup[0])} + ${g(P.core.breakup[1])} * smoothstep(${g(P.core.breakupFlow[0])}, ${g(P.core.breakupFlow[1])}, flow), mixing * uMerged);
        core *= coreBreakup * (1.0 - smoothstep(mix(${g(P.core.end[0])}, ${g(P.core.end[1])}, uMerged), ${g(P.core.endHi)}, t + (medium - .5) * mixing * ${g(P.core.endJitter)}));
        core *= ${g(P.core.pulse[0])} + compression * ${g(P.core.pulse[1])};

        // Only the short throat jets remain separate; the downstream flow has one shared axis.
        float radius = mix(${g(P.sheath.single[0])} + t * ${g(P.sheath.single[1])}, ${g(P.sheath.merged[0])} + ${g(P.sheath.merged[1])} * smoothstep(${g(P.sheath.swell[0])}, ${g(P.sheath.swell[1])}, t), uMerged);
        float raggedRadius = radius + ((coarse - .5) * ${g(P.sheath.ragged[0])} + (fine - .5) * ${g(P.sheath.ragged[1])}) * mixing;
        float sheath = 1.0 - smoothstep(raggedRadius * ${g(P.sheath.inner)}, raggedRadius + ${g(P.sheath.soft)}, x);
        float breakup = mix(1.0, smoothstep(${g(P.sheath.breakup[0])}, ${g(P.sheath.breakup[1])}, flow), mixing);
        float tail = 1.0 - smoothstep(mix(${g(P.sheath.tail[0])}, ${g(P.sheath.tail[1])}, uMerged) + coarse * ${g(P.sheath.tailJitter)}, 1.0, t);
        float combustion = sheath * breakup * tail * (${g(P.sheath.glow[0])} + flow * ${g(P.sheath.glow[1])});
        float join = mix(1.0, smoothstep(0.0, ${g(P.joinAxial)}, axial), uMerged);
        float alpha = min(${g(P.alpha.max)}, (core * ${g(P.alpha.core)} + combustion * ${g(P.alpha.combustion)}) * min(1.0, uPower * ${g(P.alpha.power)})) * join;
        if (alpha < ${g(P.alpha.cut)}) discard;
        #ifdef PLUME_CORE
          if (core < ${g(P.alpha.coreCut)} || alpha < ${g(P.alpha.opaqueCut)}) discard;
        #endif
        vec3 mixedFire = mix(${v3(P.fire[0])}, ${v3(P.fire[1])}, flow);
        float coolThroat = (1.0 - smoothstep(${g(P.throat.axial[0])}, ${g(P.throat.axial[1])}, axial)) * (1.0 - uMerged);
        vec3 flame = mix(mixedFire, ${v3(P.throat.color)}, coolThroat * ${g(P.throat.mix)});
        float whiteHeat = smoothstep(${g(P.whiteHeat[0])}, ${g(P.whiteHeat[1])}, core);
        flame = mix(flame, ${v3(P.white)}, whiteHeat);
        flame += ${v3(P.shockGlow)} * compression * core;
        gl_FragColor = vec4(flame, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    toneMapped: false, blending: THREE.NormalBlending,
  });
  // The dense core supplies its own depth so background AO and reflections cannot stain the flame.
  const coreMaterial = material.clone();
  coreMaterial.uniforms = material.uniforms;
  coreMaterial.defines = { PLUME_CORE: true };
  coreMaterial.transparent = false;
  coreMaterial.depthWrite = true;
  coreMaterial.colorWrite = false;
  for (let i = 0; i < 3; i++) {
    const sheet = new THREE.Mesh(geometry, material);
    sheet.name = merged ? 'unified white hot core and fragmented mixing layer' : 'nozzle exit pressure core';
    sheet.rotation.y = i * Math.PI / 3;
    sheet.frustumCulled = false;
    root.add(sheet);
    const coreSheet = new THREE.Mesh(geometry, coreMaterial);
    coreSheet.rotation.copy(sheet.rotation);
    coreSheet.frustumCulled = false;
    root.add(coreSheet);
  }
  return {
    root,
    update(time: number, power: number, length: number): void {
      root.visible = power > .002;
      const widthScale = .82 + power * .18;
      root.scale.set(widthScale, length, widthScale);
      material.uniforms.uTime!.value = time;
      material.uniforms.uPower!.value = power;
      material.uniforms.uLength!.value = length;
    },
  };
}

/** 巡航尾流着色器参数（GLSL 与 WebGPU 节点版本共用）；截面种类 0 核心、1 外鞘、2 马赫环。 */
export const CRUISE_SHADER = {
  machSpan: 11,
  seed: { x: 2.7, z: 4.1 },
  machDrift: { speed: 1.3, jitter: 1.2 },
  radius: { core: .5, sheath: [.6, .085], mach: [.46, .04] },
  core: { falloff: 9, fade: [3.6, .75], color: [.62, .82, 1.65], flicker: { base: .38, amount: .08, rate: 47, depth: 3 } },
  sheath: {
    scale: 2.4, flow: { depth: 1.3, speed: 2.6, swirl: .9, swirlDepth: .7 },
    detail: { scale: 2.6, offset: 7.1, speed: 1.7 }, weights: [.62, .38],
    edge: [.58, .7], wall: [.08, .92], wallRange: [.2, .68], tear: [.22, .62], tearRim: .18,
    fadeIn: [1.2, 3.4], fadeOut: [7, 16.5], fire: [[2.3, .72, .18], [2, .38, .3]], far: [.7, .22, .75], farRange: [4, 14], gain: .24,
  },
  mach: {
    tear: { scale: 2.6, depth: 1.7, speed: 4 }, radius: .56, wobble: [.88, .24], width: .08, tearRange: [.2, .7],
    glow: { amount: .1, falloff: 12 }, flicker: { base: .45, amount: .55, rate: 9, depth: 2.3 }, fadeIn: [.15, .9], fadeOut: 3.5,
    near: [1.15, 1.05, 1.7], far: [1.6, .7, .55], farRange: [1.5, 8], gain: .85,
  },
} as const;
const X = CRUISE_SHADER;

/** 沿各喷管轴的巡航尾流截面，镜头在同轴下方仰视时才读得出纵深；星舰穿越与着陆舱返程共用，长宽随 emitter 缩放。 */
export function createCruiseExhaust(emitters: readonly THREE.Object3D[]) {
  // Cross-sections at real depth along each nozzle axis: a hot core, travelling shock rings and a ragged sheath.
  const CORE = 0, SHEATH = 1, MACH = 2, MACH_SPAN = X.machSpan;
  const sections = [
    ...[.1, .5, 1.1, 1.9, 2.9].map(depth => [depth, CORE] as const),
    ...[.35, 1.2, 2.2, 3.4, 4.8, 6.4, 8.4, 10.6, 13, 15.6].map(depth => [depth, SHEATH] as const),
    ...Array.from({ length: 8 }, (_, i) => [i * MACH_SPAN / 8, MACH] as const),
  ];
  const positions: number[] = [], depths: number[] = [], kinds: number[] = [];
  for (const [depth, kind] of sections) {
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]] as const) {
      positions.push(x, 0, z);
      depths.push(depth);
      kinds.push(kind);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('flowDepth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.setAttribute('flowKind', new THREE.Float32BufferAttribute(kinds, 1));
  const material = new THREE.ShaderMaterial({
    name: 'transit-cruise-exhaust',
    uniforms: { uTime: { value: 0 } },
    defines: { MACH_SPAN: MACH_SPAN.toFixed(2) },
    vertexShader: /* glsl */`
      attribute float flowDepth;
      attribute float flowKind;
      uniform float uTime;
      varying vec2 vP;
      varying float vDepth;
      varying float vKind;
      varying float vRadius;
      varying float vSeed;
      void main() {
        vSeed = modelMatrix[3].x * ${g(X.seed.x)} + modelMatrix[3].z * ${g(X.seed.z)};
        float depth = flowDepth;
        // Shock rings drift toward the camera and wrap once they have faded out.
        if (flowKind > 1.5) depth = mod(flowDepth + uTime * ${g(X.machDrift.speed)} + fract(vSeed) * ${g(X.machDrift.jitter)}, MACH_SPAN);
        float radius = flowKind < .5 ? ${g(X.radius.core)} : flowKind < 1.5 ? ${g(X.radius.sheath[0])} + depth * ${g(X.radius.sheath[1])} : ${g(X.radius.mach[0])} + depth * ${g(X.radius.mach[1])};
        vP = position.xz;
        vDepth = depth;
        vKind = flowKind;
        vRadius = radius;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x * radius, -depth, position.z * radius, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vP;
      varying float vDepth;
      varying float vKind;
      varying float vRadius;
      varying float vSeed;
      ${HASH_GLSL}
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float r = length(vP);
        if (r > 1.0) discard;
        float time = uTime + vSeed;
        vec3 color;
        if (vKind < .5) {
          float core = exp(-r * r * ${g(X.core.falloff)}) * (1.0 - smoothstep(.0, ${g(X.core.fade[0])}, vDepth) * ${g(X.core.fade[1])});
          color = ${v3(X.core.color)} * core * (${g(X.core.flicker.base)} + ${g(X.core.flicker.amount)} * sin(time * ${g(X.core.flicker.rate)} + vDepth * ${g(X.core.flicker.depth)}));
        } else if (vKind < 1.5) {
          vec2 q = vP * vRadius;
          vec2 flow = q * ${g(X.sheath.scale)} + vec2(vDepth * ${g(X.sheath.flow.depth)} - time * ${g(X.sheath.flow.speed)}, time * ${g(X.sheath.flow.swirl)} + vDepth * ${g(X.sheath.flow.swirlDepth)});
          float n = noise(flow) * ${g(X.sheath.weights[0])} + noise(flow * ${g(X.sheath.detail.scale)} + ${g(X.sheath.detail.offset)} - time * ${g(X.sheath.detail.speed)}) * ${g(X.sheath.weights[1])};
          float edge = ${g(X.sheath.edge[0])} + (n - .5) * ${g(X.sheath.edge[1])};
          float body = 1.0 - smoothstep(edge * .5, edge, r);
          // A tube seen end-on brightens toward its wall; the broken edge keeps neighbouring plumes apart.
          float wall = body * (${g(X.sheath.wall[0])} + ${g(X.sheath.wall[1])} * smoothstep(${g(X.sheath.wallRange[0])}, ${g(X.sheath.wallRange[1])}, r)) * smoothstep(${g(X.sheath.tear[0])}, ${g(X.sheath.tear[1])}, n + ${g(X.sheath.tearRim)} * (1.0 - r));
          float fade = smoothstep(${g(X.sheath.fadeIn[0])}, ${g(X.sheath.fadeIn[1])}, vDepth) * (1.0 - smoothstep(${g(X.sheath.fadeOut[0])}, ${g(X.sheath.fadeOut[1])}, vDepth));
          vec3 fire = mix(${v3(X.sheath.fire[0])}, ${v3(X.sheath.fire[1])}, n);
          fire = mix(fire, ${v3(X.sheath.far)}, smoothstep(${g(X.sheath.farRange[0])}, ${g(X.sheath.farRange[1])}, vDepth));
          color = fire * wall * fade * ${g(X.sheath.gain)};
        } else {
          // Shocks are torn and uneven so the seven trains never line up into a regular pattern.
          float tear = noise(vP * ${g(X.mach.tear.scale)} + vec2(vDepth * ${g(X.mach.tear.depth)} + vSeed, time * ${g(X.mach.tear.speed)}));
          float shock = (r - ${g(X.mach.radius)} * (${g(X.mach.wobble[0])} + ${g(X.mach.wobble[1])} * tear)) / ${g(X.mach.width)};
          float ring = exp(-shock * shock) * smoothstep(${g(X.mach.tearRange[0])}, ${g(X.mach.tearRange[1])}, tear)
            + ${g(X.mach.glow.amount)} * exp(-r * r * ${g(X.mach.glow.falloff)});
          float flicker = ${g(X.mach.flicker.base)} + ${g(X.mach.flicker.amount)} * noise(vec2(time * ${g(X.mach.flicker.rate)}, vDepth * ${g(X.mach.flicker.depth)} + vSeed));
          float fade = smoothstep(${g(X.mach.fadeIn[0])}, ${g(X.mach.fadeIn[1])}, vDepth) * (1.0 - smoothstep(${g(X.mach.fadeOut)}, MACH_SPAN, vDepth));
          color = mix(${v3(X.mach.near)}, ${v3(X.mach.far)}, smoothstep(${g(X.mach.farRange[0])}, ${g(X.mach.farRange[1])}, vDepth)) * ring * flicker * fade * ${g(X.mach.gain)};
        }
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    forceSinglePass: true, toneMapped: false, blending: THREE.AdditiveBlending,
  });
  const plumes = emitters.map(emitter => {
    const plume = new THREE.Mesh(geometry, material);
    plume.name = 'turbulent exhaust with shock rings seen along the nozzle axis';
    plume.frustumCulled = false;
    plume.visible = false;
    emitter.add(plume);
    return plume;
  });
  return { update(time: number, active: boolean): void {
    material.uniforms.uTime!.value = time;
    plumes.forEach((plume, i) => {
      plume.visible = active;
      plume.scale.y = 1 + .035 * Math.sin(time * 17 + i * 1.9);
    });
  } };
}

/** Launch plumes merge; the rear chase view resolves the individual ion exhaust volumes. */
export function createRocketExhaust(rocket: THREE.Group, emitters: readonly THREE.Object3D[]) {
  const throats = emitters.map(emitter => createPlume(emitter, 2.6, false, .08));
  const main = createPlume(rocket, 9, true, .08);
  const cruise = createCruiseExhaust(emitters);
  const outlet = emitters.reduce((sum, emitter) => sum.add(emitter.position), new THREE.Vector3()).divideScalar(emitters.length);
  main.root.position.copy(outlet);
  main.root.position.y -= 1.25;
  return {
    update(time: number, power: number, speed: number, travelling: boolean): void {
      const launchPower = travelling ? 0 : power;
      throats.forEach((throat, index) => throat.update(time + index * .19, launchPower, 2.9));
      const pulse = 1 + .008 * Math.sin(time * 53) + .005 * Math.sin(time * 97);
      const length = (3 + 11 * Math.sqrt(power) + Math.min(13, speed * .9)) * pulse;
      main.update(time, launchPower, length - 1.25);
      cruise.update(time, travelling);
    },
  };
}
