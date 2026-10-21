import * as THREE from 'three';
import { addNodePatch } from '../stage/node-patches.ts';

/** 材质图按世界尺寸重复，建筑换大小时不会把石纹或窗格一并拉大。 */
export function createResidenceFourSurfaces(root: THREE.Object3D) {
  const styles: Record<string, { origin: [number, number]; size: number; strength: number }> = {
    ivory: { origin: [0, .5], size: 3.2, strength: .36 },
    stone: { origin: [.5, .5], size: 3, strength: .48 },
    paving: { origin: [.5, .5], size: 4.5, strength: .44 },
    grass: { origin: [.5, .5], size: 2.2, strength: .32 },
    green: { origin: [0, 0], size: 1.8, strength: .8 },
    glass: { origin: [.5, 0], size: 12, strength: .75 },
    cityGlass: { origin: [.5, 0], size: 12, strength: .6 },
  };
  const selected = new Set<THREE.MeshStandardMaterial>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial && styles[material.userData.riverSurface]) selected.add(material);
    }
  });
  const atlas = { value: null as THREE.Texture | null };
  let bitmap: ImageBitmap | null = null;
  for (const material of selected) {
    const role = material.userData.riverSurface as string;
    const style = styles[role]!;
    const before = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
    const glass = role === 'glass' || role === 'cityGlass';
    const gain = glass ? 2.4 : role === 'green' ? 2.7 : 1.25;
    if (glass) { material.metalness = .22; material.roughness = .24; material.envMapIntensity = 1.2; }
    material.onBeforeCompile = function (shader, renderer) {
      before.call(this, shader, renderer);
      shader.uniforms.riverSurfaceAtlas = atlas;
      shader.uniforms.riverSurfaceOrigin = { value: new THREE.Vector2(...style.origin) };
      shader.uniforms.riverSurfaceSize = { value: style.size };
      shader.uniforms.riverSurfaceStrength = { value: style.strength };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 riverSurfaceWorld;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 surfacePoint = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            surfacePoint = instanceMatrix * surfacePoint;
          #endif
          riverSurfaceWorld = (modelMatrix * surfacePoint).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 riverSurfaceWorld;
          uniform sampler2D riverSurfaceAtlas;
          uniform vec2 riverSurfaceOrigin;
          uniform float riverSurfaceSize;
          uniform float riverSurfaceStrength;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 surfaceNormal = abs(normalize(cross(dFdx(riverSurfaceWorld), dFdy(riverSurfaceWorld))));
          vec2 surfaceUV = surfaceNormal.y > .65 ? riverSurfaceWorld.xz
            : surfaceNormal.x > surfaceNormal.z ? riverSurfaceWorld.zy : riverSurfaceWorld.xy;
          vec3 surfaceSample = texture2D(riverSurfaceAtlas,
            riverSurfaceOrigin + vec2(.005) + fract(surfaceUV / riverSurfaceSize) * .49).rgb;
          float surfaceLum = dot(surfaceSample, vec3(.2126, .7152, .0722));
          float surfaceStrength = riverSurfaceStrength * (1.0 - smoothstep(450.0, 1400.0, vViewPosition.z));
          diffuseColor.rgb *= mix(vec3(1.0), clamp(surfaceSample * ${gain.toFixed(2)}, vec3(.48), vec3(1.25)), surfaceStrength);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (surfaceLum - .5) * .1 * surfaceStrength, .12, 1.0);`);
    };
    material.customProgramCacheKey = () => cacheKey + '-river-surface-' + role;
    addNodePatch(material, { kind: 'river-surface', atlas, origin: style.origin, size: style.size, strength: style.strength, gain });
    material.needsUpdate = true;
  }
  return {
    async prepare(signal: AbortSignal) {
      const url = `${import.meta.env.BASE_URL}scenes/residence-four-river-v2/material-atlas.png`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`水城材质加载失败：${url} (${response.status})`);
      const loaded = await createImageBitmap(await response.blob(), {
        imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
      });
      bitmap = loaded;
      if (signal.aborted) { loaded.close(); bitmap = null; signal.throwIfAborted(); }
      const texture = new THREE.Texture(loaded);
      texture.name = 'residence-four-material-atlas';
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; texture.anisotropy = 4; texture.needsUpdate = true;
      atlas.value = texture;
    },
    dispose() { atlas.value?.dispose(); bitmap?.close(); },
  };
}
