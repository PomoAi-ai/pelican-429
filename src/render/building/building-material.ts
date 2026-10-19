import * as THREE from 'three';
import type { ResidenceMaterial } from '../../config/residence.ts';
import { generateTileTextures, tileLayerIndex, TILE_TEXTURE_PERIOD, type TileTextureData } from '../tile/tile-textures.ts';
import { addNodePatch } from '../stage/node-patches.ts';

export type NaturalBuildingMaterial = Exclude<ResidenceMaterial, 'ceramic' | 'alloy' | 'ashlar'>;
const layers = { grass: 'dirt', dirt: 'dirt', stone: 'stone', sand: 'sand', sandstone: 'sandstone', timber: 'planks' } as const;

let textureData: TileTextureData | undefined;

/** 建造轮廓直接采样游戏地形的纹理，所有形状和加深格共用同一份表面。 */
export function createNaturalBuildingMaterials() {
  const data = textureData ??= generateTileTextures(256);
  const textures = new Map<string, THREE.DataTexture>();
  const materials = new Map<NaturalBuildingMaterial, THREE.MeshStandardMaterial>();
  const texture = (layer: string): THREE.DataTexture => {
    let value = textures.get(layer);
    if (value) return value;
    const length = data.size * data.size * 4, offset = tileLayerIndex(layer) * length;
    value = new THREE.DataTexture(data.data.slice(offset, offset + length), data.size, data.size);
    value.colorSpace = THREE.SRGBColorSpace;
    value.wrapS = value.wrapT = THREE.RepeatWrapping;
    value.minFilter = THREE.LinearMipmapLinearFilter;
    value.magFilter = THREE.LinearFilter;
    value.generateMipmaps = true;
    value.needsUpdate = true;
    textures.set(layer, value);
    return value;
  };
  return {
    get(kind: NaturalBuildingMaterial): THREE.MeshStandardMaterial {
      let value = materials.get(kind);
      if (value) return value;
      value = new THREE.MeshStandardMaterial({ map: texture(layers[kind]), roughness: .93 });
      value.name = `building-${kind}`;
      value.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 buildingPoint; varying vec3 buildingNormal;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nbuildingPoint = (modelMatrix * vec4(position, 1.0)).xyz; buildingNormal = normal;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 buildingPoint; varying vec3 buildingNormal; uniform sampler2D buildingGrass;')
          .replace('#include <map_fragment>', `
            vec3 n = abs(buildingNormal);
            vec2 uv = n.z > 0.5 ? buildingPoint.xy : n.y > n.x ? buildingPoint.xz : buildingPoint.zy;
            vec4 terrainColor = texture2D(map, uv / ${TILE_TEXTURE_PERIOD.toFixed(1)});
            ${kind === 'grass' ? `if (buildingNormal.y > 0.5) terrainColor = texture2D(buildingGrass, uv / ${TILE_TEXTURE_PERIOD.toFixed(1)});` : ''}
            diffuseColor *= terrainColor;`);
        shader.uniforms.buildingGrass = { value: kind === 'grass' ? texture('grassTop') : null };
      };
      value.customProgramCacheKey = () => `natural-building-${kind}`;
      addNodePatch(value, { kind: 'natural-building', grass: kind === 'grass' ? texture('grassTop') : null, period: TILE_TEXTURE_PERIOD });
      materials.set(kind, value);
      return value;
    },
    dispose(): void {
      for (const material of materials.values()) material.dispose();
      for (const map of textures.values()) map.dispose();
    },
  };
}
