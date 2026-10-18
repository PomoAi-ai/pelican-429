import * as THREE from 'three';
import { TRANSIT } from '../config/transit.ts';
import { createParticleCloud } from './grassy/grassy-particles.ts';
import { createRocketExhaust } from './transit-exhaust.ts';
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

function createLightTrail(root: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'instant orbital light escape';
  group.position.x = TRANSIT.rocketX;
  root.add(group);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, .5, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uOpacity;
      uniform float uTime;
      void main() {
        float x = abs(vUv.x * 2.0 - 1.0);
        float core = exp(-x * x * 180.0);
        float glow = exp(-x * x * 7.0);
        float edge = smoothstep(0.0, .08, vUv.y) * (1.0 - smoothstep(.7, 1.0, vUv.y));
        float filaments = pow(max(0.0, sin(x * 52.0 + uTime * 8.0)), 12.0) * .12;
        float alpha = (core + glow * .46 + filaments * glow) * edge * uOpacity;
        if (alpha < .003) discard;
        gl_FragColor = vec4(mix(vec3(.12, 1.8, 4.5), vec3(5.0, 6.0, 7.0), core), alpha);
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

/** Absolute-time particles reset immediately when the launch returns to its idle phase. */
export function createTransitCenterFx(root: THREE.Group, rocket: THREE.Group, emitters: readonly THREE.Object3D[]) {
  const jets = createRocketExhaust(rocket, emitters);
  const steam = createTransitPadCloud(root);
  const trail = createLightTrail(root);
  const corridor = createTransitTimeCorridor(root);
  const exhaustLight = new THREE.PointLight(0xffa04e, 0, 42, 1.7);
  exhaustLight.position.set(TRANSIT.rocketX, 2, 1.5);
  root.add(exhaustLight);
  const nozzleLight = new THREE.PointLight(0xffce91, 0, 22, 1.8);
  nozzleLight.position.set(0, 1.5, 1);
  rocket.add(nozzleLight);
  const embers = createParticleCloud(120, '#ffad6d');
  embers.points.name = 'accelerating incandescent exhaust fragments';
  embers.points.position.x = TRANSIT.rocketX;
  root.add(embers.points);
  return {
    update(visual: TransitVisual, time: number): void {
      const { thrust, altitude, warp, speed } = visual;
      const exhaust = thrust * (1 - THREE.MathUtils.smoothstep(warp, .18, .4));
      jets.update(time, exhaust, speed);
      steam.update(visual.burnTime);
      trail.update(altitude, warp, time);
      corridor.update(visual.travel);
      const pulse = 1 + .08 * Math.sin(time * 43) + .04 * Math.sin(time * 79);
      exhaustLight.position.y = Math.min(9, 1.2 + altitude * .6);
      exhaustLight.intensity = exhaust * Math.max(0, 1 - altitude / 32) * 640 * pulse;
      nozzleLight.intensity = exhaust * 145 * pulse;
      embers.points.visible = exhaust > .01 && altitude > .1;
      for (let i = 0; i < 120; i++) {
        const age = (time * (1.1 + i % 3 * .1) + i * .618034) % 1;
        const angle = i * 2.399963;
        const radius = .6 + age * (1.6 + i % 4 * .4);
        const y = altitude + .7 - age * (8 + Math.min(6, speed * .2));
        embers.positions.setXYZ(i, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        embers.sizes.setX(i, .055 + (1 - age) * .13);
        embers.alphas.setX(i, y > .1 ? Math.sin(age * Math.PI) * exhaust * .75 : 0);
      }
      embers.positions.needsUpdate = embers.sizes.needsUpdate = embers.alphas.needsUpdate = true;
    },
  };
}
