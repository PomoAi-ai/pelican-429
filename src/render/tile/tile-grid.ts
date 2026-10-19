import * as THREE from 'three';

export interface TileGrid {
  readonly visible: boolean;
  setVisible(on: boolean): void;
  dispose(): void;
}

/** 使用逻辑平面上的整数格边界，跟随正式游戏镜头投影；覆盖地形便于检查地下格。 */
export function createTileGrid(scene: THREE.Scene, width: number, height: number): TileGrid {
  const positions: number[] = [];
  for (let x = 0; x <= width; x++) positions.push(x, 0, 0, x, height, 0);
  for (let y = 0; y <= height; y++) positions.push(0, y, 0, width, y, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineDashedMaterial({
    color: 0xd4f5ff, transparent: true, opacity: 0.55,
    dashSize: 0.12, gapSize: 0.10, depthTest: false, depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.computeLineDistances();
  lines.renderOrder = 1000;
  lines.visible = false;
  scene.add(lines);
  return {
    get visible() { return lines.visible; },
    setVisible(on) { lines.visible = on; },
    dispose() {
      lines.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
