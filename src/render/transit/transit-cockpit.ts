import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TRANSIT, transitHullRadiusAt } from '../../config/transit.ts';
import { mergeStaticParts } from '../stage/merge-static-parts.ts';
import type { Palette } from './transit-center-model.ts';

type Point = readonly [number, number, number];

const FLOOR = TRANSIT.cabinFloor;
// Pilot eye while standing at the seat (TRANSIT.seatY, TRANSIT_HATCH.seatZ); console screens face it.
const EYE = new THREE.Vector3(0, FLOOR + 2.5, 1.15);
const TILE = { w: 512, h: 256, cols: 2, rows: 3 } as const;
const Tile = { Flight: 0, Orbit: 1, Systems: 2, Cabin: 3, Switches: 4, Keys: 5 } as const;
type Tile = typeof Tile[keyof typeof Tile];
/** Rocket-local origin of the seated pilot (feet plane under the hips): hips land on the seat pan, back against the pad. */
export const COCKPIT_SEAT = { y: FLOOR, z: .62 } as const;
// Keyboard deck top under the seated pilot's fingers (grassy-seated KEYS, offset by COCKPIT_SEAT).
const KEYBOARD = { y: FLOOR + 1.8, z: COCKPIT_SEAT.z + .68 } as const;

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('星舰座舱贴图需要 canvas 2D 上下文');
  return ctx;
}

function texture(ctx: CanvasRenderingContext2D, repeat: boolean): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(ctx.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  if (repeat) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ui-monospace, Menlo, monospace`;
  ctx.fillText(value, x, y);
}

/** One quilted soft-lining panel per repeat: lighter crown, darker seams, a stitched inset. */
function paddedTexture(): THREE.CanvasTexture {
  const ctx = canvas(256, 256);
  ctx.fillStyle = '#7d8893';
  ctx.fillRect(0, 0, 256, 256);
  const crown = ctx.createRadialGradient(128, 118, 10, 128, 128, 170);
  crown.addColorStop(0, '#eef2f4');
  crown.addColorStop(.7, '#c9d1d8');
  crown.addColorStop(1, '#9aa5af');
  ctx.fillStyle = crown;
  ctx.beginPath(); ctx.roundRect(7, 7, 242, 242, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(92,104,116,.55)'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.roundRect(22, 22, 212, 212, 18); ctx.stroke();
  return texture(ctx, true);
}

/** Harness webbing along its length: tight weave ribs and a stitched seam inside each edge. */
function webbingTexture(): THREE.CanvasTexture {
  const ctx = canvas(64, 128);
  ctx.fillStyle = '#272d35';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#323a44';
  for (let y = 0; y < 128; y += 4) ctx.fillRect(0, y, 64, 2);
  ctx.strokeStyle = '#6b7582'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  for (const x of [7, 57]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
  const map = texture(ctx, true);
  map.repeat.set(1, 5);
  return map;
}

function flightTile(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.beginPath(); ctx.arc(130, 128, 98, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#1d5ea8'; ctx.fillRect(30, 20, 200, 120);
  ctx.fillStyle = '#3b2b1f'; ctx.fillRect(30, 128, 200, 120);
  ctx.strokeStyle = '#f2f7ff'; ctx.lineWidth = 3;
  for (const dy of [-50, -25, 25, 50]) { ctx.beginPath(); ctx.moveTo(100, 128 + dy); ctx.lineTo(160, 128 + dy); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(30, 128); ctx.lineTo(230, 128); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(88, 128); ctx.lineTo(118, 128); ctx.lineTo(130, 140); ctx.lineTo(142, 128); ctx.lineTo(172, 128); ctx.stroke();
  ctx.strokeStyle = '#5fe3ff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(130, 128, 104, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  label(ctx, 'ALT 412.6 KM', 262, 62, 26, '#8fe9ff');
  label(ctx, 'VEL 7.66 KM/S', 262, 104, 26, '#8fe9ff');
  label(ctx, 'T+ 00:12:41', 262, 146, 26, '#d8f6ff');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i < 6 ? '#3fe08b' : '#26425a';
    ctx.fillRect(264 + i * 28, 186, 22, 34);
  }
}

function orbitTile(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#123a56'; ctx.lineWidth = 1.5;
  for (let x = 16; x < 512; x += 48) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 246); ctx.stroke(); }
  for (let y = 22; y < 256; y += 42) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(502, y); ctx.stroke(); }
  ctx.fillStyle = '#1b5470';
  for (const [x, y, rx, ry] of [[110, 92, 70, 42], [150, 170, 34, 50], [300, 84, 92, 36], [350, 160, 40, 30], [440, 190, 38, 22]] as const) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, .3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#4fe3ff'; ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = 10; x <= 502; x += 6) ctx.lineTo(x, 128 - Math.sin((x - 60) / 78) * 72);
  ctx.stroke();
  ctx.fillStyle = '#fff2b0';
  ctx.beginPath(); ctx.arc(318, 128 - Math.sin(258 / 78) * 72, 10, 0, Math.PI * 2); ctx.fill();
  label(ctx, 'ORBIT 51.6°', 20, 236, 24, '#8fe9ff');
}

function systemsTile(ctx: CanvasRenderingContext2D): void {
  const levels = [.82, .64, .9, .45, .73, .58];
  levels.forEach((level, i) => {
    const x = 26 + i * 44;
    ctx.fillStyle = '#18324a'; ctx.fillRect(x, 40, 28, 170);
    ctx.fillStyle = level < .5 ? '#ffb347' : '#3fe08b';
    ctx.fillRect(x, 40 + 170 * (1 - level), 28, 170 * level);
  });
  for (const [x, value, color] of [[350, .72, '#5fe3ff'], [450, .38, '#ffb347']] as const) {
    ctx.lineWidth = 12; ctx.strokeStyle = '#18324a';
    ctx.beginPath(); ctx.arc(x, 96, 40, Math.PI * .75, Math.PI * 2.25); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, 96, 40, Math.PI * .75, Math.PI * (.75 + 1.5 * value)); ctx.stroke();
  }
  label(ctx, 'PWR  LOX  CH4', 300, 196, 22, '#8fe9ff');
  label(ctx, 'NOMINAL', 300, 232, 26, '#3fe08b');
}

function cabinTile(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#163f60'; ctx.fillRect(0, 0, 512, 46);
  label(ctx, 'CABIN  ECLSS', 18, 32, 26, '#d8f6ff');
  label(ctx, '101.3 kPa', 300, 104, 40, '#8fe9ff');
  label(ctx, '21.4 °C', 300, 158, 40, '#8fe9ff');
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i === 2 ? '#ffb347' : '#3fe08b';
    ctx.beginPath(); ctx.arc(34, 84 + i * 44, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4b7090'; ctx.fillRect(56, 76 + i * 44, 170 - i * 22, 16);
  }
}

function switchesTile(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#26303b'; ctx.fillRect(0, 0, 512, 256);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
    const x = 22 + col * 61, y = 26 + row * 78;
    ctx.fillStyle = '#121820'; ctx.beginPath(); ctx.roundRect(x, y, 44, 52, 7); ctx.fill();
    ctx.fillStyle = '#c4ccd4'; ctx.beginPath(); ctx.roundRect(x + 15, y + ((row + col) % 3 === 0 ? 24 : 6), 14, 22, 4); ctx.fill();
    ctx.fillStyle = (row * 8 + col) % 5 === 1 ? '#ffb347' : '#3fe08b';
    ctx.beginPath(); ctx.arc(x + 22, y + 62, 4, 0, Math.PI * 2); ctx.fill();
  }
}

/** Backlit keycaps: five staggered rows and a space bar. */
function keysTile(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#10161e'; ctx.fillRect(0, 0, 512, 256);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 13 - (row === 4 ? 0 : row % 2); col++) {
    if (row === 4 && col > 3 && col < 9) continue;
    const x = 12 + col * 38 + (row % 2) * 19, y = 12 + row * 48;
    ctx.fillStyle = '#5fe3ff'; ctx.fillRect(x - 1, y - 1, 34, 42);
    ctx.fillStyle = (row + col) % 7 === 3 ? '#ffd9a0' : '#d9e3ea'; ctx.fillRect(x + 1, y + 1, 30, 38);
  }
  ctx.fillStyle = '#5fe3ff'; ctx.fillRect(163, 203, 186, 42);
  ctx.fillStyle = '#d9e3ea'; ctx.fillRect(165, 205, 182, 38);
}

/** Display atlas: dark glass tiles of flight, orbit, systems and cabin pages, a switch bank and a keyboard. */
function displayTexture(): THREE.CanvasTexture {
  const ctx = canvas(TILE.w * TILE.cols, TILE.h * TILE.rows);
  ctx.fillStyle = '#04101e';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  [flightTile, orbitTile, systemsTile, cabinTile, switchesTile, keysTile].forEach((paint, i) => {
    ctx.save();
    ctx.translate(i % TILE.cols * TILE.w, Math.floor(i / TILE.cols) * TILE.h);
    ctx.beginPath(); ctx.rect(0, 0, TILE.w, TILE.h); ctx.clip();
    paint(ctx);
    ctx.restore();
  });
  return texture(ctx, false);
}

function tileGeometry(tile: Tile, width: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv');
  const col = tile % TILE.cols, row = Math.floor(tile / TILE.cols);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / TILE.cols, 1 - (row + 1 - uv.getY(i)) / TILE.rows);
  return geometry;
}

/** Scales plane-like UVs so the quilt repeats at a fixed panel size. */
function quilted<T extends THREE.BufferGeometry>(geometry: T, across: number, panel: number, bottom: number): T {
  const uv = geometry.getAttribute('uv'), position = geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * across, (position.getY(i) - bottom) / panel);
  return geometry;
}

/** 星舰与着陆舱共用的驾驶舱内饰：软包内衬、环肋、带头枕与安全带的座椅、仪表台触控屏、后舱壁显示与开关面板、舱内照明。 */
export function createCockpitInterior(rocket: THREE.Group, p: Palette): void {
  const interior = new THREE.Group();
  interior.name = 'crew cockpit interior';
  rocket.add(interior);
  const displays = displayTexture(), padding = paddedTexture(), weave = webbingTexture();
  const screen = new THREE.MeshBasicMaterial({ map: displays, toneMapped: false });
  const padded = new THREE.MeshStandardMaterial({ map: padding, roughness: .92, side: THREE.DoubleSide });
  const webbing = new THREE.MeshStandardMaterial({ map: weave, roughness: .96 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff3e2, emissive: 0xffe9cc, emissiveIntensity: 2.2 });
  // Callers free materials by walking the tree; the canvases go with them.
  screen.addEventListener('dispose', () => displays.dispose());
  padded.addEventListener('dispose', () => padding.dispose());
  webbing.addEventListener('dispose', () => weave.dispose());

  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, position: Point) => {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.receiveShadow = true;
    object.position.set(...position);
    interior.add(object);
    return object;
  };
  const block = (name: string, position: Point, size: Point, material: THREE.Material, radius = .04) =>
    part(new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(value => value / 3))), material, name, position);

  // Soft lining on the aft bulkhead behind the seat and on the curved wall around it.
  block('aft pressure bulkhead', [0, 20.06, -1.53], [3.1, 3.35, .16], p.dark, .12);
  part(quilted(new THREE.PlaneGeometry(3, 3.2), 4, .8, -1.6), padded, 'aft quilted soft lining', [0, 20.0, -1.44]);
  const liner: THREE.Vector2[] = [];
  for (const y of [FLOOR + .3, 18.7, 19.2, 20, 20.9, 21.7, 21.95]) liner.push(new THREE.Vector2(transitHullRadiusAt(y) - .1, y));
  // Wraps from the window pillar round the back to the hatch jamb, so no bare lining shows beside the flat bulkhead.
  part(quilted(new THREE.LatheGeometry(liner, 64, .95, 3.25), 11, .8, FLOOR + .3), padded, 'curved quilted soft lining', [0, 0, 0]);
  // Frames that carry the lining: vertical ribs along the hull profile and arcs at the kick strip and cove.
  const ribPath = new THREE.CatmullRomCurve3([FLOOR, 18.7, 19.2, 20, 20.9, 21.7, 22.05]
    .map(y => new THREE.Vector3(0, y, transitHullRadiusAt(y) - .1)));
  const ribAngles = [.93, 1.5, 2.07, 5.29];
  const ribs = new THREE.InstancedMesh(new THREE.TubeGeometry(ribPath, 24, .05, 6, false), p.satin, ribAngles.length);
  ribs.name = 'cabin frame ribs';
  const matrix = new THREE.Matrix4();
  ribAngles.forEach((angle, i) => ribs.setMatrixAt(i, matrix.makeRotationY(angle)));
  ribs.computeBoundingSphere();
  interior.add(ribs);
  for (const [y, material] of [[18.42, p.cyan], [21.58, lamp]] as const) {
    // Arc from hull angle .93 to 2.07 (see the window frame for the torus-to-hull angle mapping).
    const arc = new THREE.TorusGeometry(transitHullRadiusAt(y) - .1, .035, 5, 24, 1.14).rotateX(Math.PI / 2).rotateY(2.07 - Math.PI / 2);
    part(arc, material, 'starboard frame light rail', [0, y, 0]);
  }
  block('aft cove light', [0, 21.62, -1.4], [2.8, .05, .06], lamp, .02);
  block('aft floor guide light', [0, 18.3, -1.4], [2.6, .035, .05], p.cyan, .01);

  // Aft wall stations either side of the seat: environment status page and a breaker / switch bank.
  for (const [x, tile] of [[.98, Tile.Cabin], [-.98, Tile.Switches]] as const) {
    block('aft station bezel', [x, 20.72, -1.43], [.74, .5, .05], p.dark, .03);
    part(tileGeometry(tile, .66, .42), screen, 'aft station display', [x, 20.72, -1.4]);
  }
  // Overhead panel tipped toward the seat, reachable above the pilot's head.
  const overhead = part(tileGeometry(Tile.Switches, 1.2, .46), screen, 'overhead switch panel', [0, 21.86, -.85]);
  overhead.rotation.x = .75;
  const housing = block('overhead panel housing', [0, 21.91, -.905], [1.32, .14, .62], p.dark, .04);
  housing.rotation.x = .75 - Math.PI / 2;
  block('ceiling light panel', [0, 22.06, .9], [1.7, .04, .62], lamp, .02);

  // Bucket seat: white shell, dark pads, five-point harness. It stays behind the pilot's standing spot and
  // keeps its left flank bare so the walk from the port hatch to the seat stays clear.
  block('seat pedestal', [0, FLOOR + .38, .4], [.46, .76, .5], p.dark, .06);
  block('seat pan shell', [0, 19.06, .62], [1.0, .16, .78], p.pearl, .07);
  block('seat pan pad', [0, 19.17, .64], [.86, .1, .7], p.cushion, .05);
  const recline = -.1;
  for (const [name, position, size, material] of [
    ['seat back shell', [0, 20.0, .2], [1.04, 1.6, .16], p.pearl],
    ['seat back pad', [0, 20.0, .3], [.84, 1.42, .08], p.cushion],
    ['seat headrest shell', [0, 21.03, .06], [.6, .4, .14], p.pearl],
    ['seat headrest pad', [0, 21.03, .18], [.7, .46, .16], p.cushion],
  ] as const) block(name, position, size, material, .06).rotation.x = recline;
  // Seat-back face frame: the pad's front plane, tilted with the recline about the pad centre.
  const onBack = (x: number, y: number, z: number): Point => {
    const at = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(1, 0, 0), recline);
    return [at.x, at.y + 20.0, at.z + .3];
  };
  const strap = (name: string, [x0, y0]: readonly [number, number], [x1, y1]: readonly [number, number]) => {
    // A little overlap closes the corner where two runs of one strap meet.
    const length = Math.hypot(x1 - x0, y1 - y0) + .04;
    block(name, onBack((x0 + x1) / 2, (y0 + y1) / 2, .05), [.07, length, .016], webbing, .006)
      .rotation.set(recline, 0, Math.atan2(x0 - x1, y1 - y0));
  };
  for (const side of [-1, 1]) {
    block('seat side wing', [side * .54, 19.95, .34], [.1, 1.25, .34], p.pearl, .04).rotation.x = recline;
    // Five-point harness stowed for an empty seat: the shoulder straps leave slots beside the headrest and hang down the
    // pad's outer edges, the lap halves lie along the pan sides, so a seated pilot covers rather than cuts through them.
    block('harness shoulder slot', onBack(side * .25, .62, .045), [.12, .04, .012], p.dark, .01).rotation.x = recline;
    strap('harness shoulder strap', [side * .25, .62], [side * .35, .38]);
    strap('harness shoulder strap', [side * .35, .38], [side * .35, -.66]);
    block('harness strap adjuster', onBack(side * .35, -.02, .062), [.095, .05, .018], p.satin, .008).rotation.x = recline;
    block('harness strap tongue', onBack(side * .35, -.68, .06), [.08, .07, .014], p.satin, .01).rotation.x = recline;
    block('harness lap belt', [side * .39, 19.23, .58], [.075, .016, .5], webbing, .006);
    block('harness lap tongue', [side * .39, 19.235, .87], [.08, .014, .08], p.satin, .01);
  }
  // Fifth-point crotch strap over the pan's front lip, ending in the rotary release buckle.
  block('harness crotch strap', [0, 19.23, .92], [.075, .016, .14], webbing, .006);
  part(new THREE.CylinderGeometry(.065, .065, .024, 20), p.satin, 'harness rotary buckle', [0, 19.245, .9]);
  part(new THREE.CylinderGeometry(.035, .035, .03, 16), p.dark, 'harness buckle release', [0, 19.25, .9]);
  // Hand controller on the starboard armrest only, away from the boarding path.
  block('starboard armrest', [.62, 19.55, .62], [.14, .1, .7], p.pearl, .04);
  part(new THREE.CylinderGeometry(.035, .045, .2, 8), p.dark, 'translation hand controller', [.62, 19.7, .9]);
  part(new THREE.SphereGeometry(.06, 10, 8), p.dark, 'hand controller grip', [.62, 19.82, .9]);

  // Glareshield console: two touch displays angled at the pilot's eye either side, and a centre display laid
  // almost flat so it never rises in front of the pilot seen through the glazing.
  block('flight control console', [0, 19.62, 2.12], [2.5, .28, .54], p.dark, .12).rotation.x = .22;
  const facing = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), lap = new THREE.Vector3(0, 21.6, 1);
  for (const [at, target, tile] of [[new THREE.Vector3(-.82, 19.95, 2.02), EYE, Tile.Orbit],
    [new THREE.Vector3(0, 19.86, 2.0), lap, Tile.Flight], [new THREE.Vector3(.82, 19.95, 2.02), EYE, Tile.Systems]] as const) {
    const turn = new THREE.Quaternion().setFromRotationMatrix(facing.lookAt(target, at, up));
    const bezel = block('flight display bezel', [0, 0, 0], [.72, .46, .04], p.dark, .02);
    bezel.position.copy(at).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(turn), -.022);
    bezel.quaternion.copy(turn);
    part(tileGeometry(tile, .66, .4), screen, 'flight touch display', [at.x, at.y, at.z]).quaternion.copy(turn);
  }

  // Keyboard deck on a stalk from the console over the seated pilot's knees, high enough to read above the window sill.
  block('keyboard deck', [0, KEYBOARD.y - .04, KEYBOARD.z], [.86, .07, .36], p.dark, .03);
  block('keyboard deck stalk', [0, KEYBOARD.y - .1, (KEYBOARD.z + 1.9) / 2], [.16, .06, 1.9 - KEYBOARD.z], p.satin, .02);
  part(tileGeometry(Tile.Keys, .78, .3), screen, 'keyboard keycaps', [0, KEYBOARD.y, KEYBOARD.z]).rotation.set(-Math.PI / 2, 0, Math.PI);

  const replaced = interior.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh));
  mergeStaticParts(interior, new Set());
  for (const object of replaced) if (!object.parent) object.geometry.dispose();

  // Warm cabin light from the ceiling and a cool spill from the displays; both hulls light alike.
  const light = new THREE.PointLight(0xffe2bc, 14, 6, 2);
  light.position.set(0, 21.75, 1.2);
  const spill = new THREE.PointLight(0x7fd4ff, 3, 3.2, 2);
  spill.position.set(0, 20.3, 1.75);
  interior.add(light, spill);
}
