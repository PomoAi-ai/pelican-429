/** Export the same geometry that the drivable scene instantiates. */
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createMaglevCar, createMaglevTrack, disposeMaglevResources } from '../src/render/transit/maglev-model.ts';
import { MAGLEV } from '../src/config/maglev.ts';

// The binary exporter only needs this browser adapter; models contain no image textures.
Object.defineProperty(globalThis, 'FileReader', { value: class {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(result => { this.result = result; this.onloadend!(); });
  }
} });

const destination = new URL('../public/models/maglev/', import.meta.url);
await mkdir(destination, { recursive: true });
const car = createMaglevCar();
const track = createMaglevTrack();
const exporter = new GLTFExporter();
const measurements: Record<string, unknown> = {};

for (const [file, root, closed] of [
  ['open-car.glb', car, false], ['closed-car.glb', car, true], ['track.glb', track, false],
] as const) {
  if (root === car) root.getObjectByName('canopy')!.visible = closed;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    assert([...position.array].every(Number.isFinite), `${file}: invalid geometry in ${object.name}`);
    const box = new THREE.Box3().setFromObject(object);
    bounds.union(box);
    if (root === track && object.name !== 'three-tile platform' && object.name !== 'platform tile joint') {
      assert(box.min.z >= -1.00001 && box.max.z <= 1.00001, `Guideway exceeds the middle two tiles: ${object.name}`);
    }
  });
  const size = bounds.getSize(new THREE.Vector3());
  assert(size.z <= (root === car ? MAGLEV.carWidth : MAGLEV.platformDepth) + 1e-5, `${file}: depth overflow`);
  if (root === car) {
    assert(car.children.filter(o => o.name.startsWith('seat-')).length === 2);
    assert(Math.abs(bounds.min.y - MAGLEV.shoeBottom) < 1e-5, `${file}: lowest surface must match the rail-contact datum`);
  }
  measurements[file] = { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() };
  const binary = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
  assert(binary instanceof ArrayBuffer);
  await writeFile(new URL(file, destination), Buffer.from(binary));
  console.log(`${file}: ${binary.byteLength} bytes; bounds ${size.toArray().map(n => n.toFixed(3)).join(' × ')}`);
}
await writeFile(new URL('dimensions.json', destination), JSON.stringify({
  units: '1 unit = 1 game tile; X travel, Y up, +Z toward camera',
  configuration: MAGLEV, measurements,
  source: 'src/render/transit/maglev-model.ts',
}, null, 2) + '\n');
disposeMaglevResources(car);
disposeMaglevResources(track);
