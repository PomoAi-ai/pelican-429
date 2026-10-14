import * as THREE from 'three';
import { applyD1StudioLook, D1_STUDIO_VERSIONS, type D1StudioVersion } from './d1-studio-material.ts';
import { createD1InkMaterial } from './d1-ink-material.ts';
import { createD1FiberMaterial } from './d1-fiber-material.ts';
import { createD1GouacheMaterial } from './d1-gouache-material.ts';
import { createD1PaintedMaterial } from './d1-painted-material.ts';
import { createD1LabHair } from './d1-lab-hair.ts';
import { createD1AuthoredHair } from './d1-authored-hair.ts';
import { createD1BlenderHair } from './d1-blender-hair.ts';
import { d1EyeControl } from './d1-anime-material.ts';
import { applyD1LabEyes } from './d1-lab-eyes.ts';
import { studySurface, type StudySource } from './d1-study-surface.ts';

export const D1_LAB_VERSIONS = [
  { id: 'showcase', label: '展示场 · 原版材质', description: '链接中的游戏标准版与原版动漫材质；统一棚光，与展示场环境光照不同。' },
  ...D1_STUDIO_VERSIONS,
  { id: 'v7', label: 'V7 · 发流动画', description: '独立分层着色、随发流移动的高光带，修整发际线。' },
  { id: 'v8', label: 'V8 · 丝绸光泽', description: '双层方向性发丝高光、皮肤柔散射与布料绒光。' },
  { id: 'v9', label: 'V9 · 手绘暖彩', description: '冷暖绘画明暗、固定在表面的轻微笔触，柔暖发束。' },
  { id: 'v10', label: 'V10 · 原画保色', description: '保留头发原画颜色，混入少量柔和光照；皮肤和衣物沿用手绘暖彩。' },
] as const;
export type D1LabVersion = typeof D1_LAB_VERSIONS[number]['id'];
type StudyVersion = Exclude<D1LabVersion, D1StudioVersion | 'showcase'>;
const FACTORIES = { v7: createD1InkMaterial, v8: createD1FiberMaterial, v9: createD1GouacheMaterial, v10: createD1PaintedMaterial } as const;

/** 旧版的材质、几何和着色程序保留；新家族独立拥有自己的材质实例。 */
export function applyD1LabLooks(root: THREE.Object3D, hairStyle: 'showcase' | 'classic' | 'rodin' | 'authored' | 'sculpted' | 'blender') {
  // 正式头发有两个图元，完整保留原网格，不进入只处理单网格的实验适配。
  const hair = hairStyle === 'showcase' ? null : hairStyle === 'blender' ? createD1BlenderHair(root) : hairStyle === 'authored' || hairStyle === 'sculpted'
    ? createD1AuthoredHair(root, hairStyle === 'sculpted' ? 'sculpted' : 'early')
    : createD1LabHair(root, hairStyle);
  const sources: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = [];
  const outlines: THREE.Mesh[] = [];
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.parent instanceof THREE.SkinnedMesh && node.geometry === node.parent.geometry) outlines.push(node);
    else sources.push({ mesh: node, material: node.material });
  });
  const baselineMaterials = new Map<THREE.Material, THREE.Material>();
  const baselineEyes: Array<(closure: number, gaze: THREE.Vector2) => void> = [];
  const baselineGaze = new THREE.Vector2();
  const cloneBaselineMaterial = (source: THREE.Material): THREE.Material => {
    let material = baselineMaterials.get(source);
    if (!material) {
      material = source.clone();
      // clone 不复制着色回调，必须在摄影棚装饰眼睛和描边前保留。
      material.onBeforeCompile = source.onBeforeCompile;
      material.customProgramCacheKey = source.customProgramCacheKey;
      baselineMaterials.set(source, material);
      const eye = d1EyeControl(source);
      if (eye) baselineEyes.push(eye);
    }
    return material;
  };
  const baseline = hairStyle === 'showcase' ? [...sources.map(({ mesh }) => mesh), ...outlines].map(mesh => ({
    mesh, original: mesh.material, visible: mesh.visible, castShadow: mesh.castShadow,
    material: Array.isArray(mesh.material) ? mesh.material.map(cloneBaselineMaterial) : cloneBaselineMaterial(mesh.material),
  })) : [];
  const legacy = applyD1StudioLook(root);
  const studioCastShadows = baseline.map(snapshot => snapshot.mesh.castShadow);
  const eyes = applyD1LabEyes(root);
  const caches = { v7: new Map<THREE.Material, THREE.Material>(), v8: new Map<THREE.Material, THREE.Material>(), v9: new Map<THREE.Material, THREE.Material>(), v10: new Map<THREE.Material, THREE.Material>() };
  const bindings = sources.map(({ mesh, material }) => {
    const previous = mesh.material;
    const create = (version: StudyVersion) => {
      const convert = (source: THREE.Material, index: number): THREE.Material => {
        if (source.name === 'D1 eye' || source.name.startsWith('D1.Covered.') || source.name.startsWith('Flight / ')) {
          return Array.isArray(previous) ? previous[index]! : previous;
        }
        let result = caches[version].get(source);
        if (!result) {
          result = FACTORIES[version](source as StudySource, mesh.userData.characterPart === 'hair' && hair ? hair.geometry : mesh.geometry, studySurface(source));
          caches[version].set(source, result);
        }
        return result;
      };
      return Array.isArray(material) ? material.map(convert) : convert(material, 0);
    };
    return { mesh, previous, v7: create('v7'), v8: create('v8'), v9: create('v9'), v10: create('v10') };
  });
  return {
    setVersion(version: D1LabVersion) {
      for (const [index, snapshot] of baseline.entries()) {
        snapshot.mesh.material = snapshot.original;
        snapshot.mesh.visible = snapshot.visible;
        snapshot.mesh.castShadow = version === 'showcase' ? snapshot.castShadow : studioCastShadows[index]!;
      }
      if (version === 'showcase') {
        for (const snapshot of baseline) snapshot.mesh.material = snapshot.material;
        return;
      }
      if (version === 'v7' || version === 'v8' || version === 'v9' || version === 'v10') {
        legacy.setVersion('v4');
        hair?.setEnabled(true);
        for (const binding of bindings) binding.mesh.material = binding[version];
        for (const outline of outlines) outline.visible = version !== 'v8';
      } else {
        hair?.setEnabled(false);
        for (const binding of bindings) binding.mesh.material = binding.previous;
        legacy.setVersion(version);
      }
    },
    setAnimationVersion(version: 'original' | 'refined') {
      hair?.setMotionVersion(version);
      eyes.setEnabled(version === 'refined');
    },
    setHairMotion(enabled: boolean) { hair?.setMotionEnabled(enabled); },
    resetMotion() { hair?.reset(); },
    setClosure: legacy.setClosure,
    update(dt: number) {
      legacy.update(dt);
      hair?.update(dt);
      for (const eye of baselineEyes) eye(legacy.closure, baselineGaze);
    },
    dispose() {
      for (const snapshot of baseline) snapshot.mesh.material = snapshot.original;
      for (const binding of bindings) binding.mesh.material = binding.previous;
      eyes.dispose();
      for (const cache of Object.values(caches)) for (const material of cache.values()) material.dispose();
      legacy.dispose();
      hair?.dispose();
      for (const material of baselineMaterials.values()) material.dispose();
    },
  };
}
