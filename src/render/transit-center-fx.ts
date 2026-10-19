import * as THREE from 'three';
import { TRANSIT, TRANSIT_PULSE_SECONDS } from '../config/transit.ts';
import { createParticleCloud } from './grassy/grassy-particles.ts';
import { createRocketExhaust, glslShort as g, glslVec3 as v3 } from './transit-exhaust.ts';
import { createTransitPadCloud } from './transit-pad-cloud.ts';
import { createTransitTimeCorridor } from './transit-time-corridor.ts';
import type { TransitVisual } from './transit-center-model.ts';

function halo(parent: THREE.Object3D, radius: number, thickness: number, color: THREE.ColorRepresentation) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 96), material);
  ring.rotation.x = Math.PI / 2;
  parent.add(ring);
  return ring;
}

/** 跃迁光柱着色器参数（GLSL 与 WebGPU 节点版本共用）。 */
export const LIGHT_TRAIL_SHADER = {
  core: 180, glow: 7, edge: [.08, .7], filaments: { count: 52, speed: 8, sharpness: 12, amount: .12 },
  glowMix: .46, cut: .003, color: [.12, 1.8, 4.5], white: [5, 6, 7],
} as const;
const T = LIGHT_TRAIL_SHADER;

function createLightTrail(root: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'instant orbital light escape';
  group.position.x = TRANSIT.rocketX;
  root.add(group);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, .5, 0);
  const material = new THREE.ShaderMaterial({
    name: 'transit-light-trail',
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uOpacity;
      uniform float uTime;
      void main() {
        float x = abs(vUv.x * 2.0 - 1.0);
        float core = exp(-x * x * ${g(T.core)});
        float glow = exp(-x * x * ${g(T.glow)});
        float edge = smoothstep(0.0, ${g(T.edge[0])}, vUv.y) * (1.0 - smoothstep(${g(T.edge[1])}, 1.0, vUv.y));
        float filaments = pow(max(0.0, sin(x * ${g(T.filaments.count)} + uTime * ${g(T.filaments.speed)})), ${g(T.filaments.sharpness)}) * ${g(T.filaments.amount)};
        float alpha = (core + glow * ${g(T.glowMix)} + filaments * glow) * edge * uOpacity;
        if (alpha < ${g(T.cut)}) discard;
        gl_FragColor = vec4(mix(${v3(T.color)}, ${v3(T.white)}, core), alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  for (let i = 0; i < 2; i++) {
    const sheet = new THREE.Mesh(geometry, material);
    sheet.rotation.y = i * Math.PI / 2;
    sheet.frustumCulled = false;
    group.add(sheet);
  }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({
    color: new THREE.Color(3.5, 4.8, 6), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  flash.name = 'compressed jump ignition flash';
  root.add(flash);
  const shock = halo(root, 3.2, .12, new THREE.Color(.3, 2.8, 4.4));
  shock.name = 'supersonic jump pressure ring';
  return {
    update(altitude: number, warp: number, time: number): void {
      const burst = THREE.MathUtils.clamp((warp - .25) / .75, 0, 1);
      const flashStrength = warp > 0 && warp < .25 ? warp / .25 : Math.max(0, 1 - burst * 3.6);
      flash.visible = warp > 0 && warp < .6;
      flash.position.set(TRANSIT.rocketX, altitude + TRANSIT.rocketHeight * .5, 0);
      flash.scale.set(3.4 + burst * 8, TRANSIT.rocketHeight * .52, 3.4 + burst * 8);
      flash.material.opacity = flashStrength * .58;
      group.visible = warp >= .25 && warp < 1;
      group.position.y = altitude - 3;
      group.scale.set(7 * (1 - burst * .55), TRANSIT.rocketHeight + 150 * Math.sqrt(burst), 7);
      material.uniforms.uOpacity!.value = (1 - burst) ** 1.4;
      material.uniforms.uTime!.value = time;
      shock.visible = warp >= .25 && warp < 1;
      shock.position.set(TRANSIT.rocketX, altitude + 5, 0);
      shock.scale.setScalar(1 + burst * 8);
      shock.material.opacity = (1 - burst) ** 2 * .75;
    },
  };
}

const EMBERS = 180;

/** 尾焰火花粒子，星舰发射/穿越与着陆舱返程穿梭共用。 */
export function createExhaustEmbers() {
  const embers = createParticleCloud(EMBERS, new THREE.Color(2.8, .8, .14));
  embers.points.name = 'accelerating incandescent exhaust fragments';
  return embers;
}

/** 穿越巡航：火花从各喷口加速散开，飞过同轴下方的镜头；emitters 与 embers 同一坐标系，altitude 为喷口所在体的高度。 */
export function updateCruiseEmbers(embers: ReturnType<typeof createExhaustEmbers>, emitters: readonly THREE.Object3D[], time: number, altitude: number): void {
  for (let i = 0; i < EMBERS; i++) {
    const emitter = emitters[i % emitters.length]!.position;
    const age = (time * (1.25 + i % 5 * .11) + i * .618034) % 1;
    const angle = i * 2.399963;
    const spread = .12 + age * age * (2.6 + i % 4 * .7);
    embers.positions.setXYZ(i, emitter.x * (1 + age * .5) + Math.cos(angle) * spread,
      altitude + emitter.y - age * age * 21.5, emitter.z * (1 + age * .5) + Math.sin(angle) * spread);
    embers.sizes.setX(i, .05 + age * .1);
    embers.alphas.setX(i, Math.min(1, age * 6) * (1 - age ** 4) * .85);
  }
  embers.positions.needsUpdate = embers.sizes.needsUpdate = embers.alphas.needsUpdate = true;
}

/** Absolute-time particles reset immediately when the launch returns to its idle phase. */
export function createTransitCenterFx(root: THREE.Group, rocket: THREE.Group, emitters: readonly THREE.Object3D[]) {
  const jets = createRocketExhaust(rocket, emitters);
  const steam = createTransitPadCloud(root);
  const trail = createLightTrail(root);
  const corridor = createTransitTimeCorridor(root, rocket);
  const exhaustLight = new THREE.PointLight(0xffae61, 0, 42, 1.7);
  exhaustLight.position.set(TRANSIT.rocketX, 2, 1.5);
  root.add(exhaustLight);
  const nozzleLight = new THREE.PointLight(0xe6d7ff, 0, 22, 1.8);
  nozzleLight.position.set(0, 1.5, 1);
  rocket.add(nozzleLight);
  // Stage lights are off inside the corridor; two coloured lights circle the aft so the steel keeps its form.
  const rimLights = [0x5fb4ff, 0xc46bff].map(color => {
    const light = new THREE.PointLight(color, 0, 26, 1.6);
    rocket.add(light);
    return light;
  });
  const embers = createExhaustEmbers();
  embers.points.position.x = TRANSIT.rocketX;
  root.add(embers.points);
  return {
    update(visual: TransitVisual, time: number): void {
      const { thrust, altitude, warp, speed } = visual;
      const travelling = visual.travel >= 0;
      const exhaust = thrust * (1 - THREE.MathUtils.smoothstep(warp, .18, .4));
      jets.update(time, exhaust, speed, travelling);
      steam.update(visual.travel < 0 ? visual.burnTime : 0);
      trail.update(altitude, warp, time);
      corridor.update(visual.travel, visual.travelTime, visual.arrival);
      const pulse = 1 + .08 * Math.sin(time * 43) + .04 * Math.sin(time * 79);
      exhaustLight.position.y = Math.min(9, 1.2 + altitude * .6);
      exhaustLight.intensity = exhaust * Math.max(0, 1 - altitude / 32) * 700 * pulse;
      nozzleLight.color.set(travelling ? 0x93bdff : 0xe6d7ff);
      nozzleLight.intensity = (travelling ? 60 : exhaust * 170) * pulse;
      const shock = travelling && visual.travelTime > .8 ? Math.exp(-((visual.travelTime - .8) % TRANSIT_PULSE_SECONDS) * 4) : 0;
      rimLights.forEach((light, i) => {
        const angle = time * .9 + i * Math.PI;
        light.position.set(Math.cos(angle) * 4.6, -1.6, Math.sin(angle) * 4.6);
        light.intensity = travelling ? 75 * (1 + shock * 1.8) : 0;
      });
      embers.points.visible = travelling || (exhaust > .01 && altitude > .1);
      if (travelling) {
        updateCruiseEmbers(embers, emitters, time, altitude);
        return;
      }
      for (let i = 0; i < EMBERS; i++) {
        const age = (time * (.82 + i % 3 * .09) + i * .618034) % 1;
        const angle = i * 2.399963 + age * .55;
        const radius = 1.85 + age * (1.45 + i % 4 * .18);
        const y = altitude + .6 - age * (14 + Math.min(13, speed * .9));
        const size = .12 + Math.sin(age * Math.PI) * (.5 + i % 3 * .12);
        embers.positions.setXYZ(i, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        embers.sizes.setX(i, size);
        embers.alphas.setX(i, y > .08 + size * .5 ? Math.sin(age * Math.PI) * exhaust * .42 : 0);
      }
      embers.positions.needsUpdate = embers.sizes.needsUpdate = embers.alphas.needsUpdate = true;
    },
  };
}
