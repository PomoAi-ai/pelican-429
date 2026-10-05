/** Export the runtime bicycle for Blender pose fitting; no second bicycle model. */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createGrassyCycle, grassyCycleContract } from '../../src/render/grassy/grassy-cycle.ts';

// GLTFExporter uses FileReader for its final binary buffer even with no textures.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend(); });
  }
};
const directory = fileURLToPath(new URL('../../assets/characters/grassy/model-equipped/', import.meta.url));
await mkdir(directory, { recursive: true });
const cycle = createGrassyCycle();
cycle.update(true, 0);
cycle.root.updateMatrixWorld(true);
const glb = await new GLTFExporter().parseAsync(cycle.root, { binary: true });
await writeFile(`${directory}/grassy-bicycle-reference.glb`, Buffer.from(glb));
await writeFile(`${directory}/ride-contract.json`, JSON.stringify(grassyCycleContract(), null, 2) + '\n');
cycle.dispose();
console.log(`Exported shared bicycle and riding contract to ${directory}`);
