import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import { RESIDENCE_WORLD } from '../../config/residence.ts';
import { planTree } from '../../world/trees.ts';
import { buildTreeGeometry } from '../tree/tree-geometry.ts';
import { createTreeMaterials } from '../tree/tree-material.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';
import { createAiCityBatches, type AiCityBatches } from './ai-city-batches.ts';
import { addHarborBuilding, type HarborBuilding } from './harbor-buildings.ts';
import { configureHarborCity } from './harbor-city.ts';
import { createResidenceThreeAtmosphere } from './residence-three-atmosphere.ts';

const LEFT = RESIDENCE_WORLD.minX - 800;
const RIGHT = RESIDENCE_WORLD.maxX + 800;
const GROUND = -2.4;

function finishDistrict(city: AiCityBatches): void {
  configureHarborCity(city);
  const m = city.material;
  m.ivory.color.set('#e9e3d5'); m.ivory.roughness = .64;
  m.blue.color.set('#bfc5c0'); m.blue.metalness = .12; m.blue.roughness = .46;
  m.stone.color.set('#b2afa2'); m.paving.color.set('#8f9b91');
  m.glass.color.set('#526c77'); m.glass.metalness = .2; m.glass.roughness = .18;
  m.cityGlass.color.set('#71858b'); m.cityGlass.metalness = .14;
  m.farGlass.color.set('#95a6a7'); m.far.color.set('#cad1ca');
  m.gold.color.set('#bca67e'); m.gold.emissiveIntensity = 0;
  m.green.color.set('#536b48'); m.window.color.set('#9aadae');
  m.window.emissive.set('#ffd395');
  for (const material of Object.values(m)) {
    material.fog = false;
    material.userData.noLightMap = true;
    material.userData.noPrecip = true;
  }
  city.root.position.y = GROUND;
  city.flush();
}

function addTerraceBlock(city: AiCityBatches, x: number, z: number, width: number, floors: number, seed: number): void {
  const height = floors * 3.1;
  const depth = 15;
  addHarborBuilding(city, { x, z, width, depth, height, kind: 'slab', detail: 2, seed });
  // 实体楼板、遮阳挑檐与内退玻璃形成阴影缝，不把住宅立面画在单个长方体上。
  for (let floor = 1; floor <= floors; floor++) {
    const y = floor * 3.1;
    city.put('panel', 'ivory', x, y, z, width + 2.4, .38, depth + 2.4);
    city.put('panel', 'stone', x, y + .16, z + depth / 2 + .85, width + 2.1, .16, .9);
    for (const side of [-1, 1]) {
      city.put('panel', 'ivory', x + side * (width / 2 + .3), y - 1.5, z, .55, 2.7, depth + 1.2);
      city.put('panel', 'gold', x + side * width * .28, y + .58,
        z + depth / 2 + 1.05, width * .36, .07, .08);
      city.put('panel', 'stone', x + side * width * .32, y + .28,
        z + depth / 2 + .65, width * .23, .45, .95);
      city.put('rock', 'green', x + side * width * .32, y + .64,
        z + depth / 2 + .65, width * .12, .33, .48);
    }
  }
  for (let dx = -width / 2 + 3; dx < width / 2; dx += 4.2) {
    city.put('panel', 'ivory', x + dx, height * .48, z + depth / 2 + .1, .35, height * .88, 1.2);
  }
  city.put('panel', 'paving', x, height + .3, z - 1, width * .65, .4, 8);
  city.put('panel', 'glass', x, height + 1.15, z - 2, width * .47, 1.3, 5);
  city.put('panel', 'ivory', x, height + 1.9, z - 2, width * .5, .18, 5.3);
}

function addTowerFins(city: AiCityBatches, building: HarborBuilding): void {
  const { x, z, width, depth, height } = building;
  if (building.kind !== 'slab') return;
  for (let dx = -width / 2; dx <= width / 2; dx += 3.9) {
    city.put('panel', 'ivory', x + dx, height * .5, z + depth / 2 + .15, .54, height, .9);
    city.put('panel', 'ivory', x + dx, height * .5, z - depth / 2 - .15, .54, height, .9);
  }
  for (let y = 3.2; y < height; y += 3.2) {
    city.put('panel', 'ivory', x, y, z, width + .7, .21, depth + .8);
  }
}

function addEllipticalTower(city: AiCityBatches, x: number, z: number): void {
  city.put('cylinder', 'stone', x, .4, z, 11.4, .8, 8.3);
  city.put('cylinder', 'glass', x, 1.9, z, 10.1, 2.2, 7);
  city.put('cylinder', 'ivory', x, 3.1, z, 11.8, .4, 8.5);
  // 每段的柱子落在下一段实体楼板上，三次退台保留完整的三维轮廓。
  for (const [bottom, floors, radiusX, radiusZ, offset] of [
    [3.3, 6, 10, 7, 0], [22.5, 6, 8.4, 5.9, .8], [41.7, 4, 6.6, 4.7, 1.5],
  ] as const) {
    const height = floors * 3.2;
    const cx = x + offset, cz = z - offset * .4;
    city.put('cylinder', 'glass', cx, bottom + height / 2, cz, radiusX - .7, height, radiusZ - .6);
    for (let floor = 0; floor <= floors; floor++) {
      city.put('cylinder', 'ivory', cx, bottom + floor * 3.2, cz, radiusX + .25, .34, radiusZ + .25);
    }
    for (let column = 0; column < 12; column++) {
      const angle = column * Math.PI / 6;
      city.put('cylinder', 'ivory', cx + Math.cos(angle) * (radiusX - .15),
        bottom + height / 2, cz + Math.sin(angle) * (radiusZ - .15), .24, height, .24);
      if (column % 3 === 0) {
        city.put('panel', 'window', cx + Math.cos(angle) * (radiusX - .58),
          bottom + height / 2, cz + Math.sin(angle) * (radiusZ - .48), .08, height - .6, .08);
      }
    }
    city.put('cylinder', 'gold', cx, bottom + height + .19, cz, radiusX + .27, .07, radiusZ + .27);
  }
  city.put('cylinder', 'ivory', x + 1.5, 54.75, z - .6, 6.7, .5, 4.8);
}

function createWaterfront(homeCenter: number): AiCityBatches {
  const city = createAiCityBatches();
  city.root.name = 'residence-three-waterfront-city';
  const random = mulberry32(0x394b);
  for (let x = LEFT + 22, index = 0; x < RIGHT; x += 48, index++) {
    // 沿岸的公共广场让高楼下半部与后方街区露出来，避免连续屏风。
    if (index % 5 === 2) continue;
    const width = 22 + random() * 10;
    const z = -210 - random() * 10;
    addTerraceBlock(city, x, z, width, 2 + index % 3, index + 914);
    for (const side of [-1, 1]) {
      city.put('panel', 'stone', x + side * (width / 2 + 5), .25, z + 5, 4.8, .5, 5);
    }
  }
  // 两岸之间留给水体，住宅裙房只补在对岸低楼与高层之间的陆地区间。
  for (let x = LEFT + 45, index = 0; x < RIGHT; x += 96, index++) {
    if (index % 4 === 1) continue;
    addTerraceBlock(city, x, -307 - index % 3 * 13, 30 + index % 3 * 6, 2 + index % 2, 1921 + index);
  }
  const x = homeCenter - 43, z = -231;
  // 滨水会展馆的低弧屋面与柱廊提供尺度参照，地标塔在后方抬高。
  city.put('panel', 'glass', x, 4.2, z, 46, 8, 24);
  city.put('dome', 'glass', x, 7.8, z, 25, 7, 14);
  for (let dx = -22; dx <= 22; dx += 4.4) {
    city.put('panel', 'ivory', x + dx, 4.4, z + 12.4, .6, 8.8, .8);
  }
  for (let ring = -2; ring <= 2; ring++) {
    const section = Math.sqrt(1 - (ring * 5.4 / 14) ** 2);
    city.put('ring', 'ivory', x, 7.9, z + ring * 5.4, 25 * section, 7 * section, 9);
  }
  city.put('panel', 'ivory', x, .45, z, 50, .9, 29);
  city.put('panel', 'ivory', x, 8.1, z + 12, 49, .5, 3);
  finishDistrict(city);
  return city;
}

function createSkyline(homeCenter: number, distant: boolean): AiCityBatches {
  const city = createAiCityBatches();
  city.root.name = distant ? 'residence-three-distant-city' : 'residence-three-main-city';
  const random = mulberry32(distant ? 0x39161 : 0x83204);
  const spacing = distant ? 44 : 42;
  const ellipticalLot = Math.round((homeCenter - 25 - LEFT) / spacing);
  const kinds: readonly HarborBuilding['kind'][] = ['slab', 'blade', 'twin', 'stepped', 'blade', 'slab', 'spire', 'stepped'];
  for (let row = 0; row < 2; row++) {
    for (let x = LEFT + row * 21, index = 0; x < RIGHT; x += spacing, index++) {
      const cluster = Math.sin((x - homeCenter) * .018 + row * .9);
      if (random() < (cluster < -.6 ? .62 : .15)) continue;
      const featured = !distant && Math.abs(x - homeCenter) < 330;
      const kind = kinds[(index + row * 3) % kinds.length]!;
      const building: HarborBuilding = {
        x: x + random() * 8, z: (distant ? -750 : -395) - row * (distant ? 160 : 95) - random() * 12,
        width: (11 + random() * 9) * (kind === 'blade' ? .67 : kind === 'spire' ? .74 : 1),
        depth: (13 + random() * 9) * (kind === 'blade' || kind === 'spire' ? .85 : 1),
        height: ((distant ? 19 : 22) + random() * 33 + Math.max(0, cluster) * (distant ? 17 : 22)) * .8,
        kind, detail: distant ? 0 : featured ? 2 : 1, seed: index + row * 97 + (distant ? 822 : 917),
      };
      if (!distant && row === 0 && index === ellipticalLot) {
        addEllipticalTower(city, building.x, building.z);
      } else {
        addHarborBuilding(city, building);
        if (featured) addTowerFins(city, building);
      }
    }
  }
  if (!distant) {
    for (const [dx, z, width, height, kind] of [
      [105, -455, 20, 98, 'spire'], [-152, -440, 22, 74, 'twin'], [290, -510, 19, 86, 'ring'],
    ] as const) {
      addHarborBuilding(city, { x: homeCenter + dx, z, width, depth: 20,
        height, kind, detail: 2, seed: 271 + dx });
    }
  }
  finishDistrict(city);
  return city;
}

function createPromenadeTrees() {
  const root = new THREE.Group(); root.name = 'residence-three-promenade-trees';
  const time = { value: 0 };
  const material = createTreeMaterials(time);
  material.leaf.color.set('#b4ba9a');
  for (const m of [material.leaf, material.bark]) {
    m.fog = false; m.userData.noLightMap = true; m.userData.noPrecip = true;
  }
  const random = mulberry32(0x931ab);
  const geometry = (['broad', 'palm'] as const).map((kind, i) => buildTreeGeometry(planTree(kind, 0, 0, random, i)));
  const transform = new THREE.Object3D();
  const meshes: THREE.InstancedMesh[] = [];
  for (const [i, tree] of geometry.entries()) {
    tree.leaf.computeBoundingBox();
    const bounds = tree.leaf.boundingBox!;
    const center = bounds.getCenter(new THREE.Vector3());
    // 长岸线按街区裁剪，离屏的数百棵树不参与反射和主画面渲染。
    for (let start = LEFT; start < RIGHT; start += 320) {
      const count = Math.ceil((Math.min(RIGHT, start + 320) - start) / 20);
      const bark = new THREE.InstancedMesh(tree.bark, material.bark, count);
      const leaf = new THREE.InstancedMesh(tree.leaf, material.leaf, count);
      for (let j = 0; j < count; j++) {
        const height = (i === 0 ? 5 : 7) + random() * 1.7;
        const scale = height / bounds.max.y;
        transform.position.set(start + j * 20 + i * 7 - center.x * scale,
          GROUND, -191 - i * 6 - center.z * scale * 2.4);
        transform.scale.set(scale, scale, scale * 2.4);
        transform.rotation.set(0, (random() - .5) * .55, 0);
        transform.updateMatrix();
        bark.setMatrixAt(j, transform.matrix); leaf.setMatrixAt(j, transform.matrix);
      }
      for (const mesh of [bark, leaf]) {
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
        mesh.receiveShadow = true; meshes.push(mesh); root.add(mesh);
      }
    }
  }
  return { root, material, dispose() {
    root.removeFromParent(); root.clear();
    for (const mesh of meshes) mesh.dispose();
    for (const tree of geometry) { tree.bark.dispose(); tree.leaf.dispose(); }
    material.dispose();
  } };
}

/** 对岸街区拥有实际街道深度；与玩家的二维碰撞层没有逻辑依赖。 */
export function createResidenceThreeCity(homeCenter: number) {
  const root = new THREE.Group(); root.name = 'residence-three-city';
  const districts = [createWaterfront(homeCenter), createSkyline(homeCenter, false), createSkyline(homeCenter, true)];
  const trees = createPromenadeTrees();
  root.add(...districts.map(city => city.root), trees.root);
  const atmosphere = createResidenceThreeAtmosphere([
    ...districts.flatMap(city => Object.values(city.material)), trees.material.bark, trees.material.leaf,
  ]);
  for (const city of districts) city.setNightFactor(0);
  return { root,
    setWeather(look: PrecipSkyLook) { atmosphere.setWeather(look); },
    setNightFactor(value: number) {
      atmosphere.setNightFactor(value);
      for (const city of districts) city.setNightFactor(value);
    },
    dispose() { root.removeFromParent(); for (const city of districts) city.dispose(); trees.dispose(); root.clear(); },
  };
}
