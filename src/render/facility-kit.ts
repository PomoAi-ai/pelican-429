import * as THREE from 'three';
import { createFacilitySignals } from './facility-signals.ts';
import type { FacilitySignalKind, FacilitySignalPoint, FacilitySignalRoute } from './facility-signals.ts';
import { createFacilityLighting } from './facility-lighting.ts';
import type { FacilityLamp } from './facility-lighting.ts';

export class FacilityKit {
  readonly root = new THREE.Group();
  readonly geometries = [new THREE.BoxGeometry(1, 1, 1), new THREE.CylinderGeometry(1, 1, 1, 16),
    new THREE.PlaneGeometry(1, 1), new THREE.TorusGeometry(1, 0.085, 6, 32),
    new THREE.TorusGeometry(0.45, 0.14, 6, 12, Math.PI / 2), new THREE.SphereGeometry(1, 8, 6)];
  readonly materials: THREE.Material[] = [];
  readonly textures: THREE.Texture[] = [];
  readonly fans: THREE.Group[] = [];
  readonly concrete = this.material(0x7c8e91);
  readonly shell = this.material(0x34536b);
  readonly dark = this.material(0x12232d);
  readonly metal = this.material(0x728b91, 0.55);
  readonly yellow = this.material(0xefb853);
  readonly pipe = this.material(0x4caaaa, 0.45);
  readonly status = this.material(0x7de2d0, 0.1, 0x42c6c0);
  readonly alarm = this.material(0xee6c4f, 0.1, 0xff3b22);
  private readonly batches = new Map<THREE.Material, Map<number, THREE.Matrix4[]>>();
  private readonly panels = new Map<string, THREE.MeshStandardMaterial>();
  private readonly coolantGlass = this.material(0x93dbcf, 0.05);
  private readonly coolantLiquid = this.material(0x169f82, 0.05, 0x07543f);
  private readonly coolantGlow = this.material(0xa2ffe4, 0.05, 0x38b990);
  private readonly lightEmitter = this.material(0xfff0d0, 0.05, 0xffe0a4);
  private readonly networkJacket = this.material(0x576ac2, 0.25, 0x121e59);
  private readonly powerJacket = this.material(0x737b76, 0.3);
  private readonly signalRoutes: FacilitySignalRoute[] = [];
  private readonly lamps: FacilityLamp[] = [];
  private readonly lightScale: number;
  private readonly coolantTanks: {
    fill: THREE.Mesh; surface: THREE.Mesh; x: number; base: number; z: number; radius: number; height: number;
  }[] = [];
  private readonly coolantFlows: { from: THREE.Vector3; direction: THREE.Vector3; rotation: THREE.Quaternion; length: number; radius: number }[] = [];

  constructor(lightScale = 1) {
    this.lightScale = lightScale;
    this.root.name = 'server-facility';
    this.coolantGlass.transparent = true;
    this.coolantGlass.opacity = 0.16;
    this.coolantGlass.depthWrite = false;
    this.coolantGlass.roughness = 0.18;
    this.coolantLiquid.transparent = true;
    this.coolantLiquid.opacity = 0.72;
    this.coolantLiquid.depthWrite = false;
    this.coolantLiquid.roughness = 0.28;
    this.coolantLiquid.emissiveIntensity = 0.5;
    this.coolantGlow.emissiveIntensity = 0.6;
    this.lightEmitter.emissiveIntensity = 3.2 * lightScale;
  }

  material(color: number, metalness = 0.15, emissive = 0) {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.68, emissive });
    this.materials.push(material);
    return material;
  }

  light(x: number, y: number, z: number, color: number, intensity: number, distance: number) {
    this.lamps.push({ position: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity: intensity * this.lightScale, distance });
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) {
    this.instance(0, new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d), new THREE.Quaternion(), material);
  }

  private instance(shape: number, position: THREE.Vector3, scale: THREE.Vector3, rotation: THREE.Quaternion, material: THREE.Material) {
    let shapes = this.batches.get(material);
    if (!shapes) { shapes = new Map(); this.batches.set(material, shapes); }
    let matrices = shapes.get(shape);
    if (!matrices) { matrices = []; shapes.set(shape, matrices); }
    matrices.push(new THREE.Matrix4().compose(position, rotation, scale));
  }

  tube(from: [number, number, number], to: [number, number, number], radius: number, material = this.pipe) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    this.instance(1, a.add(b).multiplyScalar(0.5), new THREE.Vector3(radius, direction.length(), radius),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), material);
  }

  elbow(x: number, y: number, z: number) {
    this.instance(4, new THREE.Vector3(x, y, z), new THREE.Vector3(1, 1, 1), new THREE.Quaternion(), this.pipe);
  }

  ring(x: number, y: number, z: number, radius: number, material: THREE.Material) {
    this.instance(3, new THREE.Vector3(x, y, z), new THREE.Vector3(radius, radius, radius), new THREE.Quaternion(), material);
  }

  beam(from: [number, number, number], to: [number, number, number], width: number, material: THREE.Material) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    this.instance(0, a.add(b).multiplyScalar(0.5), new THREE.Vector3(width, direction.length(), width),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), material);
  }

  platform(left: number, right: number, y: number, z: number, depth: number) {
    this.box((left + right) / 2, y - 0.28, z, right - left, 0.56, depth, this.dark);
    this.box((left + right) / 2, y - 0.08, z + depth / 2, right - left, 0.16, 0.12, this.yellow);
    for (let x = left + 0.5; x < right; x += 1.2) this.box(x, y + 0.01, z, 0.07, 0.04, depth, this.metal);
  }

  ladder(x: number, y0: number, y1: number, z: number) {
    for (const dx of [-0.7, 0.7]) this.tube([x + dx, y0, z], [x + dx, y1 + 1.3, z], 0.09, this.yellow);
    for (let y = y0 + 0.35; y < y1; y += 0.55) this.tube([x - 0.7, y, z], [x + 0.7, y, z], 0.08, this.metal);
  }

  rack(x: number, floor: number, z: number, width: number, height: number, kind: 'GB300' | 'COMPUTE' | 'STORAGE' | 'InfiniBand') {
    if (kind === 'InfiniBand') {
      this.networkSwitch(x, floor, z, width, height);
      return;
    }
    const depth = width * 0.85;
    this.box(x, floor + height / 2, z - depth / 2, width, height, depth, this.dark);
    this.panel(kind === 'GB300' ? 'GB300 / NVL72' : kind, x, floor + height * 0.91, z + 0.04, width * 0.89, height * 0.12);
    for (const dx of [-0.46, 0.46]) this.box(x + width * dx, floor + height / 2, z + 0.03, width * 0.055, height, 0.14, this.metal);
    const rows = kind === 'GB300' ? 18 : 14;
    for (let row = 0; row < rows; row++) {
      const y = floor + height * (kind === 'GB300' ? row < 9 ? 0.06 + row * 0.038 : 0.6 + (row - 9) * 0.031 : 0.06 + row * 0.78 / rows);
      this.box(x, y, z + 0.035, width * 0.82, height * (kind === 'GB300' ? 0.025 : 0.05), 0.16, this.shell);
      for (const dx of [-0.28, 0, 0.28]) this.box(x + width * dx, y, z + 0.13, width * 0.18, height * 0.023, 0.035, this.dark);
      this.box(x + width * 0.35, y, z + 0.15, width * 0.035, height * 0.018, 0.035, row % 4 === 0 ? this.yellow : this.status);
      this.box(x - width * 0.35, y, z + 0.15, width * 0.025, height * 0.025, 0.04, this.metal);
    }
    if (kind === 'GB300') for (const dx of [-0.56, 0.56]) {
      this.tube([x + width * dx, floor + 0.3, z - 0.15], [x + width * dx, floor + height - 0.2, z - 0.15], 0.1, this.pipe);
      for (let row = 0; row < 4; row++) this.tube([x + width * dx, floor + 1 + row * height / 5, z - 0.15],
        [x + width * dx * 0.8, floor + 1 + row * height / 5, z + 0.05], 0.045, this.pipe);
    }
    if (kind === 'GB300') {
      this.box(x, floor + height * 0.48, z + 0.16, width * 0.81, height * 0.13, 0.12, this.dark);
      for (let tray = 0; tray < 9; tray++) this.box(x, floor + height * (0.43 + tray * 0.0125), z + 0.23,
        width * 0.65, height * 0.006, 0.035, this.status);
      // NVLink remains inside each rack; the external fabric uses network switches.
      this.signalRoutes.push({ kind: 'nvlink', points: [
        [x - width * 0.37, floor + height * 0.15, z + 0.28],
        [x - width * 0.37, floor + height * 0.48, z + 0.28],
        [x + width * 0.37, floor + height * 0.48, z + 0.28],
        [x + width * 0.37, floor + height * 0.8, z + 0.28],
      ] });
    }
  }

  private networkSwitch(x: number, floor: number, z: number, width: number, height: number) {
    const jacket = this.networkJacket;
    this.box(x, floor + height / 2, z - width * 0.34, width, height, width * 0.68, this.dark);
    for (const dx of [-0.47, 0.47]) this.box(x + width * dx, floor + height / 2, z + 0.04,
      width * 0.055, height, 0.18, this.metal);
    this.panel('IB SWITCH', x, floor + height * 0.92, z + 0.15, width * 0.85, height * 0.11);
    // Wide switch chassis with optical port banks and cable managers, not server drive bays.
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = floor + height * (0.14 + shelf * 0.19);
      this.box(x, y, z + 0.09, width * 0.84, height * 0.14, 0.3, this.metal);
      for (let row = 0; row < 2; row++) for (let port = 0; port < 8; port++) {
        const px = x + width * (-0.34 + port * 0.095);
        const py = y + height * (row === 0 ? -0.033 : 0.033);
        this.box(px, py, z + 0.26, width * 0.067, height * 0.045, 0.05, this.dark);
        this.box(px, py - height * 0.021, z + 0.3, width * 0.043, height * 0.008, 0.03, this.status);
      }
      this.box(x, y - height * 0.09, z + 0.16, width * 0.83, height * 0.025, 0.24, jacket);
      for (const dx of [-0.3, 0.3]) this.tube([x + width * dx, y, z + 0.32],
        [x + width * (dx + 0.08), y - height * 0.1, z + 0.4], width * 0.019, jacket);
    }
  }

  switchUnit(x: number, y: number, z: number, width: number, role: 'LEAF' | 'SPINE') {
    this.box(x, y, z - 0.22, width, 0.85, 0.6, this.metal);
    this.box(x, y, z + 0.1, width * 0.94, 0.68, 0.1, this.dark);
    for (let row = 0; row < 2; row++) for (let port = 0; port < 16; port++) {
      const px = x + width * (-0.42 + port * 0.056);
      const py = y - 0.1 + row * 0.22;
      this.box(px, py, z + 0.18, width * 0.039, 0.14, 0.07, this.networkJacket);
      this.box(px, py - 0.056, z + 0.23, width * 0.025, 0.03, 0.035, this.status);
    }
    this.panel(`IB / ${role}`, x, y + 0.63, z + 0.15, width, 0.32);
  }

  coolingUnit(x: number, floor: number, z: number) {
    this.box(x, floor + 2.6, z - 0.9, 3.6, 5.2, 2, this.shell);
    this.panel('CDU', x, floor + 4.7, z + 0.14, 2.8, 0.5);
    this.box(x - 0.75, floor + 2.8, z + 0.16, 1.4, 2.7, 0.18, this.metal);
    for (let plate = 0; plate < 11; plate++) this.box(x - 0.75, floor + 1.6 + plate * 0.23,
      z + 0.27, 1.22, 0.06, 0.1, this.dark);
    for (const y of [floor + 1.2, floor + 3]) {
      this.ring(x + 0.9, y, z + 0.3, 0.5, this.metal);
      this.box(x + 0.9, y, z + 0.4, 0.55, 0.55, 0.12, this.status);
    }
    this.coolantPipe([x - 1.4, floor + 0.4, z + 0.3], [x - 1.4, floor + 4.1, z + 0.3], 0.12);
    this.tube([x + 1.5, floor + 0.4, z + 0.3], [x + 1.5, floor + 4.1, z + 0.3], 0.13, this.alarm);
    this.panel('SUPPLY  /  RETURN', x, floor + 0.45, z + 0.25, 3.1, 0.35);
    this.light(x, floor + 2.5, z + 1.3, 0x58dcca, 130, 16);
  }

  powerCabinet(x: number, floor: number, z: number, feed: 'A' | 'B') {
    this.box(x, floor + 2.25, z - 0.7, 2.4, 4.5, 1.6, this.dark);
    this.box(x, floor + 2.25, z + 0.15, 2.14, 4.2, 0.2, this.metal);
    this.panel(`PDU / ${feed}`, x, floor + 3.8, z + 0.29, 1.9, 0.5);
    this.box(x, floor + 3.05, z + 0.3, 1.55, 0.65, 0.1, this.dark);
    this.box(x - 0.5, floor + 3.05, z + 0.4, 0.2, 0.3, 0.08, this.status);
    for (let breaker = 0; breaker < 4; breaker++) {
      this.box(x - 0.22, floor + 0.9 + breaker * 0.4, z + 0.28, 1.2, 0.25, 0.12, this.dark);
      this.box(x + 0.76, floor + 0.9 + breaker * 0.4, z + 0.31, 0.1, 0.19, 0.12, this.yellow);
    }
    this.panel('HIGH VOLTAGE', x, floor + 0.32, z + 0.29, 1.9, 0.3);
  }

  rackBank(x: number, floor: number, z: number, width: number, height: number, kind: 'GB300' | 'COMPUTE' | 'STORAGE' | 'InfiniBand') {
    const gap = 0.35;
    const columns = Math.max(1, Math.round((width + gap) / (2.35 + gap)));
    const rows = Math.max(1, Math.round((height + gap) / (5 + gap)));
    const rackWidth = Math.min(2.6, (width - gap * (columns - 1)) / columns);
    const rackHeight = Math.min(5.2, (height - gap * (rows - 1)) / rows);
    const bankWidth = columns * rackWidth + (columns - 1) * gap;
    for (let row = 0; row < rows; row++) {
      const y = floor + row * (rackHeight + gap);
      for (let column = 0; column < columns; column++) {
        const center = x - bankWidth / 2 + rackWidth / 2 + column * (rackWidth + gap);
        this.rack(center, y, z, rackWidth, rackHeight, kind);
      }
      this.box(x, y - 0.08, z - 0.8, bankWidth + 0.2, 0.16, 2.4, this.metal);
      if (kind === 'GB300') this.light(x, y + rackHeight * 0.48, z + 1.4, 0x52ffd3, 85, 12);
    }
  }

  coolantTank(x: number, floor: number, z: number, width: number, height: number) {
    const radius = width / 2;
    const base = floor + 0.35;
    const innerHeight = height - 0.7;
    this.tube([x, base, z], [x, floor + height - 0.35, z], radius, this.coolantGlass);
    for (const y of [floor + 0.2, floor + height - 0.2]) {
      this.tube([x, y - 0.18, z], [x, y + 0.18, z], radius * 1.07, this.metal);
    }
    for (const dx of [-0.94, 0.94]) this.box(x + radius * dx, floor + height / 2, z, 0.14, height, radius * 0.22, this.metal);
    this.box(x + radius * 0.76, floor + height / 2, z + radius * 0.68, 0.16, height * 0.72, 0.12, this.dark);
    for (let tick = 0; tick <= 5; tick++) {
      this.box(x + radius * 0.76, floor + height * (0.18 + tick * 0.12), z + radius * 0.68 + 0.08,
        0.34, 0.055, 0.04, this.metal);
    }
    this.panel('COOLANT', x, floor + height - 0.2, z + radius + 0.03, width * 0.78, 0.35);
    const fill = new THREE.Mesh(this.geometries[1], this.coolantLiquid);
    fill.renderOrder = 1;
    fill.position.set(x, base + innerHeight * 0.36, z);
    fill.scale.set(radius * 0.82, innerHeight * 0.72, radius * 0.82);
    const surface = new THREE.Mesh(this.geometries[1], this.coolantGlow);
    surface.position.set(x, base + innerHeight * 0.72, z);
    surface.scale.set(radius * 0.82, 0.045, radius * 0.82);
    this.root.add(fill, surface);
    this.coolantTanks.push({ fill, surface, x, base, z, radius: radius * 0.82, height: innerHeight });
    this.light(x, floor + height * 0.4, z + radius + 1, 0x4affc5, 190, 19);
  }

  coolantPipe(from: [number, number, number], to: [number, number, number], radius: number) {
    const start = new THREE.Vector3(...from);
    const direction = new THREE.Vector3(...to).sub(start);
    const length = direction.length();
    direction.normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.tube(from, to, radius, this.coolantGlass);
    this.tube(from, to, radius * 0.77, this.coolantLiquid);
    for (const distance of [radius * 0.22, length - radius * 0.22]) {
      this.instance(1, start.clone().addScaledVector(direction, distance), new THREE.Vector3(radius * 1.18, radius * 0.44, radius * 1.18), rotation, this.metal);
    }
    this.coolantFlows.push({ from: start, direction, rotation, length, radius });
  }

  stripLight(x: number, y: number, z: number, width: number) {
    this.box(x, y, z - 0.13, width + 0.28, 0.45, 0.34, this.dark);
    this.box(x, y, z + 0.065, width, 0.18, 0.08, this.lightEmitter);
    for (const dx of [-0.5, 0.5]) this.box(x + width * dx, y, z + 0.045, 0.16, 0.42, 0.12, this.metal);
    this.light(x, y - 0.25, z + 1.2, 0xffddb0, 260, 23);
  }

  signalCable(points: readonly FacilitySignalPoint[], kind: FacilitySignalKind) {
    const sheath = kind === 'power' ? this.powerJacket : kind === 'nvlink' ? this.pipe : this.networkJacket;
    const lanes = kind === 'nvlink' ? [-0.27, 0, 0.27] : kind === 'network' ? [-0.14, 0.14] : [0];
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!;
      const b = points[index]!;
      const normal = new THREE.Vector3(a[1] - b[1], b[0] - a[0], 0).normalize();
      this.tube([a[0], a[1], a[2] - 0.06], [b[0], b[1], b[2] - 0.06], 0.19, this.dark);
      for (const lane of lanes) this.tube([a[0] + normal.x * lane, a[1] + normal.y * lane, a[2]],
        [b[0] + normal.x * lane, b[1] + normal.y * lane, b[2]], kind === 'power' ? 0.09 : 0.06, sheath);
      const length = new THREE.Vector3(...b).distanceTo(new THREE.Vector3(...a));
      for (let distance = 4; distance < length; distance += 5) {
        const t = distance / length;
        this.box(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 0.09,
          0.45, 0.45, 0.23, this.metal);
      }
    }
    for (const point of [points[0]!, points[points.length - 1]!]) {
      this.box(point[0], point[1], point[2] - 0.1, 0.95, 0.92, 0.46, this.dark);
      this.box(point[0], point[1], point[2] + 0.15, 0.7, 0.68, 0.12, sheath);
      for (const dx of [-0.2, 0, 0.2]) this.box(point[0] + dx, point[1], point[2] + 0.24, 0.055, 0.44, 0.055,
        kind === 'power' ? this.lightEmitter : this.status);
    }
    this.signalRoutes.push({ points, kind });
  }

  panel(text: string, x: number, y: number, z: number, width: number, height: number, rack = false) {
    const key = `${text}:${width / height}:${rack}`;
    let material = this.panels.get(key);
    if (!material) {
      const canvas = document.createElement('canvas');
      canvas.width = rack ? 512 : Math.round(128 * width / height);
      canvas.height = rack ? 768 : 128;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Facility labels require a canvas 2D context');
      context.fillStyle = '#142a34';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#a8d7db';
      context.font = `bold ${rack ? 35 : 64}px sans-serif`;
      context.textAlign = 'center';
      context.fillText(text, canvas.width / 2, rack ? 60 : 87, canvas.width - 28);
      if (rack) drawRackFace(context, text);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(texture);
      material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, emissive: 0x37535b, emissiveMap: texture, emissiveIntensity: 0.3 });
      this.materials.push(material);
      this.panels.set(key, material);
    }
    this.instance(2, new THREE.Vector3(x, y, z), new THREE.Vector3(width, height, 1), new THREE.Quaternion(), material);
  }

  fan(x: number, y: number, z: number, radius: number) {
    this.tube([x, y, z - 0.22], [x, y, z], radius, this.dark);
    const rotor = new THREE.Group();
    rotor.position.set(x, y, z + 0.04);
    const blades = new THREE.InstancedMesh(this.geometries[0], this.metal, 5);
    const blade = new THREE.Object3D();
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      blade.position.set(Math.cos(angle) * radius * 0.43, Math.sin(angle) * radius * 0.43, 0);
      blade.rotation.z = angle + 0.35;
      blade.scale.set(radius * 0.86, radius * 0.3, 0.07);
      blade.updateMatrix();
      blades.setMatrixAt(i, blade.matrix);
    }
    rotor.add(blades);
    this.root.add(rotor);
    this.fans.push(rotor);
    for (const size of [0.69, 1]) this.instance(3, new THREE.Vector3(x, y, z + 0.19),
      new THREE.Vector3(radius * size, radius * size, radius * 1.1), new THREE.Quaternion(), this.metal);
    for (const angle of [0, Math.PI / 2]) {
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;
      this.tube([x - dx, y - dy, z + 0.2], [x + dx, y + dy, z + 0.2], 0.025, this.metal);
    }
    this.tube([x, y, z + 0.1], [x, y, z + 0.17], radius * 0.18, this.status);
  }

  railing(left: number, right: number, y: number, z: number) {
    this.box((left + right) / 2, y + 1.35, z, right - left, 0.1, 0.1, this.yellow);
    for (let x = left; x <= right; x += 3) this.box(x, y + 0.67, z, 0.1, 1.35, 0.1, this.metal);
  }

  finish() {
    this.flush();
    const kit = this;
    const signals = kit.signalRoutes.length ? createFacilitySignals(kit.root, kit.signalRoutes) : null;
    const lighting = createFacilityLighting(kit.root, kit.lamps, signals === null ? [] : signals.lamps);
    const bubbles = kit.coolantTanks.length ? new THREE.InstancedMesh(kit.geometries[5], kit.coolantGlow, kit.coolantTanks.length * 6) : null;
    const flows = kit.coolantFlows.length ? new THREE.InstancedMesh(kit.geometries[1], kit.coolantGlow, kit.coolantFlows.length * 3) : null;
    for (const mesh of [bubbles, flows]) if (mesh) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Animated particles remain inside their device; avoid stale instance bounds.
      mesh.frustumCulled = false;
      kit.root.add(mesh);
    }
    const motion = new THREE.Object3D();
    return {
      root: kit.root,
      update(time: number, camera: THREE.Camera) {
        if (signals) signals.update(time, camera);
        // Camera lighting keeps responding while the scene animation is paused or restarted.
        lighting.update(camera.position, performance.now() / 1000);
        for (const [index, fan] of kit.fans.entries()) fan.rotation.z = time * (1.8 + index * 0.07);
        kit.status.emissiveIntensity = 0.8 + Math.sin(time * 2) * 0.2;
        kit.alarm.emissiveIntensity = 0.5 + Math.pow(Math.max(0, Math.sin(time * 3)), 5) * 2;
        if (bubbles) {
          motion.quaternion.identity();
          for (const [index, tank] of kit.coolantTanks.entries()) {
            const level = tank.height * (0.72 + Math.sin(time * 0.35 + index) * 0.018);
            tank.fill.position.y = tank.base + level / 2;
            tank.fill.scale.y = level;
            tank.surface.position.y = tank.base + level;
            for (let bubble = 0; bubble < 6; bubble++) {
              const angle = bubble * 2.4 + index;
              const progress = (time * 0.055 + bubble / 6 + index * 0.13) % 1;
              motion.position.set(tank.x + Math.sin(angle) * tank.radius * 0.46,
                tank.base + 0.12 + progress * (level - 0.3), tank.z + Math.cos(angle) * tank.radius * 0.46);
              motion.scale.setScalar(tank.radius * (0.035 + bubble * 0.006));
              motion.updateMatrix();
              bubbles.setMatrixAt(index * 6 + bubble, motion.matrix);
            }
          }
          bubbles.instanceMatrix.needsUpdate = true;
        }
        if (flows) {
          for (const [index, flow] of kit.coolantFlows.entries()) {
            const segmentLength = Math.min(flow.length * 0.12, flow.radius * 2.4);
            motion.quaternion.copy(flow.rotation);
            motion.scale.set(flow.radius * 0.6, segmentLength, flow.radius * 0.6);
            for (let segment = 0; segment < 3; segment++) {
              const progress = (time * 0.075 + segment / 3 + index * 0.17) % 1;
              motion.position.copy(flow.from).addScaledVector(flow.direction, segmentLength / 2 + progress * (flow.length - segmentLength));
              motion.updateMatrix();
              flows.setMatrixAt(index * 3 + segment, motion.matrix);
            }
          }
          flows.instanceMatrix.needsUpdate = true;
        }
      },
      dispose() {
        lighting.dispose();
        if (signals) signals.dispose();
        kit.root.removeFromParent();
        kit.root.traverse((node) => { if (node instanceof THREE.InstancedMesh) node.dispose(); });
        for (const geometry of kit.geometries) geometry.dispose();
        for (const material of kit.materials) material.dispose();
        for (const texture of kit.textures) texture.dispose();
        kit.root.clear();
      },
    };
  }

  flush() {
    for (const [material, shapes] of this.batches) for (const [shape, matrices] of shapes) {
      const mesh = new THREE.InstancedMesh(this.geometries[shape], material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = !material.transparent;
      mesh.receiveShadow = !material.transparent;
      if (material === this.coolantGlass) mesh.renderOrder = 3;
      if (material === this.coolantLiquid) mesh.renderOrder = 1;
      this.root.add(mesh);
    }
  }
}

function drawRackFace(context: CanvasRenderingContext2D, kind: string) {
  for (let row = 0; row < 10; row++) {
    const y = 95 + row * 63;
    context.fillStyle = row % 2 ? '#223b46' : '#29434e';
    context.fillRect(25, y, 462, 53);
    context.fillStyle = '#0e2029';
    const count = kind === 'STORAGE' ? 6 : kind === 'NETWORK' ? 12 : 3;
    for (let col = 0; col < count; col++) {
      context.fillRect(40 + col * 360 / count, y + 12, 300 / count, 27);
      context.fillStyle = '#84dcd0';
      context.fillRect(43 + col * 360 / count, y + 16, 5, 5);
      context.fillStyle = '#0e2029';
    }
    context.fillStyle = row % 3 ? '#79e0cb' : '#dfb66c';
    context.fillRect(441, y + 18, 15, 8);
  }
}
