import * as THREE from 'three';
import { glslFloat as f } from '../sky/wind.ts';

/**
 * 爆发着色器：蓄力（charge）时收拢的光核与旋转聚能环；释放（release）后的冲击壳、撕裂、射线、闪光与十字光，
 * 以及合成权重与颜色。宽度为高斯核的标准宽度，freq/speed 分别乘角度与 time。WebGPU 节点版本同表。
 */
export const LUMA_BURST_SHADER = {
  charge: { coreRadius: [0.42, 0.16], hot: 0.6, gatherFrom: 1.5, gatherPull: 1.3, gatherWidth: 0.035, spokes: 2, spin: 14, spokePow: 6, energy: 0.5, fringe: 4 },
  release: {
    fade: [0.1, 0.55],
    reach: { base: 0.25, span: 4.8, rate: 6.5 },
    ripples: [{ freq: 31, speed: 8, amp: 0.012 }, { freq: 47, speed: 11, amp: 0.008 }],
    shellWidth: 0.055,
    wake: { lag: 0.975, width: 0.12 },
    tears: { edge: [-0.15, 0.6], freq: 3, phase: 0.8, freq2: 7, amp2: 0.35 },
    rays: { freq: 11, phase: 0.6, pow: 90, powRadius: 25, gain: 1.8 },
    rayLength: { base: 0.85, amp: 0.25, freq: 7 },
    rayBody: { inner: 0.12, outer: 0.4, tail: 0.45 },
    flash: 10,
    nucleus: { base: 0.14, grow: 0.8, decay: 7, gain: 2.8 },
    crown: { base: 0.55, amp: 0.45, freq: 8, phase: 0.3, pow: 8 },
    core: { base: 0.35, grow: 1.6, rate: 23, decay: 4.5, inner: 0.45 },
    impact: 2.2,
    cross: { sharp: 28, along: 0.7, sharp2: 35, along2: 1.3 },
    fringe: 0.5,
  },
  energyMix: 0.85,
  fringeMix: 0.3,
  cut: 0.004,
  blue: [0.025, 0.65, 1.6],
  cyan: [0.6, 2.4, 3.2],
  white: [2.8, 3.2, 3.6],
} as const;
const B = LUMA_BURST_SHADER;
const C = B.charge;
const R = B.release;
const vec3 = (c: readonly number[]): string => `vec3(${c.map(f).join(', ')})`;

/** 连续的光核与冲击前沿，避免爆炸在远景里碎成点阵。 */
export function createLumaBurst() {
  const material = new THREE.ShaderMaterial({
    name: 'luma-burst',
    uniforms: { time: { value: 0 }, charge: { value: 0 }, released: { value: false } },
    vertexShader: /* glsl */`
      varying vec2 vPoint;
      void main() {
        vPoint = position.xy;
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * (center + vec4(position.xy, 0.0, 0.0));
      }
    `,
    fragmentShader: /* glsl */`
      uniform float time;
      uniform float charge;
      uniform bool released;
      varying vec2 vPoint;
      float gaussian(float distance) { return exp(-distance * distance); }
      void main() {
        vec2 p = vPoint;
        float r = length(p);
        float a = atan(p.y, p.x);
        float hot;
        float energy;
        float fringe;
        float brightness;
        if (!released) {
          float coreRadius = mix(${f(C.coreRadius[0])}, ${f(C.coreRadius[1])}, charge);
          hot = exp(-r * r / (coreRadius * coreRadius)) * (${f(C.hot)} + charge);
          float gather = gaussian((r - (${f(C.gatherFrom)} - charge * ${f(C.gatherPull)})) / ${f(C.gatherWidth)});
          energy = gather * pow(max(0.0, cos(a * ${f(C.spokes)} + time * ${f(C.spin)})), ${f(C.spokePow)}) * charge * ${f(C.energy)};
          fringe = exp(-r * ${f(C.fringe)}) * charge;
          brightness = hot;
        } else {
          float fade = 1.0 - smoothstep(${f(R.fade[0])}, ${f(R.fade[1])}, time);
          float reach = ${f(R.reach.base)} + ${f(R.reach.span)} * (1.0 - exp(-time * ${f(R.reach.rate)}));
          float ripple = sin(a * ${f(R.ripples[0].freq)} + time * ${f(R.ripples[0].speed)}) * ${f(R.ripples[0].amp)}
            + sin(a * ${f(R.ripples[1].freq)} - time * ${f(R.ripples[1].speed)}) * ${f(R.ripples[1].amp)};
          float edge = reach * (1.0 + ripple);
          float shell = gaussian((r - edge) / ${f(R.shellWidth)});
          float wake = gaussian((r - edge * ${f(R.wake.lag)}) / ${f(R.wake.width)});
          float tears = smoothstep(${f(R.tears.edge[0])}, ${f(R.tears.edge[1])}, sin(a * ${f(R.tears.freq)} + ${f(R.tears.phase)}) + sin(a * ${f(R.tears.freq2)}) * ${f(R.tears.amp2)});
          float rays = pow(max(0.0, cos(a * ${f(R.rays.freq)} + ${f(R.rays.phase)})), ${f(R.rays.pow)} + r * ${f(R.rays.powRadius)});
          float rayLength = reach * (${f(R.rayLength.base)} + ${f(R.rayLength.amp)} * sin(a * ${f(R.rayLength.freq)}));
          float rayBody = smoothstep(reach * ${f(R.rayBody.inner)}, reach * ${f(R.rayBody.outer)}, r)
            * (1.0 - smoothstep(rayLength * ${f(R.rayBody.tail)}, rayLength, r));
          float flash = exp(-time * ${f(R.flash)});
          float nucleus = exp(-r * r / (${f(R.nucleus.base)} + time * ${f(R.nucleus.grow)}));
          float crown = ${f(R.crown.base)} + ${f(R.crown.amp)} * pow(max(0.0, cos(a * ${f(R.crown.freq)} + ${f(R.crown.phase)})), ${f(R.crown.pow)});
          float coreRadius = (${f(R.core.base)} + ${f(R.core.grow)} * (1.0 - exp(-time * ${f(R.core.rate)}))) * exp(-time * ${f(R.core.decay)});
          float impact = 1.0 - smoothstep(coreRadius * crown * ${f(R.core.inner)}, coreRadius * crown, r);
          float cross = exp(-abs(p.y) * ${f(R.cross.sharp)} - abs(p.x) * ${f(R.cross.along)})
            + exp(-abs(p.x) * ${f(R.cross.sharp2)} - abs(p.y) * ${f(R.cross.along2)});
          hot = nucleus * exp(-time * ${f(R.nucleus.decay)}) * ${f(R.nucleus.gain)} + impact * ${f(R.impact)} + cross * flash;
          energy = (shell * tears + rays * rayBody * ${f(R.rays.gain)}) * fade;
          fringe = wake * tears * fade * ${f(R.fringe)};
          brightness = max(shell * tears, rays * rayBody);
        }
        float alpha = min(1.0, hot + energy * ${f(B.energyMix)} + fringe * ${f(B.fringeMix)});
        if (alpha < ${f(B.cut)}) discard;
        vec3 blue = ${vec3(B.blue)};
        vec3 cyan = ${vec3(B.cyan)};
        vec3 color = mix(blue, cyan, clamp(brightness, 0.0, 1.0));
        color = mix(color, ${vec3(B.white)}, clamp(hot, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), material);
  mesh.renderOrder = 4;
  return mesh;
}
