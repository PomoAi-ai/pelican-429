import * as THREE from 'three';
import type { PelicanAnimInput } from './pelican-animator.ts';
import type { PelicanPose } from './pelican-pose.ts';
import { SCARF_PARTS } from './pelican-follow-rig.ts';

const CLOTH_SHADER = /* glsl */`
uniform float uScarfPhase;
uniform float uScarfAmplitude;
uniform float uScarfLift;
uniform float uScarfFlow;
uniform float uScarfRibbon;
vec3 scarfOffset(float x) {
  // The neck-side seam stays fixed in both the solid and illustrated morphs.
  float along = max(0.0, -x - 0.28);
  float weight = along * along / (0.35 + along);
  float wave = along * 5.2 - uScarfPhase + uScarfRibbon;
  float ripple = sin(wave) + 0.28 * sin(wave * 1.73 + uScarfPhase * 0.31);
  return weight * vec3(uScarfFlow * 0.055,
    uScarfLift + uScarfAmplitude * ripple,
    uScarfAmplitude * 0.35 * sin(wave + 1.1));
}
`;

/** Local material patches keep the knot rigid while both ribbons and their ink share travelling waves. */
export function createPelicanScarf(root: THREE.Object3D) {
  const phase = { value: 0 }, amplitude = { value: 0 }, lift = { value: 0 }, flow = { value: 0 };
  // Validate the vendor boundary before replacing any materials.
  const meshes = SCARF_PARTS.map(name => {
    const mesh = root.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh) || Array.isArray(mesh.material)) {
      throw new Error(`Pelican scarf needs a single-material mesh: ${name}.`);
    }
    return mesh as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  });
  const entries = meshes.map(mesh => {
    const original = mesh.material;
    const material = original.clone();
    const oldDepth = mesh.customDepthMaterial, oldDistance = mesh.customDistanceMaterial;
    const depth = oldDepth ? oldDepth.clone() : new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    const distance = oldDistance ? oldDistance.clone() : new THREE.MeshDistanceMaterial();
    const ribbon = { value: mesh.name.includes('upper') ? 0 : 1.4 };
    function patch(target: THREE.Material, source: THREE.Material) {
      const previous = source.onBeforeCompile;
      const key = source.customProgramCacheKey();
      target.onBeforeCompile = (shader, renderer) => {
        previous.call(target, shader, renderer);
        Object.assign(shader.uniforms, {
          uScarfPhase: phase, uScarfAmplitude: amplitude, uScarfLift: lift,
          uScarfFlow: flow, uScarfRibbon: ribbon,
        });
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${CLOTH_SHADER}`)
          .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\ntransformed += scarfOffset(transformed.x);')
          .replace('#include <morphnormal_vertex>', `#include <morphnormal_vertex>
            vec3 scarfSlope = (scarfOffset(position.x + 0.001) - scarfOffset(position.x - 0.001)) / 0.002;
            objectNormal.x = (objectNormal.x - dot(scarfSlope.yz, objectNormal.yz)) / (1.0 + scarfSlope.x);`);
      };
      target.customProgramCacheKey = () => `${key}|pelican-scarf`;
    }
    patch(material, original);
    patch(depth, oldDepth ?? depth);
    patch(distance, oldDistance ?? distance);
    mesh.customDepthMaterial = depth;
    mesh.customDistanceMaterial = distance;
    const frustumCulled = mesh.frustumCulled;
    mesh.material = material;
    // Four small meshes: avoid stale CPU bounds clipping the shader-deformed tips.
    mesh.frustumCulled = false;
    return { mesh, original, material, frustumCulled, oldDepth, oldDistance, depth, distance };
  });
  let frequency = 2.1;
  let disposed = false;
  return {
    update(input: PelicanAnimInput, pose: PelicanPose, wind: number, dt: number): void {
      const swimming = input.state === 'swim';
      const flying = input.state === 'fly';
      const gliding = input.state === 'glide';
      const relativeWind = (wind * 3 - input.vx) * Math.cos(pose.yaw);
      const airflow = Math.tanh(relativeWind / 5);
      const speed = Math.min(1, Math.abs(relativeWind) / 7);
      const attack = input.attackPhase === 'active' ? 1
        : input.attackPhase === 'startup' ? -0.35 * input.attackProgress : 0;
      const shot = input.shotPhase === 'hold' ? 0.65
        : input.shotPhase === 'windup' ? -0.25 * input.shotProgress : 0;
      const recoil = attack + shot;
      const wing = (flying || input.state === 'jump') ? pose.wingBeat * 0.045 : 0;
      const rate = 1 - Math.exp(-dt * (swimming ? 4 : 9));
      // ponytail: bounded travelling waves model cloth visually; use a cloth solver only if collisions become necessary.
      const targetAmplitude = swimming ? 0.025 + speed * 0.055
        : 0.025 + speed * 0.13 + Math.abs(wind) * 0.07 + (flying ? 0.045 : 0) + Math.abs(recoil) * 0.055;
      const targetLift = -airflow * 0.12 - Math.tanh(input.vy / 5) * 0.18
        + (gliding ? 0.07 : 0) + pose.ride.seat * speed * 0.05 + recoil * 0.11 + wing;
      amplitude.value += (targetAmplitude - amplitude.value) * rate;
      lift.value += (targetLift - lift.value) * rate;
      flow.value += (airflow - flow.value) * rate;
      frequency += ((swimming ? 1.5 : 2.1 + speed * 5 + (flying ? 2 : 0)) - frequency) * rate;
      phase.value += dt * frequency;
      // Vendor owns ink fading during the illustration → solid morph through the original shared material.
      for (const { original, material } of entries) material.opacity = original.opacity;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const { mesh, original, material, frustumCulled, oldDepth, oldDistance, depth, distance } of entries) {
        mesh.material = original;
        mesh.frustumCulled = frustumCulled;
        mesh.customDepthMaterial = oldDepth;
        mesh.customDistanceMaterial = oldDistance;
        material.dispose();
        depth.dispose();
        distance.dispose();
      }
    },
  };
}
