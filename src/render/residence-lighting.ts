import * as THREE from 'three';
import type { ResidenceLightField } from '../sim/residence-light.ts';

const LIGHTING_FRAGMENT = `
uniform sampler2D residenceSky;
uniform sampler2D residenceBlocked;
uniform vec4 residenceBounds;
uniform vec2 residenceAtlasSize;
varying vec3 residenceWorldPosition;
vec2 residenceUv(vec2 p) { return (p - residenceBounds.xy) / residenceBounds.zw; }
bool residenceOutside(vec2 uv) { return any(lessThan(uv, vec2(0))) || any(greaterThanEqual(uv, vec2(1))); }
vec2 residenceAtlasUv(vec2 uv) {
  float halfWidth = residenceAtlasSize.x - 2.0;
  float section = step(.5, uv.x);
  float x = uv.x * halfWidth * 2.0 - section * halfWidth + 1.0;
  float y = clamp(uv.y * residenceAtlasSize.y * .5, .5, residenceAtlasSize.y * .5 - .5);
  return vec2(x, y + section * residenceAtlasSize.y * .5) / residenceAtlasSize;
}
float residenceSolid(vec2 p) {
  vec2 uv = residenceUv(p);
  if (residenceOutside(uv)) return 0.0;
  return texture2D(residenceBlocked, residenceAtlasUv(uv)).r * 255.0;
}
float residenceSkyAt(vec2 p) {
  vec2 uv = residenceUv(p);
  if (residenceOutside(uv)) return step(1.0, uv.y);
  return texture2D(residenceSky, residenceAtlasUv(uv)).r;
}
float residenceSurfaceSky(vec2 p) {
  float sky = residenceSkyAt(p);
  if (residenceSolid(p) > .5) {
    sky = max(sky, max(max(residenceSkyAt(p + vec2(.5, 0)), residenceSkyAt(p - vec2(.5, 0))),
      max(residenceSkyAt(p + vec2(0, .5)), residenceSkyAt(p - vec2(0, .5)))));
  }
  return sky;
}
float residenceVisibility(vec2 origin, vec2 target) {
  vec2 delta = target - origin;
  float distanceToLight = length(delta);
  if (distanceToLight < .3) return 1.0;
  vec2 direction = delta / distanceToLight;
  bool leavingSurface = residenceSolid(origin) > .5;
  // Half-cell occupancy, quarter-cell steps prevent diagonal gaps between blockers.
  for (int stepIndex = 0; stepIndex < 64; stepIndex++) {
    float alongRay = .3 + float(stepIndex) * .25;
    if (alongRay >= distanceToLight - .15) break;
    vec2 samplePoint = origin + direction * alongRay;
    bool solid = residenceSolid(samplePoint) > .5;
    // The displayed cut face is inside its tile; leave that surface once, never skip a later wall.
    if (leavingSurface) {
      if (!solid) leavingSurface = false;
      else if (alongRay <= 1.5) continue;
    }
    if (solid) return 0.0;
  }
  return 1.0;
}
`;

// Stack the world halves vertically, with adjacent-column gutters for seamless linear filtering.
function packLightAtlas(field: ResidenceLightField, source: Uint8Array) {
  const halfWidth = field.width / 2, width = halfWidth + 2;
  const data = new Uint8Array(width * field.height * 2);
  for (let side = 0; side < 2; side++) {
    for (let y = 0; y < field.height; y++) {
      const start = y * field.width + side * halfWidth;
      const target = (side * field.height + y) * width;
      data.set(source.subarray(start, start + halfWidth), target + 1);
      data[target] = source[start - (side === 0 ? 0 : 1)]!;
      data[target + width - 1] = source[start + halfWidth - (side === 1 ? 1 : 0)]!;
    }
  }
  return { data, width, height: field.height * 2 };
}

/** Apply the same editable-world light field to terrain, characters and furnishings. */
export function createResidenceLighting(initialField: ResidenceLightField) {
  const skyAtlas = packLightAtlas(initialField, initialField.sky);
  const blockedAtlas = packLightAtlas(initialField, initialField.occupied);
  const atlasSize = new THREE.Vector2(skyAtlas.width, skyAtlas.height);
  const skyTexture = new THREE.DataTexture(skyAtlas.data, skyAtlas.width, skyAtlas.height, THREE.RedFormat);
  skyTexture.minFilter = THREE.LinearFilter;
  skyTexture.magFilter = THREE.LinearFilter;
  const blockedTexture = new THREE.DataTexture(blockedAtlas.data, blockedAtlas.width, blockedAtlas.height, THREE.RedFormat);
  skyTexture.needsUpdate = true;
  blockedTexture.needsUpdate = true;
  const bounds = new THREE.Vector4(initialField.minX, initialField.minY,
    initialField.width * initialField.cellSize, initialField.height * initialField.cellSize);
  const materials = new Map<THREE.Material, {
    compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey'];
    installed: THREE.Material['onBeforeCompile']; release: () => void;
  }>();

  function attach(root: THREE.Object3D, character = false) {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshToonMaterial) || materials.has(material)) continue;
        const compile = material.onBeforeCompile;
        const key = material.customProgramCacheKey;
        const originalKey = key.call(material);
        const installed: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
          compile.call(material, shader, renderer);
          shader.uniforms.residenceSky = { value: skyTexture };
          shader.uniforms.residenceBlocked = { value: blockedTexture };
          shader.uniforms.residenceBounds = { value: bounds };
          shader.uniforms.residenceAtlasSize = { value: atlasSize };
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 residenceWorldPosition;')
            .replace('#include <project_vertex>', `#include <project_vertex>
              vec4 residencePosition = vec4(transformed, 1.0);
              #ifdef USE_BATCHING
                residencePosition = batchingMatrix * residencePosition;
              #endif
              #ifdef USE_INSTANCING
                residencePosition = instanceMatrix * residencePosition;
              #endif
              residenceWorldPosition = (modelMatrix * residencePosition).xyz;`);
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin)
            .replace('vec3 geometryPosition =', 'float residenceSkyFactor = residenceSurfaceSky(residenceWorldPosition.xy);\nvec3 geometryPosition =')
            .replace('getPointLightInfo( pointLight, geometryPosition, directLight );', `getPointLightInfo( pointLight, geometryPosition, directLight );
              if (directLight.visible) {
                vec3 residenceToLight = pointLight.position - geometryPosition;
                vec3 residenceWorldDelta = inverseTransformDirection(residenceToLight, viewMatrix) * length(residenceToLight);
                directLight.color *= residenceVisibility(residenceWorldPosition.xy, residenceWorldPosition.xy + residenceWorldDelta.xy);
              }`)
            .replace('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
              {
              vec3 residenceSunDirection = inverseTransformDirection(directLight.direction, viewMatrix);
              directLight.color *= residenceSkyFactor * residenceVisibility(residenceWorldPosition.xy,
                residenceWorldPosition.xy + residenceSunDirection.xy * 16.0);
              }`);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${LIGHTING_FRAGMENT}`)
            .replace('#include <lights_fragment_end>', `
              #if defined(RE_IndirectDiffuse)
                irradiance *= residenceSkyFactor;
                // A diffuse-only readability floor must not create an outdoor reflection underground.
                irradiance += vec3(.10, .12, .16) * (1.0 - residenceSkyFactor);
              #endif
              #if defined(RE_IndirectSpecular)
                iblIrradiance *= residenceSkyFactor;
                radiance *= residenceSkyFactor;
                clearcoatRadiance *= residenceSkyFactor;
              #endif
              #include <lights_fragment_end>
              ${character ? 'vec3 residenceReceivedLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;' : ''}`);
          if (character) {
            // Character art shaders add fixed fill and painted highlights after lighting.
            shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
              float residenceAlbedo = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
              float residenceReceivedLuma = max(dot(residenceReceivedLight, vec3(.2126, .7152, .0722)),
                residenceAlbedo * .03 * (1.0 - residenceSkyFactor));
              float residenceStyledLuma = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(.2126, .7152, .0722));
              float residenceCharacterLight = min(1.0, residenceReceivedLuma / max(residenceStyledLuma, .00001));
              reflectedLight.directDiffuse *= residenceCharacterLight;
              reflectedLight.indirectDiffuse *= residenceCharacterLight;
              reflectedLight.directSpecular *= residenceCharacterLight;
              reflectedLight.indirectSpecular *= residenceCharacterLight;`);
          }
        };
        const release = () => materials.delete(material);
        materials.set(material, { compile, key, installed, release });
        material.onBeforeCompile = installed;
        material.customProgramCacheKey = () => `${originalKey}|residence-light-field-${character}`;
        material.needsUpdate = true;
        // Rebuilt furniture and discarded terrain chunks must not be kept alive by this map.
        material.addEventListener('dispose', release);
      }
    });
  }

  function update(field: ResidenceLightField) {
    skyTexture.image = packLightAtlas(field, field.sky);
    blockedTexture.image = packLightAtlas(field, field.occupied);
    atlasSize.set(skyTexture.image.width, skyTexture.image.height);
    bounds.set(field.minX, field.minY, field.width * field.cellSize, field.height * field.cellSize);
    skyTexture.needsUpdate = true;
    blockedTexture.needsUpdate = true;
  }

  return { attach, update, dispose() {
    for (const [material, previous] of materials) {
      material.removeEventListener('dispose', previous.release);
      if (material.onBeforeCompile !== previous.installed) continue;
      material.onBeforeCompile = previous.compile;
      material.customProgramCacheKey = previous.key;
      material.needsUpdate = true;
    }
    materials.clear();
    skyTexture.dispose();
    blockedTexture.dispose();
  } };
}
