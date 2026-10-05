import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectPelicanParts, createPelicanRig, PELICAN_PARTS } from '../src/render/pelican/pelican-rig.ts';
import * as beakSplit from '../src/render/pelican/beak-split.ts';
import { BEAK_SIDES, splitPouchGeometry } from '../src/render/pelican/beak-split.ts';
import { SCALE, REST, rig, bare, worldBox, feetMidpoint, beakTip } from './helpers/pelican-fixtures.ts';

describe('pelican rig', () => {
  test('部件齐全且层级正确', () => {
    const r = rig();
    const d = r.diagnostics;
    assert.equal(d.scale, SCALE);
    assert.ok(d.parts.upper >= 30, `upper parts ${d.parts.upper}`);
    assert.equal(d.parts.wing[1], d.parts.wing[-1]);
    assert.ok(d.parts.wing[1] >= 5);
    assert.equal(d.parts.leg[1], 4); // shin + 2 drawn edges + foot
    assert.equal(d.parts.leg[-1], 4);
    for (const name of PELICAN_PARTS.required) {
      assert.equal(r.root.getObjectsByProperty('name', name).length, 1, name);
    }
    for (const name of ['pelican-upper-pivot', 'pelican-wing-pivot-1', 'pelican-wing-pivot--1', 'pelican-leg-pivot-1', 'pelican-leg-pivot--1']) {
      assert.ok(r.root.getObjectByName(name), name);
    }
    // Every pivot lives inside the bird group, so bird.dispose() reaches all meshes.
    const birdGroup = r.root.getObjectByName('standing-pelican');
    assert.ok(birdGroup);
    let meshes = 0;
    birdGroup.traverse((node) => { if ((node as THREE.Mesh).isMesh) meshes++; });
    assert.equal(meshes, d.birdMeshes);
    assert.deepEqual(birdGroup.scale.toArray(), [1, 1, 1]);
  });

  test('髋点来自小腿末顶点', () => {
    const { hips, upperPivot } = rig().diagnostics;
    assert.ok(Math.abs(hips[1][0] - -0.65) < 1e-5 && Math.abs(hips[1][1] - 1.22) < 1e-5 && Math.abs(hips[1][2] - 0.42) < 1e-5);
    assert.ok(Math.abs(hips[-1][0] - -0.17) < 1e-5 && Math.abs(hips[-1][2] - -0.40) < 1e-5);
    assert.ok(Math.abs(upperPivot[0] - -0.41) < 1e-5 && Math.abs(upperPivot[1] - 1.22) < 1e-5);
  });

  test('零姿态包围盒与原始 diagnostics.bounds 缩放平移后一致，脚中点在原点', () => {
    const r = rig();
    r.applyPose(REST);
    const box = worldBox(r.root);
    const { bounds } = r.diagnostics.bird;
    const offset = r.diagnostics.centerOffset;
    for (let i = 0; i < 3; i++) {
      const min = (bounds.min[i]! + offset[i]!) * SCALE;
      const max = (bounds.max[i]! + offset[i]!) * SCALE;
      assert.ok(Math.abs(box.min.getComponent(i) - min) <= 1e-4, `min[${i}] ${box.min.getComponent(i)} vs ${min}`);
      assert.ok(Math.abs(box.max.getComponent(i) - max) <= 1e-4, `max[${i}] ${box.max.getComponent(i)} vs ${max}`);
    }
    const mid = feetMidpoint(r);
    assert.ok(mid.length() < 1e-4, `feet mid ${mid.toArray()}`);
    assert.ok(Math.abs(offset[0] - 0.39) < 1e-6, `center offset x ${offset[0]}`);
    assert.ok(Math.abs(box.min.y) < 1e-3, `feet on ground ${box.min.y}`);
  });

  test('转身 yaw=-π 与中途 -π/2 时两脚中点仍在原点', () => {
    const r = rig();
    for (const yaw of [-Math.PI, -Math.PI / 2]) {
      r.applyPose({ ...REST, yaw });
      const mid = feetMidpoint(r);
      assert.ok(Math.hypot(mid.x, mid.y, mid.z) < 1e-4, `yaw ${yaw} feet mid ${mid.toArray()}`);
    }
    r.applyPose({ ...REST, yaw: -Math.PI });
    const beak = r.root.getObjectByName('standing-pouch');
    assert.ok(beak);
    const box = worldBox(beak);
    assert.ok(box.getCenter(new THREE.Vector3()).x < 0, 'beak faces -X after turning');
    r.applyPose(REST);
  });

  test('姿态作用于枢轴：脚目标前移、前倾、扇翅、眨眼（014 v2：legSwing → feet）', () => {
    const r = rig();
    r.applyPose(REST);
    const footBefore = r.root.getObjectByName('standing-foot-1')!.getWorldPosition(new THREE.Vector3());
    const beakBefore = worldBox(r.root.getObjectByName('standing-pouch')!).getCenter(new THREE.Vector3());
    const wingBefore = worldBox(r.root.getObjectByName('folded-wing-1')!).max.z;
    const forward = { ...REST.feet[0], ankle: [REST.feet[0].ankle[0] + 0.35, REST.feet[0].ankle[1] + 0.1, REST.feet[0].ankle[2]] as [number, number, number] };
    r.applyPose({ ...REST, feet: [forward, REST.feet[1]], lean: -0.5, wingOpen: 1, wingLift: 1, blink: 1 });
    r.root.updateMatrixWorld(true);
    const footAfter = r.root.getObjectByName('standing-foot-1')!.getWorldPosition(new THREE.Vector3());
    const beakAfter = worldBox(r.root.getObjectByName('standing-pouch')!).getCenter(new THREE.Vector3());
    const wingAfter = worldBox(r.root.getObjectByName('folded-wing-1')!).max.z;
    assert.ok(footAfter.x > footBefore.x + 0.1, 'a forward ankle target moves the near foot forward');
    assert.ok(beakAfter.y < beakBefore.y - 0.1, 'negative lean pitches the head down');
    assert.ok(wingAfter > wingBefore + 0.1, 'open wing spreads outward');
    assert.ok(r.root.getObjectByName('standing-eye-1')!.scale.y < 0.5, 'blink squashes the eye');
    r.applyPose(REST);
  });

  test('非法姿态抛异常', () => {
    const r = rig();
    assert.throws(() => r.applyPose({ ...REST, lean: Number.NaN }), /lean/);
    assert.throws(() => r.applyPose({ ...REST, wingOpen: 1.5 }), /wingOpen/);
    assert.throws(() => r.applyPose({ ...REST, bob: 0.5 }), /bob/);
    assert.throws(() => r.applyPose({ ...REST, squash: 1.3 }), /squash/);
    assert.throws(() => r.applyPose({ ...REST, follow: { ...REST.follow, head: 2 } }), /follow\.head/);
    assert.throws(() => r.applyPose({ ...REST, wingBeat: 1.2 }), /wingBeat/);
    assert.throws(() => r.applyPose({ ...REST, wingBeat: Number.NaN }), /wingBeat/);
    r.applyPose(REST);
  });

  test('非法 scale 抛异常', () => {
    assert.throws(() => createPelicanRig({ scale: 0 }), /scale/);
  });
});

describe('collectPelicanParts', () => {
  test('完整鸟可归类所有子节点', () => {
    const parts = collectPelicanParts(bare());
    const total = parts.upper.length + parts.wings[1].length + parts.wings[-1].length + parts.legs[1].length + parts.legs[-1].length;
    assert.equal(total, bare().children.length);
  });

  test('缺件抛异常', () => {
    const clone = bare().clone();
    clone.remove(clone.getObjectByName('standing-shin--1')!);
    assert.throws(() => collectPelicanParts(clone), /standing-shin--1/);
  });

  test('未归类子节点抛异常', () => {
    const clone = bare().clone();
    const stray = new THREE.Mesh();
    stray.name = 'mystery-feather';
    clone.add(stray);
    assert.throws(() => collectPelicanParts(clone), /mystery-feather/);
  });

  test('翅膀部件左右不对称抛异常', () => {
    const clone = bare().clone();
    clone.remove(clone.getObjectByName('wing-feather-1-0-0')!);
    assert.throws(() => collectPelicanParts(clone), /wing-feather-1-0-0/);
  });

  test('鸟 group 缩放不为 1 时抛异常', () => {
    const clone = bare().clone();
    clone.scale.z = 0.5;
    assert.throws(() => collectPelicanParts(clone), /scale/);
  });
});

describe('beak split', () => {
  function pouchGeometry(): THREE.BufferGeometry {
    const pouch = bare().getObjectByName('standing-pouch') as THREE.Mesh;
    return pouch.geometry;
  }

  test('拆分三角数守恒 5472/5472，上喙与下颌互补', () => {
    const g = pouchGeometry();
    const { rings, upper, jaw } = splitPouchGeometry(g);
    assert.equal(BEAK_SIDES, 48);
    assert.equal(rings, 114);
    assert.equal(upper.length / 3, 5472);
    assert.equal(jaw.length / 3, 5472);
    assert.equal(upper.length + jaw.length, g.index!.count);
    const pos = g.getAttribute('position');
    // Every jaw triangle touches the lower half; no upper triangle does.
    const lower = (v: number) => v > 0 && v < pos.count - 1 && (v - 1) % BEAK_SIDES >= 25;
    for (let i = 0; i < upper.length; i += 3) assert.ok(![upper[i]!, upper[i + 1]!, upper[i + 2]!].some(lower));
    for (let i = 0; i < jaw.length; i += 3) assert.ok([jaw[i]!, jaw[i + 1]!, jaw[i + 2]!].some(lower));
  });

  test('布局不符时拆分前抛异常', () => {
    const g = pouchGeometry();
    const noIndex = g.clone();
    noIndex.setIndex(null);
    assert.throws(() => splitPouchGeometry(noIndex), /index/);
    const odd = new THREE.BufferGeometry();
    odd.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 101), 3));
    odd.setIndex([0, 1, 2]);
    assert.throws(() => splitPouchGeometry(odd), /ring/);
    const mirrored = g.clone();
    mirrored.getAttribute('position').setZ(1 + 5 * BEAK_SIDES + 24, 0.9);
    assert.throws(() => splitPouchGeometry(mirrored), /mirror|z/);
    const raised = g.clone();
    raised.getAttribute('position').setY(1 + 5 * BEAK_SIDES + 36, 9);
    assert.throws(() => splitPouchGeometry(raised), /jaw|above/);
    assert.throws(() => splitPouchGeometry(g, 40), /ring|mirror|sides/);
  });

  test('口腔楔形带已移除（不再导出 createMouthWedge）', () => {
    assert.equal((beakSplit as Record<string, unknown>).createMouthWedge, undefined);
  });
});

describe('pelican rig · 走路第三版跟随枢轴', () => {
  const vertexWorld = (mesh: THREE.SkinnedMesh, index: number): THREE.Vector3 => {
    // The bones are the mesh's siblings: settle the whole rig, not just the mesh.
    rig().root.updateMatrixWorld(true);
    return mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  };
  /** Index of the body vertex with the highest y (top of the head) and of one low on the belly. */
  const extremes = (mesh: THREE.SkinnedMesh): { top: number; low: number } => {
    const pos = mesh.geometry.getAttribute('position');
    let top = 0;
    let low = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > pos.getY(top)) top = i;
      if (Math.abs(pos.getY(i) - 1.6) < Math.abs(pos.getY(low) - 1.6)) low = i;
    }
    return { top, low };
  };

  test('头骨点头：喙、帽子与头顶皮肤一起转动，身体下部不动；静止姿态下一切复位', () => {
    const r = rig();
    r.applyPose(REST);
    const body = r.root.getObjectByName('standing-white-body') as THREE.SkinnedMesh;
    assert.ok(body.isSkinnedMesh, 'the body bends with the neck');
    for (const name of ['body-contour-neck-back', 'body-contour-neck-front']) assert.ok((r.root.getObjectByName(name) as THREE.SkinnedMesh).isSkinnedMesh, name);
    const { top, low } = extremes(body);
    const topBefore = vertexWorld(body, top);
    const lowBefore = vertexWorld(body, low);
    const tipBefore = beakTip(r, 'standing-pouch');
    const capBefore = r.root.getObjectByName('standing-cap-assembly')!.getWorldPosition(new THREE.Vector3());
    r.applyPose({ ...REST, follow: { ...REST.follow, head: -0.3 } });
    r.root.updateMatrixWorld(true);
    const tipAfter = beakTip(r, 'standing-pouch');
    const capAfter = r.root.getObjectByName('standing-cap-assembly')!.getWorldPosition(new THREE.Vector3());
    const topAfter = vertexWorld(body, top);
    assert.ok(tipAfter.y < tipBefore.y - 0.2, `bill nods down (${tipBefore.y} → ${tipAfter.y})`);
    assert.ok(capAfter.x > capBefore.x + 0.03, 'cap rides the head forward');
    // The skin on top of the head follows the cap (both rotate about the neck).
    assert.ok(Math.abs(topAfter.distanceTo(topBefore) - capAfter.distanceTo(capBefore)) < 0.08, `head skin follows the cap (${topAfter.distanceTo(topBefore)} vs ${capAfter.distanceTo(capBefore)})`);
    assert.ok(vertexWorld(body, low).distanceTo(lowBefore) < 1e-6, 'the belly stays');
    r.applyPose(REST);
    assert.ok(vertexWorld(body, top).distanceTo(topBefore) < 1e-6);
    assert.ok(beakTip(r, 'standing-pouch').distanceTo(tipBefore) < 1e-6);
  });

  test('头骨平移（点头）：headShift 为鸟空间位移，前倾时也精确；颈部皮肤拉伸，腹部不动', () => {
    const r = rig();
    const body = r.root.getObjectByName('standing-white-body') as THREE.SkinnedMesh;
    const { top, low } = extremes(body);
    const cap = (): THREE.Vector3 => r.root.getObjectByName('standing-cap-assembly')!.getWorldPosition(new THREE.Vector3());
    for (const lean of [0, -0.3]) {
      r.applyPose({ ...REST, lean });
      r.root.updateMatrixWorld(true);
      const capBefore = cap();
      const tipBefore = beakTip(r, 'standing-pouch');
      const topBefore = vertexWorld(body, top);
      const lowBefore = vertexWorld(body, low);
      r.applyPose({ ...REST, lean, follow: { ...REST.follow, headShift: [0.2, -0.06, 0] } });
      r.root.updateMatrixWorld(true);
      // Bird space → world: × scale (0.5), facing +X.
      const d = cap().sub(capBefore);
      assert.ok(Math.abs(d.x - 0.1) < 1e-6 && Math.abs(d.y + 0.03) < 1e-6 && Math.abs(d.z) < 1e-6, `lean ${lean}: head moves by the shift (${d.toArray()})`);
      assert.ok(Math.abs(beakTip(r, 'standing-pouch').x - tipBefore.x - 0.1) < 1e-6, 'the bill rides along');
      assert.ok(Math.abs(vertexWorld(body, top).x - topBefore.x - 0.1) < 1e-3, 'head skin follows');
      assert.ok(vertexWorld(body, low).distanceTo(lowBefore) < 1e-6, 'the belly stays');
    }
    r.applyPose(REST);
    assert.deepEqual(r.root.getObjectByName('pelican-head-bone')!.position.toArray(), [-0.05, 3.3, 0]);
  });

  test('尾巴、围巾、帽子、翅膀摆动与脚蹼拍地压扁作用于各自枢轴；挤压缩放上身（体积守恒）', () => {
    const r = rig();
    r.applyPose(REST);
    const center = (name: string): THREE.Vector3 => worldBox(r.root.getObjectByName(name)!).getCenter(new THREE.Vector3());
    const tail = center('standing-tail-0');
    const scarf = center('scarf-upper-tail');
    const wingNear = center('folded-wing-1');
    const wingFar = center('folded-wing--1');
    const cap = r.root.getObjectByName('standing-cap-assembly')!.rotation.z;
    r.applyPose({ ...REST, follow: { head: 0, headShift: [0, 0, 0], tail: 0.4, tailYaw: 0, scarf: 0.5, cap: 0.2, wingSwing: [0.5, -0.5], footSplat: [0.08, 0] } });
    assert.ok(center('standing-tail-0').y > tail.y + 0.05, 'tail flicks up');
    assert.ok(center('scarf-upper-tail').y > scarf.y + 0.05, 'scarf tails lift');
    assert.ok(Math.abs(r.root.getObjectByName('standing-cap-assembly')!.rotation.z - cap - 0.2) < 1e-12, 'cap wobbles');
    assert.ok(center('folded-wing-1').x > wingNear.x + 0.05, 'near wing swings forward');
    assert.ok(center('folded-wing--1').x < wingFar.x - 0.05, 'far wing swings back');
    const foot = r.root.getObjectByName('standing-foot-1')!.scale;
    assert.ok(Math.abs(foot.x - 1.04) < 1e-12 && Math.abs(foot.y - 0.92) < 1e-12 && Math.abs(foot.z - 1.04) < 1e-12, 'the web slaps flat: thinner, a little wider and longer');
    r.applyPose({ ...REST, squash: 0.94, twist: 0.2 });
    const upper = r.root.getObjectByName('pelican-upper-pivot')!;
    assert.ok(Math.abs(upper.scale.y - 0.94) < 1e-12 && Math.abs(upper.scale.x * upper.scale.y * upper.scale.z - 1) < 1e-12);
    r.applyPose(REST);
    assert.deepEqual(upper.scale.toArray(), [1, 1, 1]);
    assert.deepEqual(r.root.getObjectByName('standing-foot-1')!.scale.toArray(), [1, 1, 1]);
    assert.ok(center('standing-tail-0').distanceTo(tail) < 1e-9 && center('folded-wing-1').distanceTo(wingNear) < 1e-9);
  });
});
