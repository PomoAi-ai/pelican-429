import * as THREE from 'three';
import { TRANSIT, TRANSIT_PULSE_SECONDS } from '../../config/transit.ts';
import { currentViewportHeight } from '../stage/stage.ts';
import { TRANSIT_HASH as H, glslShort as g, glslVec3 as v3 } from './transit-exhaust.ts';

/** 时间走廊着色器参数（GLSL 与 WebGPU 节点版本共用）；[a, b] 为 smoothstep 区间或 a + b * x。 */
export const CORRIDOR_SHADER = {
  tau: 6.28318530718,
  octaves: { weights: [.55, .3, .15], offsets: [3.7, 9.1] },
  calmMotion: .08,
  entry: .8,
  surge: { decay: 3.5, boost: 1.6, reach: .16 },
  travel: { idle: .18, ramp: .656, cruise: .82 },
  lens: .1,
  bend: { rateA: .37, phaseA: 1.3, b: .4, rateB: .83, y: .8, rateY: .29, amount: .22, falloff: 5 },
  depth: { scale: .62, bias: .04 },
  doppler: [.35, 1.9],
  cyan: [.035, .42, 1], violet: [.42, .07, .8], gold: [.95, .56, .2],
  tintCycle: { rate: .24, phase: .8, flow: 2, depth: .55 },
  warm: { range: [.3, .95], rate: .23, progress: .9, phase: 1.6, amount: .5 },
  blueShift: [.8, 1, 1.25], redShift: { keep: .55, add: [.55, .08, .22] },
  twist: { depth: .22, time: .5 },
  swirl: { amount: .35, depth: .55, time: .6 },
  wall: { cells: 20, twist: 3, depth: 1.35, flow: 3.4 },
  near: [.22, 1.3],
  energy: { sharpness: 10, filament: 1.4, glowPow: 4, glow: .6, floor: .02, outer: [2.2, 3.2], outerDim: .5, gain: .5, surge: .8 },
  base: [.004, .008, .026],
  grid: { meridians: 24, twist: 2, depth: 1.6, flow: 4, width: [.02, .03], latWidth: 4, color: [.25, .6, 1], fade: [1.2, 2.6], glow: [.06, .14] },
  core: { split: [1.05, .95], color: [.9, 1, 1.35], falloff: 160, surge: 1.5, haze: [.8, .9, 1.2], hazeMix: .4, hazeFalloff: 3.4, hazeGain: .3 },
  jitter: { a: .006, angleA: 23, speedA: 3, b: .004, angleB: 41, speedB: 5 },
  rings: {
    count: 6, seed: [3.1, 7.7], speed: .42, depth: 6, near: .05, split: [.992, 1.008], width: [.003, .009], trail: [.02, .22], trailGain: .32,
    arcs: { range: [.15, .7], base: 3, perSeed: 4, phase: 31, spin: 2, a: .55, count: 9, phaseB: 17, b: .35, bias: .3 },
    ticks: { count: 72, floor: .25, mark: .75, spin: .8 }, fadeIn: [.04, .35], radius: [.2, .4], calm: .3,
    color: [1.2, 1.4, 1.9], trailColor: [.6, .85, 1.3],
  },
  shock: { start: 7, speed: 2.6, split: [.98, 1.02], width: [.004, .012], trail: [.04, .3], trailGain: .45, color: [.9, 1.2, 1.7], radius: [.2, .45] },
  stars: {
    layers: 12, sectors: 62, sectorStep: 11, twist: .137, seed: [3.7, 11.3], golden: .618034, speed: [.54, .16], far: 1.1,
    head: [.14, .28], streak: [.009, .38], streakSeed: [.65, .6], tail: .025, centerSeed: [17.1, 2.8], center: [.16, .68],
    width: [.55, .65], edgePixels: 2, fade: [.015, .11], fadeOut: .94, along: [.12, .88], threshold: .47, radius: [.16, .36],
    tailColor: [1.5, .45, .55], headColor: [.26, .85, 1.5], warmSeed: .86, warm: [1.4, .68, .24], white: [1.8, 2.1, 2.3], whiteMix: .7, surge: .7,
  },
  vignette: { range: [.8, 2.2], amount: .4 },
  flash: [.9, .96, 1],
} as const;
const C = CORRIDOR_SHADER, R = C.rings, K = C.shock, S = C.stars;

/**
 * Full-screen time corridor shared by the starship flight and the milder landing-pod return overlay.
 * uCalm 0 is the starship at full motion, 1 the near-still reduced-motion corridor; values between tone it down.
 */
export function createTimeCorridorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'transit-time-corridor',
    defines: { TRANSIT_PULSE: TRANSIT_PULSE_SECONDS.toFixed(2) },
    uniforms: { uProgress: { value: 0 }, uElapsed: { value: 0 },
      uAspect: { value: 1 }, uPixel: { value: 1 / 360 }, uCenter: { value: new THREE.Vector2(.5, .6) },
      uCalm: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uProgress;
      uniform float uElapsed;
      uniform float uAspect;
      uniform float uPixel;
      uniform vec2 uCenter;
      uniform float uCalm;
      const float TAU = ${g(C.tau)};
      float hash(vec2 p) { return fract(sin(dot(p, vec2(${g(H.x)}, ${g(H.y)}))) * ${g(H.scale)}); }
      // Value noise wrapping every period cells along x, so the tunnel wall has no angular seam.
      float wrapNoise(vec2 p, float period) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float x0 = mod(i.x, period), x1 = mod(i.x + 1.0, period);
        return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x),
          mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
      }
      float wallNoise(vec2 p, float period) {
        return wrapNoise(p, period) * ${g(C.octaves.weights[0])} + wrapNoise(p * 2.0 + vec2(0.0, ${g(C.octaves.offsets[0])}), period * 2.0) * ${g(C.octaves.weights[1])}
          + wrapNoise(p * 4.0 + vec2(0.0, ${g(C.octaves.offsets[1])}), period * 4.0) * ${g(C.octaves.weights[2])};
      }

      void main() {
        float motion = mix(1.0, ${g(C.calmMotion)}, uCalm);
        float lively = 1.0 - uCalm;
        float ramp = clamp(uElapsed / ${g(C.entry)}, 0.0, 1.0);
        float acceleration = ramp * ramp * (3.0 - 2.0 * ramp);
        // Time shocks: after entry the corridor surges every TRANSIT_PULSE seconds; the burst distance is
        // integrated so every layer stays continuous through actual destination loading.
        float cruise = max(0.0, uElapsed - ${g(C.entry)});
        float pulseAge = mod(cruise, TRANSIT_PULSE);
        float surge = step(${g(C.entry)}, uElapsed) * exp(-pulseAge * ${g(C.surge.decay)}) * lively;
        float surgeDistance = (floor(cruise / TRANSIT_PULSE) * (1.0 - exp(-${g(C.surge.decay)} * TRANSIT_PULSE)) + 1.0 - exp(-${g(C.surge.decay)} * pulseAge)) * ${g(C.surge.reach)};
        float travelDistance = ${g(C.travel.idle)} * uElapsed + ${g(C.travel.ramp)} * (ramp * ramp * ramp - .5 * ramp * ramp * ramp * ramp)
          + ${g(C.travel.cruise)} * cruise + surgeDistance * lively;
        float time = travelDistance * motion;
        float speed = mix(${g(C.travel.idle)}, 1.0, acceleration) * (1.0 + surge * ${g(C.surge.boost)}) * motion;
        vec2 screen = (vUv - uCenter) * vec2(2.0 * uAspect, 2.0);
        // The ship bends space around its own axis: apparent radius r' maps back to r - k/r, so the far core
        // folds into a thin Einstein ring hugging the hull silhouette.
        float screenRadius = length(screen);
        float lens = ${g(C.lens)} * acceleration;
        vec2 lensed = screen * abs(screenRadius - lens / max(screenRadius, .001)) / max(screenRadius, .001);
        // The far vanishing point drifts while the near wall stays on the bow, so the corridor reads as curving.
        vec2 bend = vec2(sin(uElapsed * ${g(C.bend.rateA)} + ${g(C.bend.phaseA)}) + ${g(C.bend.b)} * sin(uElapsed * ${g(C.bend.rateB)}), ${g(C.bend.y)} * cos(uElapsed * ${g(C.bend.rateY)})) * ${g(C.bend.amount)};
        vec2 p = lensed - bend * lively * acceleration / (1.0 + dot(lensed, lensed) * ${g(C.bend.falloff)});
        float radius = length(p);
        float angle = atan(p.y, p.x + step(radius, .00001) * .00002);
        float depth = ${g(C.depth.scale)} / (radius + ${g(C.depth.bias)});
        float doppler = smoothstep(${g(C.doppler[0])}, ${g(C.doppler[1])}, radius);

        vec3 cyan = ${v3(C.cyan)};
        vec3 violet = ${v3(C.violet)};
        vec3 gold = ${v3(C.gold)};
        vec3 tint = mix(cyan, violet, .5 + .5 * sin(uElapsed * ${g(C.tintCycle.rate)} - ${g(C.tintCycle.phase)} + (depth + time * ${g(C.tintCycle.flow)}) * ${g(C.tintCycle.depth)}));
        float warmPass = smoothstep(${g(C.warm.range[0])}, ${g(C.warm.range[1])}, .5 + .5 * sin(uElapsed * ${g(C.warm.rate)} + uProgress * ${g(C.warm.progress)} - ${g(C.warm.phase)}));
        tint = mix(tint, gold, warmPass * ${g(C.warm.amount)});
        // Light ahead is blue-shifted, light streaming past the frame edge red-shifted.
        vec3 shifted = mix(tint * ${v3(C.blueShift)}, tint * ${g(C.redShift.keep)} + ${v3(C.redShift.add)}, doppler);

        // Tunnel wall twisted into a vortex: energy streaks mapped by 1/r depth flow toward the camera.
        float twist = (depth * ${g(C.twist.depth)} + time * ${g(C.twist.time)}) * lively;
        float swirl = ${g(C.swirl.amount)} * sin(depth * ${g(C.swirl.depth)} - time * ${g(C.swirl.time)}) * lively;
        float wall = wallNoise(vec2((angle / TAU + .5) * ${g(C.wall.cells)} + (swirl + twist) * ${g(C.wall.twist)}, depth * ${g(C.wall.depth)} + time * ${g(C.wall.flow)}), ${g(C.wall.cells)});
        float near = smoothstep(${g(C.near[0])}, ${g(C.near[1])}, radius);
        float filament = pow(1.0 - abs(wall * 2.0 - 1.0), ${g(C.energy.sharpness)});
        float energy = (filament * ${g(C.energy.filament)} + pow(wall, ${g(C.energy.glowPow)}) * ${g(C.energy.glow)} + ${g(C.energy.floor)}) * near * (1.0 - smoothstep(${g(C.energy.outer[0])}, ${g(C.energy.outer[1])}, radius) * ${g(C.energy.outerDim)});
        vec3 color = ${v3(C.base)} + shifted * energy * ${g(C.energy.gain)} * (1.0 + surge * ${g(C.energy.surge)});

        // Spacetime mesh on the wall: meridians twist with the vortex, rings rush outward with travel.
        float meridian = abs(fract((angle / TAU + .5) * ${g(C.grid.meridians)} + twist * ${g(C.grid.twist)}) - .5);
        float latitude = abs(fract(depth * ${g(C.grid.depth)} + time * ${g(C.grid.flow)}) - .5);
        float gridWidth = ${g(C.grid.width[0])} + ${g(C.grid.width[1])} * near;
        float grid = max(exp(-meridian * meridian / (gridWidth * gridWidth)), exp(-latitude * latitude / (gridWidth * gridWidth * ${g(C.grid.latWidth)})));
        color += ${v3(C.grid.color)} * grid * near * (1.0 - smoothstep(${g(C.grid.fade[0])}, ${g(C.grid.fade[1])}, radius)) * (${g(C.grid.glow[0])} + ${g(C.grid.glow[1])} * surge) * lively;

        // Distant bright core with radial colour separation; the lens wraps it around the hull silhouette.
        float lensedRadius = length(lensed);
        vec3 split = vec3(lensedRadius * ${g(C.core.split[0])}, lensedRadius, lensedRadius * ${g(C.core.split[1])});
        color += ${v3(C.core.color)} * exp(-split * split * ${g(C.core.falloff)}) * (1.0 + surge * ${g(C.core.surge)})
          + mix(tint, ${v3(C.core.haze)}, ${g(C.core.hazeMix)}) * exp(-split * ${g(C.core.hazeFalloff)}) * ${g(C.core.hazeGain)};

        // Light rings approach at constant depth speed, so their screen radius .62/depth accelerates outward.
        // Each ring is thin, broken into arcs and drags a motion-blur trail behind it, so it reads as
        // something rushing past rather than a flat slice through the tunnel.
        float jitter = ${g(C.jitter.a)} * sin(angle * ${g(C.jitter.angleA)} + time * ${g(C.jitter.speedA)}) + ${g(C.jitter.b)} * sin(angle * ${g(C.jitter.angleB)} - time * ${g(C.jitter.speedB)});
        for (int i = 0; i < ${R.count}; i++) {
          float layer = float(i);
          float seed = hash(vec2(layer + ${g(R.seed[0])}, ${g(R.seed[1])}));
          float phase = fract(layer / ${g(R.count)} + time * ${g(R.speed)});
          float ringRadius = ${g(C.depth.scale)} / (${g(R.depth)} * (1.0 - phase) + ${g(R.near)}) - ${g(C.depth.bias)};
          vec3 d = vec3(radius * ${g(R.split[0])}, radius, radius * ${g(R.split[1])}) - ringRadius * (1.0 + jitter);
          float width = ${g(R.width[0])} + ${g(R.width[1])} * ringRadius;
          vec3 ring = exp(-d * d / (width * width));
          // Trail extends inward, longer as the ring speeds up near the frame edge.
          float trailLength = (${g(R.trail[0])} + ${g(R.trail[1])} * ringRadius) * speed;
          vec3 trail = exp(min(d, 0.0) / max(trailLength, .001)) * step(d, vec3(0.0)) * ${g(R.trailGain)};
          float arcs = smoothstep(${g(R.arcs.range[0])}, ${g(R.arcs.range[1])}, sin(angle * (${g(R.arcs.base)} + seed * ${g(R.arcs.perSeed)}) + seed * ${g(R.arcs.phase)} + time * (seed - .5) * ${g(R.arcs.spin)})
            * ${g(R.arcs.a)} + sin(angle * ${g(R.arcs.count)} - seed * ${g(R.arcs.phaseB)}) * ${g(R.arcs.b)} + ${g(R.arcs.bias)});
          // Alternate rings carry clock-dial ticks, turning opposite ways, as markers of passing time.
          float ticks = mix(1.0, ${g(R.ticks.floor)} + ${g(R.ticks.mark)} * step(.5, fract((angle / TAU) * ${g(R.ticks.count)} + (mod(layer, 2.0) * 2.0 - 1.0) * time * ${g(R.ticks.spin)})), step(.5, seed));
          float fade = smoothstep(${g(R.fadeIn[0])}, ${g(R.fadeIn[1])}, phase) * smoothstep(${g(R.radius[0])}, ${g(R.radius[1])}, radius) * mix(1.0, ${g(R.calm)}, uCalm);
          color += (ring * ${v3(R.color)} + trail * mix(shifted, ${v3(R.trailColor)}, .5)) * arcs * ticks * fade;
        }

        // Each time shock throws one unbroken bright ring from the far core past the frame edge.
        float shockRadius = ${g(C.depth.scale)} / (${g(K.start)} * exp(-pulseAge * ${g(K.speed)}) + ${g(R.near)}) - ${g(C.depth.bias)};
        vec3 shockD = vec3(radius * ${g(K.split[0])}, radius, radius * ${g(K.split[1])}) - shockRadius;
        float shockWidth = ${g(K.width[0])} + ${g(K.width[1])} * shockRadius;
        vec3 shell = exp(-shockD * shockD / (shockWidth * shockWidth))
          + exp(min(shockD, 0.0) / (${g(K.trail[0])} + ${g(K.trail[1])} * shockRadius)) * step(shockD, vec3(0.0)) * ${g(K.trailGain)};
        color += shell * ${v3(K.color)} * surge * smoothstep(${g(K.radius[0])}, ${g(K.radius[1])}, radius);

        // Twelve projected depth layers supply continuous outward star streaks without ray marching.
        for (int i = 0; i < ${S.layers}; i++) {
          float layer = float(i);
          float sectorCount = ${g(S.sectors)} + mod(layer, 3.0) * ${g(S.sectorStep)};
          float angular = fract(angle / TAU + .5 + layer * ${g(S.twist)}) * sectorCount;
          float sector = floor(angular);
          float seed = hash(vec2(sector + ${g(S.seed[0])}, layer + ${g(S.seed[1])}));
          float phase = fract(layer * ${g(S.golden)} + time * (${g(S.speed[0])} + seed * ${g(S.speed[1])}));
          float z = ${g(S.far)} - phase;
          float head = (${g(S.head[0])} + seed * ${g(S.head[1])}) / z;
          float streak = (${g(S.streak[0])} + head * head * ${g(S.streak[1])} * speed) * (${g(S.streakSeed[0])} + seed * ${g(S.streakSeed[1])});
          float tail = max(${g(S.tail)}, head - streak);
          float center = ${g(S.center[0])} + hash(vec2(sector + ${g(S.centerSeed[0])}, layer + ${g(S.centerSeed[1])})) * ${g(S.center[1])};
          float across = abs(fract(angular) - center) * TAU * radius / sectorCount;
          float width = uPixel * (${g(S.width[0])} + phase * ${g(S.width[1])});
          float line = exp(-across * across / (width * width));
          float ends = smoothstep(tail - uPixel * ${g(S.edgePixels)}, tail + uPixel * ${g(S.edgePixels)}, radius)
            * (1.0 - smoothstep(head, head + uPixel * ${g(S.edgePixels)}, radius));
          float along = clamp((radius - tail) / max(.001, streak), 0.0, 1.0);
          float fade = smoothstep(${g(S.fade[0])}, ${g(S.fade[1])}, phase) * (1.0 - smoothstep(${g(S.fadeOut)}, 1.0, phase));
          float brightness = line * ends * (${g(S.along[0])} + ${g(S.along[1])} * along) * fade * step(${g(S.threshold)}, seed)
            * smoothstep(${g(S.radius[0])}, ${g(S.radius[1])}, radius);
          // Heads stay blue-white; tails stretch toward the red end as the streak sweeps past.
          vec3 starColor = mix(${v3(S.tailColor)}, ${v3(S.headColor)}, along);
          starColor = mix(starColor, ${v3(S.warm)}, step(${g(S.warmSeed)}, seed));
          starColor = mix(starColor, ${v3(S.white)}, along * along * ${g(S.whiteMix)});
          color += starColor * brightness * (1.0 + surge * ${g(S.surge)});
        }

        color *= 1.0 - smoothstep(${g(C.vignette.range[0])}, ${g(C.vignette.range[1])}, length(screen)) * ${g(C.vignette.amount)};
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    // Render behind the real ship without putting the star field into the hull's depth buffer.
    depthTest: false, depthWrite: false, toneMapped: false,
  });
}

/** One corridor continues through travel and actual destination loading; only readiness opens the exit. */
export function createTransitTimeCorridor(root: THREE.Group, rocket: THREE.Group) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const material = createTimeCorridorMaterial();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  plane.name = 'star field behind the departing ship';
  plane.frustumCulled = false;
  plane.renderOrder = -100_000;
  plane.visible = false;
  const viewport = new THREE.Vector4(), nose = new THREE.Vector3();
  plane.onBeforeRender = (renderer, _scene, camera) => {
    material.uniforms.uAspect!.value = (camera as THREE.PerspectiveCamera).aspect;
    material.uniforms.uPixel!.value = 2 / currentViewportHeight(renderer, viewport);
    nose.set(0, TRANSIT.rocketHeight, 0);
    rocket.localToWorld(nose).project(camera);
    material.uniforms.uCenter!.value.set((nose.x + 1) * .5, (nose.y + 1) * .5);
  };
  root.add(plane);
  const flashMaterial = new THREE.ShaderMaterial({
    name: 'transit-arrival-flash',
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform float uOpacity; void main(){ gl_FragColor = vec4(${C.flash.map(g).join(', ')}, uOpacity); }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const flash = new THREE.Mesh(plane.geometry, flashMaterial);
  flash.name = 'arrival light covering the ship and corridor';
  flash.frustumCulled = false;
  flash.renderOrder = 100_000;
  flash.visible = false;
  root.add(flash);
  return {
    update(progress: number, elapsed: number, arrival: number): void {
      plane.visible = progress >= 0;
      material.uniforms.uProgress!.value = progress;
      material.uniforms.uElapsed!.value = elapsed;
      material.uniforms.uCalm!.value = Number(reducedMotion.matches);
      const opacity = Math.max(1 - THREE.MathUtils.smoothstep(progress, 0, .12), THREE.MathUtils.smoothstep(arrival, 0, 1));
      flash.visible = progress >= 0 && opacity > 0;
      flashMaterial.uniforms.uOpacity!.value = opacity;
    },
  };
}
