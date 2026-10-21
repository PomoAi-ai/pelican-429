import * as THREE from 'three';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';
import { addNodePatch } from '../stage/node-patches.ts';

/** 城市和陆地一起按真实视距淡入空气，避免远处道路仍像模型底板一样清楚。 */
export function createResidenceThreeAtmosphere(materials: readonly THREE.MeshStandardMaterial[]) {
  const air = { value: new THREE.Color('#c4d9df') };
  const density = { value: 1 };
  const clear = air.value.clone();
  const overcast = new THREE.Color('#9eafb6');
  const dark = new THREE.Color('#111c2b');
  let night = 0, cloud = 0;
  for (const material of materials) {
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.uniforms.residenceAir = air;
      shader.uniforms.residenceAirDensity = density;
      shader.fragmentShader = 'uniform vec3 residenceAir;\nuniform float residenceAirDensity;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
        float airDepth = max(0.0, vViewPosition.z - 200.0) * residenceAirDensity;
        float airAmount = 1.0 - exp(-pow(airDepth / 390.0, 1.45));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, residenceAir, airAmount);
        #include <tonemapping_fragment>
      `);
    };
    material.customProgramCacheKey = () => key + '-residence-air';
    addNodePatch(material, { kind: 'residence-air', air, density, start: 200, scale: 390, power: 1.45, low: null });
    material.needsUpdate = true;
  }
  const update = () => {
    air.value.copy(clear).lerp(overcast, cloud).lerp(dark, night);
    density.value = 1 + cloud * .65;
  };
  return {
    setWeather(look: PrecipSkyLook) { cloud = look.cloudAmount; update(); },
    setNightFactor(value: number) { night = value; update(); },
  };
}
