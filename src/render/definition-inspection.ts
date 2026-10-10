import * as THREE from 'three';
import type { DefinitionGridCell } from './definition-kit.ts';

export interface DefinitionInspection {
  setWireframe(enabled: boolean): void;
  setLines(visible: boolean): void;
  setTranslucent(enabled: boolean): void;
  dispose(): void;
}

function gridGeometry(cells: readonly DefinitionGridCell[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const segments = new Set<string>();
  const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  for (const { x, y, z, depth } of cells) {
    const corners = [[x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z],
      [x, y, z + depth], [x + 1, y, z + depth], [x + 1, y + 1, z + depth], [x, y + 1, z + depth]];
    for (const [from, to] of edgePairs) {
      const a = corners[from]!;
      const b = corners[to]!;
      const key = [a.join(','), b.join(',')].sort().join(':');
      if (segments.has(key)) continue;
      segments.add(key);
      positions.push(...a, ...b);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
}

/** 矩形格展示定义单元；较淡的真实轮廓展示半砖和斜坡在格内的占用。 */
export function createDefinitionInspection(root: THREE.Group): DefinitionInspection {
  const meshes: THREE.Mesh[] = [];
  const kits: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.name !== 'definition-kit') return;
    kits.push(object);
    object.traverse((part) => {
      if (part instanceof THREE.Mesh) meshes.push(part);
    });
  });

  const edgeGeometries = new Map<THREE.BufferGeometry, THREE.EdgesGeometry>();
  const translucentMaterials = new Map<THREE.Material, THREE.Material>();
  const schematicMaterials = new Map<THREE.Material, THREE.Material>();
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x426c85, transparent: true, opacity: .26, depthWrite: false,
  });
  const gridMaterials = {
    solid: new THREE.LineBasicMaterial({ color: 0x365f78, transparent: true, opacity: .62, depthWrite: false }),
    wall: new THREE.LineBasicMaterial({ color: 0x568e83, transparent: true, opacity: .35, depthWrite: false }),
  };
  for (const material of [lineMaterial, ...Object.values(gridMaterials)]) {
    material.stencilWrite = true;
    material.stencilRef = 1;
    material.stencilFunc = THREE.NotEqualStencilFunc;
    material.stencilWriteMask = 0;
  }
  const grids: THREE.LineSegments[] = [];
  for (const kit of kits) {
    const cells: DefinitionGridCell[] = kit.userData.definitionGrid;
    for (const role of ['solid', 'wall'] as const) {
      const lines = new THREE.LineSegments(gridGeometry(cells.filter(cell => cell.role === role)), gridMaterials[role]);
      lines.renderOrder = 1;
      kit.add(lines);
      grids.push(lines);
    }
  }
  const translucent = (material: THREE.Material): THREE.Material => {
    if (material.transparent && material.name !== 'definition-platform') return material;
    let inspectionMaterial = translucentMaterials.get(material);
    if (!inspectionMaterial) {
      inspectionMaterial = material.clone();
      inspectionMaterial.onBeforeCompile = material.onBeforeCompile;
      inspectionMaterial.customProgramCacheKey = material.customProgramCacheKey;
      inspectionMaterial.transparent = true;
      inspectionMaterial.opacity = material.name === 'definition-wall' ? .25 : .55;
      inspectionMaterial.depthWrite = false;
      translucentMaterials.set(material, inspectionMaterial);
    }
    return inspectionMaterial;
  };
  const schematic = (material: THREE.Material): THREE.Material => {
    let surface = schematicMaterials.get(material);
    if (!surface) {
      surface = material.clone();
      surface.onBeforeCompile = material.onBeforeCompile;
      surface.customProgramCacheKey = material.customProgramCacheKey;
      surface.transparent = true;
      surface.opacity = material.name === 'definition-wall' ? .18 : .38;
      surface.depthWrite = false;
      if (surface instanceof THREE.MeshStandardMaterial) {
        surface.map = null;
        if (material.name === 'definition-stone' || material.name === 'definition-dirt') surface.color.set(0xd6dfda);
      }
      schematicMaterials.set(material, surface);
    }
    return surface;
  };
  const parts = meshes.map((mesh) => {
    let geometry = edgeGeometries.get(mesh.geometry);
    if (!geometry) {
      geometry = new THREE.EdgesGeometry(mesh.geometry, 25);
      edgeGeometries.set(mesh.geometry, geometry);
    }
    const lines = new THREE.LineSegments(geometry, lineMaterial);
    lines.renderOrder = 1;
    mesh.add(lines);
    return {
      mesh, lines, original: mesh.material, castShadow: mesh.castShadow,
      schematic: Array.isArray(mesh.material) ? mesh.material.map(schematic) : schematic(mesh.material),
      translucent: Array.isArray(mesh.material)
        ? mesh.material.map(translucent) : translucent(mesh.material),
    };
  });

  let wireframe = false;
  let translucentEnabled = true;
  let linesEnabled = true;
  const update = (): void => {
    for (const part of parts) {
      part.mesh.material = wireframe ? part.schematic : translucentEnabled ? part.translucent : part.original;
      part.mesh.castShadow = wireframe || translucentEnabled ? false : part.castShadow;
      part.lines.visible = wireframe || linesEnabled;
    }
    for (const lines of grids) lines.visible = wireframe || linesEnabled;
  };
  update();

  return {
    setWireframe(enabled) { wireframe = enabled; update(); },
    setLines(visible) {
      linesEnabled = visible; update();
    },
    setTranslucent(enabled) { translucentEnabled = enabled; update(); },
    dispose() {
      wireframe = false; translucentEnabled = false; update();
      for (const { lines } of parts) lines.removeFromParent();
      for (const lines of grids) { lines.removeFromParent(); lines.geometry.dispose(); }
      for (const geometry of edgeGeometries.values()) geometry.dispose();
      for (const material of translucentMaterials.values()) material.dispose();
      for (const material of schematicMaterials.values()) material.dispose();
      lineMaterial.dispose();
      gridMaterials.solid.dispose();
      gridMaterials.wall.dispose();
    },
  };
}
