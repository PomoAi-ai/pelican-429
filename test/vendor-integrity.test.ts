// vendor 完整性（任务 014 D1）：src/vendor/pelican-3d 下的 .js 必须与 ORIGIN.md 哈希表逐字节一致，
// 且表格与目录一一对应；另以运行时调用核对手写 .d.ts 声明的入口形状（typecheck 同时校验调用签名）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { RIDE_RIGS, validateRig } from '../src/vendor/pelican-3d/standing-ride/ride-rig.js';
import { createRideBicycle } from '../src/vendor/pelican-3d/standing-ride/ride-bicycle.js';
import { createBentLeg } from '../src/vendor/pelican-3d/standing-ride/ride-leg.js';
import { birdPlacement, birdToRide, pedalLegs, rideToBird } from '../src/vendor/pelican-3d/standing-ride/ride-motion.js';
import { rideLegOptions, solveRideWing, wingPose } from '../src/vendor/pelican-3d/standing-ride/riding-pelican.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'src', 'vendor', 'pelican-3d');

function listJs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listJs(full));
    else if (name.endsWith('.js')) out.push(path.relative(VENDOR, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function originTable(): Map<string, string> {
  const md = readFileSync(path.join(VENDOR, 'ORIGIN.md'), 'utf8');
  const rows = new Map<string, string>();
  for (const m of md.matchAll(/^\|\s*([\w./-]+\.js)\s*\|\s*([0-9a-f]{64})\s*\|\s*$/gm)) {
    const [, file, hash] = m as unknown as [string, string, string];
    assert.ok(!rows.has(file), `ORIGIN.md lists ${file} twice`);
    rows.set(file, hash);
  }
  return rows;
}

const sha256 = (rel: string): string => createHash('sha256').update(readFileSync(path.join(VENDOR, rel))).digest('hex');

test('vendor-integrity: ORIGIN.md 哈希表与目录中的 .js 一一对应（20 个）', () => {
  const table = originTable();
  assert.equal(table.size, 20, 'ORIGIN.md should list the 20 vendored files');
  assert.deepEqual(listJs(VENDOR), [...table.keys()].sort());
});

test('vendor-integrity: 每个 vendor .js 的 SHA-256 与 ORIGIN.md 一致（禁止修改 vendor）', () => {
  const bad: string[] = [];
  for (const [file, hash] of originTable()) {
    const actual = sha256(file);
    if (actual !== hash) bad.push(`${file}: expected ${hash}, got ${actual}`);
  }
  assert.deepEqual(bad, []);
});

test('vendor-integrity: 旧 vendor 目录 src/vendor/pelican 已移除', () => {
  assert.deepEqual(readdirSync(path.join(ROOT, 'src', 'vendor')), ['pelican-3d']);
});

test('vendor .d.ts: ride-rig 矮车数据与 validateRig', () => {
  const rig = RIDE_RIGS.short;
  assert.equal(rig.style, 'hop');
  assert.equal(validateRig(rig), rig);
  assert.equal(rig.bike.scale, 0.6);
  assert.ok(rig.bike.tyreOuter > 0 && rig.bike.crankLength > 0);
  assert.deepEqual([...rig.bird.hip], [-0.45, 1.05, 0.41]);
  assert.equal(rig.bird.thigh, 0.67);
  assert.equal(rig.bird.shin, 1.08);
  assert.ok(rig.hop.flap.open > 0);
  assert.ok(Object.isFrozen(rig.bike));
  assert.throws(() => validateRig({ ...rig, style: 'nope' } as unknown as typeof rig), RangeError);
});

test('vendor .d.ts: ride-motion 踏板腿与鸟/骑行坐标互逆', () => {
  const rig = RIDE_RIGS.short;
  const legs = pedalLegs(0.7, rig.bird.bob / 2, rig);
  assert.equal(legs.length, 2);
  assert.deepEqual(legs.map((l) => l.side), [1, -1]);
  for (const leg of legs) for (const key of ['pedal', 'sole', 'ankle', 'hip', 'knee'] as const) assert.equal(leg[key].length, 3);
  const placement = birdPlacement(0, rig);
  assert.equal(placement.rotationZ, -rig.bird.lean);
  assert.equal(placement.position.length, 3);
  const p = [0.3, 1.2, 0.4] as const;
  const back = rideToBird(birdToRide(p, 0.01, rig), 0.01, rig);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs((back[i] as number) - (p[i] as number)) < 1e-12);
});

test('vendor .d.ts: riding-pelican 翅膀与弯腿参数', () => {
  const rig = RIDE_RIGS.short;
  const wing = solveRideWing(rig);
  assert.equal(wing.quaternion.length, 4);
  assert.ok(wing.share >= rig.bird.wing.shareRange[0] && wing.share <= rig.bird.wing.shareRange[1]);
  const rest = wingPose(0, 1, wing, rig);
  assert.ok(rest.position instanceof THREE.Vector3 && rest.quaternion instanceof THREE.Quaternion);
  assert.equal(rest.position.length(), 0);
  const held = wingPose(1, -1, wing, rig);
  assert.ok(held.position.z < 0, 'far wing mirrors z');
  const opts = rideLegOptions(rig);
  assert.ok(opts.rows >= 2 && opts.columns >= 3 && opts.fillet > 0);
  assert.ok(opts.radius(0.5) > 0 && opts.restRadius(0.5) > 0);
});

test('vendor .d.ts: createBentLeg 与 createRideBicycle 可构建、更新、释放', () => {
  const rig = RIDE_RIGS.short;
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const leg = createBentLeg(parent, 'leg-test', material, rideLegOptions(rig));
  assert.equal(leg.mesh.parent, parent);
  const [near] = pedalLegs(0, 0, rig);
  leg.check(near.hip, near.knee, near.ankle, 0);
  leg.setJoints(near.hip, near.knee, near.ankle, 0);
  assert.equal(leg.diagnostics().mix, 0);
  assert.throws(() => leg.setJoints(near.hip, near.knee, near.ankle, 2), RangeError);
  leg.mesh.geometry.dispose();
  material.dispose();

  const bike = createRideBicycle(rig);
  assert.equal(bike.group.name, 'ride-bicycle');
  const crankAngle = 1.1;
  bike.update({ wheelAngle: -0.4, crankAngle, chainTravel: 0.2, legs: pedalLegs(crankAngle, 0, rig) });
  const d = bike.diagnostics();
  assert.equal(d.crankAngle, crankAngle);
  assert.equal(d.wheelAngle, -0.4);
  assert.ok(d.drawCalls > 0);
  assert.equal(bike.parts.crank.group.rotation.z, crankAngle);
  // 踏板不在曲柄末端时 readPose 抛错。
  assert.throws(() => bike.update({ wheelAngle: 0, crankAngle: 0, chainTravel: 0, legs: pedalLegs(crankAngle, 0, rig) }), RangeError);
  bike.dispose();
  assert.throws(() => bike.diagnostics(), Error);
});
