// 鱼视图与逻辑同步、插值、朝向和水体边界；斜坡脚底偏移。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import type { Fish, FishSchool, FishState } from '../src/entities/fish.ts';
import { createBody } from '../src/physics/body.ts';
import { FISH_MODEL_RADIUS, FISH_Z_MAX, FISH_Z_MIN, createFishView, fishLaneZ, fishTailPhase0 } from '../src/render/fish-view.ts';
import { FISH_SPECIES, fishSpeciesIndex } from '../src/config/fish-appearance.ts';
import { BLOCK_BACK_Z } from '../src/render/tile-geometry.ts';
import { WATER_FRONT_Z } from '../src/render/water-view.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createDummyEntity } from '../src/entities/entity.ts';
import { createDummyViewFactory, slopeSinkOffset } from '../src/render/entity-views.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';
import { generateFreeWorld } from '../src/world/free-world.ts';
import { createFishSchool } from '../src/entities/fish.ts';

function makeFish(id: number, x: number, y: number, seed = id * 7919, state: FishState = 'swim', facing: 1 | -1 = 1): Fish {
  return { id, lake: 0, seed, body: createBody({ x, y, halfWidth: 0.2, height: 0.25 }), state, timer: 0, facing, dirX: facing, dirY: 0 };
}

function meshOf(root: THREE.Object3D, seed: number): THREE.InstancedMesh {
  const species = FISH_SPECIES[fishSpeciesIndex(seed)]!;
  return root.getObjectByName(`fish-instances-${species.id}`) as THREE.InstancedMesh;
}

function positions(root: THREE.Object3D): number[] {
  const xs: number[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    for (let i = 0; i < object.count; i++) xs.push(instance(object, i).pos.x);
  });
  return xs.sort((a, b) => a - b);
}

function instance(mesh: THREE.InstancedMesh, i: number) {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
  return { pos, nose };
}

describe('fish-view', () => {
  test('真实大世界的完整鱼群能初始化并连续更新', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const level = generateFreeWorld(392740869, size);
      const school = createFishSchool(level.fishSpawns, level.fluid, TUNING.fish);
      const view = createFishView(school);
      try {
        if (size === 'medium') assert.ok(school.fish.length > 64, '复现超过旧容量的真实鱼群');
        assert.doesNotThrow(() => {
          view.update(1, 0);
          view.update(.5, .016);
        }, size);
      } finally { view.dispose(); level.fluid.dispose(); }
    }
  });

  test('混合鱼群增删和重排后，各批次仍显示对应鱼的位置', () => {
    const fish = FISH_SPECIES.map((species, i) => makeFish(i + 1, i + 2, 3, species.sampleSeed));
    const school: FishSchool = { fish: fish.slice(0, 3) };
    const view = createFishView(school);
    view.update(1, 0);
    assert.deepEqual(positions(view.root), [2, 3, 4]);

    school.fish.push(...fish.slice(3));
    view.update(1, 0.016);
    assert.deepEqual(positions(view.root), [2, 3, 4, 5, 6, 7, 8]);

    school.fish.splice(1, 1);
    school.fish.reverse();
    view.update(1, 0.032);
    assert.deepEqual(positions(view.root), [2, 4, 5, 6, 7, 8]);
    for (const f of school.fish) assert.equal(instance(meshOf(view.root, f.seed), 0).pos.x, f.body.x);
    view.dispose();
  });

  test('位置插值 prev→cur，身体中心 = 脚底 + height/2', () => {
    const f = makeFish(1, 2, 3);
    f.body.prevX = 2;
    f.body.prevY = 3;
    f.body.x = 3;
    f.body.y = 4;
    const view = createFishView({ fish: [f] });
    const mesh = meshOf(view.root, f.seed);
    view.update(0.25, 0);
    const p = instance(mesh, 0).pos;
    assert.ok(Math.abs(p.x - 2.25) < 1e-6, `x ${p.x}`);
    assert.ok(Math.abs(p.y - (3.25 + 0.125)) < 0.1, `y ${p.y}`);
    view.update(1, 0.016);
    assert.ok(Math.abs(instance(mesh, 0).pos.x - 3) < 1e-6);
    view.dispose();
  });

  test('朝向：初始即对齐 facing；翻转后平滑转向（中途非瞬变，最终鼻尖朝 −x）', () => {
    const f = makeFish(1, 2, 3, 11, 'swim', 1);
    const view = createFishView({ fish: [f] });
    const mesh = meshOf(view.root, f.seed);
    view.update(1, 0);
    assert.ok(instance(mesh, 0).nose.x > 0.95, 'faces +x initially');
    f.facing = -1;
    view.update(1, 0.016);
    const mid = instance(mesh, 0).nose.x;
    assert.ok(mid < 0.99 && mid > -0.9, `turn is smoothed, nose.x=${mid}`);
    for (let i = 2; i < 120; i++) view.update(1, i * 0.016);
    assert.ok(instance(mesh, 0).nose.x < -0.95, 'faces −x after turning');
    view.dispose();
  });

  test('z 在水体内：车道 z 与模型半径都落在 (BLOCK_BACK_Z, WATER_FRONT_Z) 之间', () => {
    assert.ok(FISH_Z_MIN - FISH_MODEL_RADIUS > BLOCK_BACK_Z, `${FISH_Z_MIN} - ${FISH_MODEL_RADIUS} > ${BLOCK_BACK_Z}`);
    assert.ok(FISH_Z_MAX + FISH_MODEL_RADIUS < WATER_FRONT_Z);
    const fish = Array.from({ length: 40 }, (_, i) => makeFish(i + 1, i, 2, i * 2654435761 >>> 0));
    const view = createFishView({ fish }, { capacity: 40 });
    view.update(1, 0);
    const slots = new Map<number, number>();
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i]!;
      const species = fishSpeciesIndex(f.seed);
      const slot = slots.get(species) ?? 0;
      slots.set(species, slot + 1);
      const z = instance(meshOf(view.root, f.seed), slot).pos.z;
      assert.ok(z >= FISH_Z_MIN && z <= FISH_Z_MAX, `fish ${i} z ${z}`);
      assert.ok(Math.abs(z - fishLaneZ((fish[i] as Fish).seed)) < 1e-5);
    }
    view.dispose();
  });

  test('尾摆相位：flee 比 swim 推进更快；stranded 侧翻', () => {
    const a = makeFish(1, 0, 0, 3, 'swim');
    const b = makeFish(2, 4, 0, 3, 'flee');
    const view = createFishView({ fish: [a, b] });
    const mesh = meshOf(view.root, a.seed);
    view.update(1, 0);
    view.update(1, 0.05);
    const attr = mesh.geometry.getAttribute('aSwim') as THREE.InstancedBufferAttribute;
    assert.ok(attr.getX(1) - fishTailPhase0(b.seed) > attr.getX(0) - fishTailPhase0(a.seed), 'flee tail phase advances faster');

    a.state = 'stranded';
    for (let i = 2; i < 60; i++) view.update(1, i * 0.05);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(m.setPosition(0, 0, 0));
    assert.ok(up.y < 0.7, `stranded fish is rolled onto its side, up.y=${up.y}`);
    view.dispose();
  });

  test('fail-fast：容量超限即抛；容量非法即抛', () => {
    const fish = [makeFish(1, 0, 0), makeFish(2, 1, 0), makeFish(3, 2, 0)];
    const view = createFishView({ fish }, { capacity: 2 });
    assert.throws(() => view.update(1, 0), /capacity/);
    view.dispose();
    assert.throws(() => createFishView({ fish: [] }, { capacity: 0 }), /capacity/);
    assert.throws(() => createFishView({ fish: [] }, { capacity: 1.5 }), /capacity/);
  });
});


describe('斜坡脚底偏移（DESIGN 2.12）', () => {
  /** 第 0 行实心地面；(2,1) 为左低右高斜坡（顶高 1 + fx）。 */
  function slopeMap() {
    const map = createTileMap(16, 8, DEFAULT_TILES);
    for (let x = 0; x < 16; x++) map.set(x, 0, TILE_STONE);
    map.set(2, 1, TILE_STONE);
    map.setShape(2, 1, SHAPE_SLOPE_R);
    return map;
  }
  const sink = TUNING.render.slopeSink;

  test('slopeSinkOffset：坡上下沉、平地为 0、空中为 0、无地形为 0、下沉不超过半宽', () => {
    const map = slopeMap();
    // 坡上：中心列地面 1.5，角支撑脚底 1.9 → (1.5 − 1.9) × sink。
    assert.ok(Math.abs(slopeSinkOffset(map, 2.5, 1.9, true, 0.5, sink) - -0.4 * sink) < 1e-9);
    assert.equal(slopeSinkOffset(map, 5.5, 1, true, 0.5, sink), 0, 'flat ground');
    assert.equal(slopeSinkOffset(map, 2.5, 1.9, false, 0.5, sink), 0, 'airborne');
    assert.equal(slopeSinkOffset(undefined, 2.5, 1.9, true, 0.5, sink), 0, 'no terrain');
    assert.equal(slopeSinkOffset(map, 2.5, 1.9, true, 0.5, 0), 0, 'slopeSink disabled');
    assert.ok(Math.abs(slopeSinkOffset(map, 2.1, 1.9, true, 0.3, 1) - -0.3) < 1e-9, 'clamped to −halfWidth');
    assert.equal(slopeSinkOffset(map, 9.5, 6, true, 0.5, sink), 0, 'no ground within depth → 0');
    assert.throws(() => slopeSinkOffset(map, 2.5, 1.9, true, 0.5, -0.1), /slopeSink/);
  });

  test('假人视图：坡上模型指数平滑下沉、离地后回到 0；不传 terrain 时不偏移', () => {
    const map = slopeMap();
    const dummy = createDummyEntity(7, { x: 2.5, y: 1.9 }, TUNING);
    const b = dummy.body;
    b.prevX = b.x = 2.5;
    b.prevY = b.y = 1.9;
    b.onGround = true;
    const view = createDummyViewFactory({ tuning: TUNING, terrain: map })(dummy);
    const target = 1.9 - 0.4 * sink;
    view.sync(dummy, 1, 1 / 60);
    const first = view.object.position.y;
    assert.ok(first < 1.9 && first > target, `first frame is smoothed: ${first}`);
    for (let i = 0; i < 60; i++) view.sync(dummy, 1, 1 / 60);
    assert.ok(Math.abs(view.object.position.y - target) < 1e-3, `settles at ${target}, got ${view.object.position.y}`);

    b.onGround = false;
    for (let i = 0; i < 60; i++) view.sync(dummy, 1, 1 / 60);
    assert.ok(Math.abs(view.object.position.y - 1.9) < 1e-3, 'airborne returns to body y');
    view.dispose();

    const plain = createDummyViewFactory({ tuning: TUNING })(dummy);
    b.onGround = true;
    plain.sync(dummy, 1, 1 / 60);
    assert.equal(plain.object.position.y, 1.9);
    plain.dispose();
  });

  test('假人视图：平地上不偏移', () => {
    const map = slopeMap();
    const dummy = createDummyEntity(8, { x: 6.5, y: 1 }, TUNING);
    dummy.body.onGround = true;
    const view = createDummyViewFactory({ tuning: TUNING, terrain: map })(dummy);
    for (let i = 0; i < 10; i++) view.sync(dummy, 1, 1 / 60);
    assert.equal(view.object.position.y, 1);
    view.dispose();
  });
});
