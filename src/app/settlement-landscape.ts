import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import { createDefinitionKit } from '../render/definition-kit.ts';
import { createTreeView } from '../render/tree-view.ts';
import { planTree } from '../world/trees.ts';
import type { TreeKind } from '../world/level.ts';
import type { DepthLayerId } from './definition-depth-layout.ts';
import { buildDepthScenery, type DepthTheme } from './depth-scenery.ts';
import { createDepthLandscapeDetails } from './depth-landscape-details.ts';

type TreeSite = readonly [x: number, y: number, kind: TreeKind];
const DISTRICTS: readonly {
  theme: DepthTheme; x: number; y: number; trees: readonly TreeSite[];
}[] = [
  { theme: 'valley', x: 0, y: 2, trees: [[6, 2, 'sakura'], [38, 3, 'birch']] },
  { theme: 'buildings', x: 48, y: 2, trees: [[12, 1, 'oak'], [28, 3, 'sakura']] },
  { theme: 'lake', x: 88, y: 2, trees: [[6, 2, 'pine'], [40, 2, 'willow']] },
  { theme: 'cave', x: 122, y: -8, trees: [] },
  { theme: 'coast', x: 164, y: 2, trees: [[4, 2, 'palm'], [44, 3, 'palm']] },
  { theme: 'ruins', x: 192, y: 2, trees: [[12, 1, 'dead'], [34, 1, 'willow']] },
];
const LAYERS = [['foreground', 1.2], ['background-near', 4], ['background-far', 10]] as const;

/** 景观为贯通路线提供地标与纵深，不把后方山石和树冠加入玩家碰撞。 */
export function createSettlementLandscape() {
  const root = new THREE.Group();
  root.name = 'settlement-landscape';
  const kits: ReturnType<typeof createDefinitionKit>[] = [];
  const details: ReturnType<typeof createDepthLandscapeDetails>[] = [];
  const groves: ReturnType<typeof createTreeView>[] = [];
  const groveView = { x: 0, y: -8, w: 48, h: 40 };

  for (const [index, district] of DISTRICTS.entries()) {
    const group = new THREE.Group();
    group.name = `settlement-${district.theme}`;
    // 交接区的后景略微错层，避免相邻岸崖与残墙共面闪烁。
    group.position.set(district.x, district.y, index * .08);
    root.add(group);
    const detailLayers = new Map<DepthLayerId, THREE.Group>();
    const layers = new Map<DepthLayerId, THREE.Group>();
    for (const [id, z] of LAYERS) {
      const layer = new THREE.Group();
      layer.name = `${district.theme}-${id}`;
      layer.position.z = z;
      group.add(layer);
      layers.set(id, layer);
      const kit = createDefinitionKit();
      // 实色背景与主路的透视格区分，避免整个远处街区也铺满检查线。
      kit.root.name = 'settlement-scenery';
      buildDepthScenery(kit, district.theme, id);
      layer.add(kit.root);
      kits.push(kit);
      kit.root.traverse(object => {
        if (object instanceof THREE.Mesh) object.castShadow = false;
      });
      const decor = new THREE.Group();
      // 自然资源沿用游戏的 +Z 前方，装入定义坐标时只转换一次。
      decor.scale.z = -1;
      layer.add(decor);
      detailLayers.set(id, decor);
    }
    details.push(createDepthLandscapeDetails(district.theme, detailLayers));
    if (district.trees.length) {
      const trees = district.trees.map(([x, y, kind], treeIndex) =>
        planTree(kind, x, y, mulberry32(429 + index * 97 + treeIndex), treeIndex));
      const grove = createTreeView(trees);
      grove.root.scale.z = -1;
      layers.get('background-near')!.add(grove.root);
      grove.update(groveView);
      groves.push(grove);
    }
  }

  // 后侧岛沿承托树根，树冠留在玩家后方，岛底仍保留空气。
  const islandBank = createDefinitionKit();
  islandBank.root.name = 'settlement-scenery';
  islandBank.root.position.z = 4;
  for (let x = 204; x < 207; x++) islandBank.solid('B', x, 20.5);
  root.add(islandBank.root);
  kits.push(islandBank);
  const island = createTreeView([planTree('oak', 205, 21, mulberry32(20260930), 0)]);
  island.root.scale.z = -1;
  island.root.position.z = 4;
  root.add(island.root);
  const islandView = { x: 198, y: 14, w: 18, h: 24 };
  island.update(islandView);
  return {
    root,
    update(time: number): void {
      for (const detail of details) detail.update(time);
      for (const grove of groves) grove.update(groveView, time);
      island.update(islandView, time);
    },
    dispose(): void {
      island.dispose();
      for (const grove of groves) grove.dispose();
      for (const detail of details) detail.dispose();
      for (const kit of kits) kit.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
