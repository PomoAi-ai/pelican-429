import * as THREE from 'three';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';
import { addNodePatch } from '../stage/node-patches.ts';

/**
 * 主城区保持材质明暗，只有更远的街区逐渐融入地平线。
 * riverLevel 是河面的世界 y：环境整体平移进格子世界，低空雾按世界高度计算，由环境每帧写入。
 */
export function createResidenceFourAtmosphere(materials: readonly THREE.MeshStandardMaterial[], riverLevel: { value: number }) {
  const air = { value: new THREE.Color('#89b2c9') };
  const density = { value: 1 };
  const day = air.value.clone(), dusk = new THREE.Color('#d4b2a3');
  const overcast = new THREE.Color('#9eafb6'), dark = new THREE.Color('#111c2b');
  let night = 0, cloud = 0;
  for (const material of materials) {
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.uniforms.riverAir = air;
      shader.uniforms.riverAirDensity = density;
      shader.uniforms.riverAirLevel = riverLevel;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float riverAirHeight;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 airPoint = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            airPoint = instanceMatrix * airPoint;
          #endif
          riverAirHeight = (modelMatrix * airPoint).y;`);
      shader.fragmentShader = 'uniform vec3 riverAir;\nuniform float riverAirDensity;\nuniform float riverAirLevel;\nvarying float riverAirHeight;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
        float airDepth = max(0.0, vViewPosition.z - 610.0) * riverAirDensity;
        float airAmount = 1.0 - exp(-pow(airDepth / 550.0, 1.65));
        float lowAir = .26 * exp(-max(0.0, riverAirHeight - riverAirLevel) / 15.0)
          * smoothstep(750.0, 1250.0, vViewPosition.z);
        airAmount = 1.0 - (1.0 - airAmount) * (1.0 - lowAir);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, riverAir, airAmount);
        #include <tonemapping_fragment>
      `);
    };
    material.customProgramCacheKey = () => key + '-high-bank-air';
    addNodePatch(material, { kind: 'residence-air', air, density, start: 610, scale: 550, power: 1.65, low: { level: riverLevel } });
    material.needsUpdate = true;
  }
  const update = () => {
    const warm = Math.sin(night * Math.PI) * (1 - cloud);
    air.value.copy(day).lerp(dusk, warm).lerp(overcast, cloud).lerp(dark, night);
    density.value = 1 + cloud * .65;
  };
  return {
    setWeather(look: PrecipSkyLook) { cloud = look.cloudAmount; update(); },
    setNightFactor(value: number) { night = value; update(); },
  };
}
