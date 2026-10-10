import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { D1_MODELS, GRASSY_HEIGHT, GRASSY_MODELS } from '../../config/grassy.ts';
import type { GrassyModelVariant } from '../../config/grassy.ts';

export interface GrassyStaticModel {
  readonly root: THREE.Group;
  dispose(): void;
}

const assets = new Map<GrassyModelVariant, THREE.Group>();
const loading = new Map<GrassyModelVariant, Promise<void>>();

function disposeScene(scene: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}

function readStaticAsset(gltf: GLTF, path: string): THREE.Group {
  const { scene } = gltf;
  try {
    const bounds = new THREE.Box3().setFromObject(scene);
    const height = bounds.max.y - bounds.min.y;
    if (bounds.isEmpty() || !Number.isFinite(height)) throw new Error(`Grassy 静态模型 ${path} 没有有效几何`);
    if (Math.abs(bounds.min.y) > 0.02 || Math.abs(height - GRASSY_HEIGHT) > 0.02) {
      throw new Error(`Grassy 静态模型 ${path} 尺寸不符：脚底 ${bounds.min.y}、全高 ${height}；应为 0 和 ${GRASSY_HEIGHT}`);
    }
    if (gltf.animations.length > 0) throw new Error(`Grassy 静态模型 ${path} 不应包含动作`);
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return scene;
  } catch (error) {
    disposeScene(scene);
    throw error;
  }
}

/**
 * Loads one version on first use: all versions together are hundreds of MB, parsing them up front
 * stalls the page while only a few are on screen. Callers share geometry, materials and dimensions.
 */
export function loadGrassyStaticAsset(variant: GrassyModelVariant): Promise<void> {
  let pending = loading.get(variant);
  if (!pending) {
    const { path } = [...GRASSY_MODELS, ...D1_MODELS].find((model) => model.id === variant)!;
    pending = new GLTFLoader().loadAsync(path).then((gltf) => { assets.set(variant, readStaticAsset(gltf, path)); });
    loading.set(variant, pending);
  }
  return pending;
}

export function createGrassyStaticModel(variant: GrassyModelVariant): GrassyStaticModel {
  const asset = assets.get(variant);
  if (!asset) throw new Error(`Grassy 静态模型 ${variant} 尚未加载；请先等待 loadGrassyStaticAsset()`);
  const root = asset.clone(true);
  root.name = `grassy-${variant}`;
  return {
    root,
    dispose() {
      root.removeFromParent();
      root.clear();
    },
  };
}

/** Dispose instances first; their meshes share these resources. */
export function disposeGrassyStaticAssets(): void {
  for (const scene of assets.values()) disposeScene(scene);
  assets.clear();
  loading.clear();
}
