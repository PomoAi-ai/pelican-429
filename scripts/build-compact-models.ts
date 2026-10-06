import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const bits = 18;
const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
type Compression = { buffer: number; byteOffset: number; byteLength: number; byteStride: number; count: number; mode: 'ATTRIBUTES' | 'INDICES'; filter?: 'EXPONENTIAL' };
type View = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; extensions?: { EXT_meshopt_compression?: Compression } };
type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; type: string; count: number; min?: number[]; max?: number[];
  sparse?: { count: number; indices: { bufferView: number; byteOffset?: number; componentType: number }; values: { bufferView: number; byteOffset?: number } } };
type Document = {
  buffers: { byteLength: number; extensions?: { EXT_meshopt_compression: { fallback: true } } }[];
  bufferViews: View[]; accessors: Accessor[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; targets?: Record<string, number>[] }[] }[];
  animations: { samplers: { input: number; output: number }[]; channels: { sampler: number; target: { path: string } }[] }[];
  images?: { bufferView: number }[]; skins: { inverseBindMatrices: number }[];
};
type ModelReport = { source: string; output: string; sourceSha256: string; sourceBytes: number; outputBytes: number;
  sourceBufferBytes: number; storedBufferBytes: number; images: unknown[] };
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function parse(bytes: Buffer) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Expected GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'Expected GLB v2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'Expected JSON chunk');
  const end = 20 + bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(end + 4), 0x004e4942, 'Expected BIN chunk');
  assert.equal(end + 8 + bytes.readUInt32LE(end), bytes.length, 'Unexpected extra chunks');
  return { json: JSON.parse(bytes.subarray(20, end).toString()) as Document, bin: bytes.subarray(end + 8) };
}

function stored(bin: Buffer, view: View | Compression) {
  assert.equal(view.buffer, 0, 'Expected embedded physical buffer');
  const start = view.byteOffset ?? 0;
  assert.ok(start >= 0 && start + view.byteLength <= bin.length, 'Buffer view outside BIN chunk');
  return bin.subarray(start, start + view.byteLength);
}

function decode(bin: Buffer, view: View) {
  const compression = view.extensions?.EXT_meshopt_compression;
  if (!compression) return stored(bin, view);
  assert.equal(compression.count * compression.byteStride, view.byteLength, 'Invalid decoded layout');
  const output = Buffer.alloc(view.byteLength);
  MeshoptDecoder.decodeGltfBuffer(output, compression.count, compression.byteStride, stored(bin, compression), compression.mode, compression.filter);
  return output;
}

function pad(bytes: Buffer, value = 0) {
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, value)]);
}

function pack(json: Document, bin: Buffer) {
  const jsonBytes = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonBytes.length + bin.length, 8);
  header.writeUInt32LE(jsonBytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBytes, binHeader, bin]);
}

function selectedViews(json: Document) {
  const labels = new Map<number, Set<string>>();
  const tag = (index: number, label: string) => {
    if (json.accessors[index]!.componentType !== 5126) return;
    const names = labels.get(index) ?? new Set<string>(); names.add(label); labels.set(index, names);
  };
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    for (const [semantic, index] of Object.entries(primitive.attributes)) tag(index, semantic);
    for (const target of primitive.targets ?? []) for (const [semantic, index] of Object.entries(target)) tag(index, `morph:${semantic}`);
  }
  for (const animation of json.animations) for (const channel of animation.channels) {
    tag(animation.samplers[channel.sampler]!.output, `animation:${channel.target.path}`);
  }
  for (const animation of json.animations) for (const sampler of animation.samplers) {
    assert.ok(!labels.has(sampler.input), 'Animation time accessor shares quantized data');
  }
  for (const skin of json.skins) assert.ok(!labels.has(skin.inverseBindMatrices), 'Inverse bind accessor shares quantized data');
  const selected = new Map<number, { stride: number; count: number; labels: Set<string> }>();
  for (const [index, accessor] of json.accessors.entries()) {
    const names = labels.get(index), stride = components[accessor.type]! * 4;
    for (const [viewIndex, count, offset] of [
      [accessor.bufferView, accessor.count, accessor.byteOffset],
      [accessor.sparse?.values.bufferView, accessor.sparse?.count, accessor.sparse?.values.byteOffset],
    ] as const) {
      if (viewIndex === undefined || !names) continue;
      const view = json.bufferViews[viewIndex]!;
      // These exports have dedicated tightly packed views; reject a changed exporter layout.
      assert.equal(offset ?? 0, 0, `Accessor ${index}: nonzero offset`);
      assert.equal(view.byteStride ?? stride, stride, `Accessor ${index}: interleaved data`);
      assert.equal(view.byteLength, count! * stride, `Accessor ${index}: layout mismatch`);
      const old = selected.get(viewIndex);
      if (old) {
        assert.equal(old.stride, stride); assert.equal(old.count, count);
        for (const label of names) old.labels.add(label);
      } else selected.set(viewIndex, { stride, count: count!, labels: new Set(names) });
    }
  }
  // Animation clocks, inverse bind matrices and integer data must never share quantized views.
  for (const [index, accessor] of json.accessors.entries()) {
    if (!labels.has(index)) for (const view of [accessor.bufferView, accessor.sparse?.values.bufferView]) {
      assert.ok(view === undefined || !selected.has(view), `Accessor ${index}: protected data shares a selected view`);
    }
    assert.ok(accessor.sparse === undefined || !selected.has(accessor.sparse.indices.bufferView), 'Sparse indices share a selected view');
  }
  for (const image of json.images ?? []) assert.ok(!selected.has(image.bufferView), 'Image shares an accessor view');
  return selected;
}

function updateBounds(accessor: Accessor, views: Buffer[]) {
  if (!accessor.min && !accessor.max) return;
  const width = components[accessor.type]!;
  const values = new Float32Array(accessor.count * width);
  if (accessor.bufferView !== undefined) {
    const bytes = views[accessor.bufferView]!;
    values.set(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4));
  }
  if (accessor.sparse) {
    const { count, indices, values: sparseValues } = accessor.sparse;
    assert.equal(indices.byteOffset ?? 0, 0, 'Sparse index offset');
    const bytes = views[indices.bufferView]!, deltas = views[sparseValues.bufferView]!;
    const data = new Float32Array(deltas.buffer, deltas.byteOffset, deltas.length / 4);
    const size = { 5121: 1, 5123: 2, 5125: 4 }[indices.componentType];
    assert.ok(size, 'Unsupported sparse index component');
    for (let i = 0; i < count; i++) {
      const vertex = bytes.readUIntLE(i * size, size);
      assert.ok(vertex < accessor.count, 'Sparse index outside accessor');
      values.set(data.subarray(i * width, (i + 1) * width), vertex * width);
    }
  }
  const min = Array<number>(width).fill(Infinity), max = Array<number>(width).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    min[i % width] = Math.min(min[i % width]!, values[i]!);
    max[i % width] = Math.max(max[i % width]!, values[i]!);
  }
  if (accessor.min) accessor.min = min;
  if (accessor.max) accessor.max = max;
}

function build(model: ModelReport) {
  const sourcePath = resolve(root, 'public', model.source), inputPath = resolve(root, 'public', model.output);
  const source = readFileSync(sourcePath), input = readFileSync(inputPath);
  assert.equal(sha(source), model.sourceSha256, `${model.source}: original differs from texture report`);
  assert.equal(input.length, model.outputBytes, `${model.output}: size differs from texture report`);
  const { json, bin } = parse(input), output = structuredClone(json), selections = selectedViews(json);
  const decoded = json.bufferViews.map(view => decode(bin, view)), newDecoded = [...decoded];
  const quantized = new Map<number, Buffer>();
  const errors: Record<string, { maxAbsoluteError: number; values: number }> = {};
  for (const [index, { count, stride, labels }] of selections) {
    const bytes = decoded[index]!, values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    let largest = 0;
    for (const value of values) { assert.ok(Number.isFinite(value), `${model.source}: nonfinite attribute`); largest = Math.max(largest, Math.abs(value)); }
    const encoded = Buffer.from(MeshoptEncoder.encodeGltfBuffer(MeshoptEncoder.encodeFilterExp(values, count, stride, bits, 'SharedComponent'), count, stride, 'ATTRIBUTES'));
    const view = json.bufferViews[index]!, previous = view.extensions?.EXT_meshopt_compression;
    // Extra extension metadata must also fit within the savings, including on tiny raw views.
    if (encoded.length + (previous ? 32 : 224) >= (previous?.byteLength ?? view.byteLength)) continue;
    const restored = Buffer.alloc(bytes.length);
    MeshoptDecoder.decodeGltfBuffer(restored, count, stride, encoded, 'ATTRIBUTES', 'EXPONENTIAL');
    const result = new Float32Array(restored.buffer, restored.byteOffset, restored.length / 4);
    let maxAbsoluteError = 0;
    for (let i = 0; i < values.length; i++) {
      assert.ok(Number.isFinite(result[i]), 'Nonfinite quantized value');
      maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(values[i]! - result[i]!));
    }
    assert.ok(maxAbsoluteError <= Math.max(1, largest) * 2 ** (2 - bits), `${model.source}: view ${index} ${[...labels]} error ${maxAbsoluteError}, magnitude ${largest} exceeded precision budget`);
    for (const label of labels) {
      const error = errors[label] ??= { maxAbsoluteError: 0, values: 0 };
      error.maxAbsoluteError = Math.max(error.maxAbsoluteError, maxAbsoluteError); error.values += values.length;
    }
    quantized.set(index, encoded); newDecoded[index] = restored;
  }
  for (const accessor of output.accessors) if (
    (accessor.bufferView !== undefined && quantized.has(accessor.bufferView)) ||
    (accessor.sparse !== undefined && quantized.has(accessor.sparse.values.bufferView))
  ) updateBounds(accessor, newDecoded);
  let physicalOffset = 0, decodedOffset = 0, storedBufferBytes = 0;
  const imageViews = new Set((json.images ?? []).map(image => image.bufferView));
  const chunks = json.bufferViews.map((view, index) => {
    const previous = view.extensions?.EXT_meshopt_compression, compact = quantized.get(index);
    const bytes = compact ?? stored(bin, previous ?? view);
    const target = output.bufferViews[index]!;
    if (previous || compact) {
      const selection = selections.get(index);
      const compression: Compression = compact
        ? { buffer: 0, byteOffset: physicalOffset, byteLength: bytes.length, byteStride: selection!.stride, count: selection!.count, mode: 'ATTRIBUTES', filter: 'EXPONENTIAL' }
        : { ...previous!, byteOffset: physicalOffset };
      target.buffer = 1; target.byteOffset = decodedOffset;
      target.extensions = { ...target.extensions, EXT_meshopt_compression: compression };
      decodedOffset += Math.ceil(view.byteLength / 4) * 4;
    } else { target.buffer = 0; target.byteOffset = physicalOffset; }
    if (!imageViews.has(index)) storedBufferBytes += bytes.length;
    const chunk = pad(bytes); physicalOffset += chunk.length; return chunk;
  });
  output.buffers = [{ byteLength: physicalOffset }, { byteLength: decodedOffset, extensions: { EXT_meshopt_compression: { fallback: true } } }];
  const result = pack(output, Buffer.concat(chunks)), verified = parse(result);
  assert.ok(result.length < input.length, `${model.source}: compact output must be smaller`);
  for (let i = 0; i < json.bufferViews.length; i++) {
    assert.deepEqual(decode(verified.bin, verified.json.bufferViews[i]!), newDecoded[i], `${model.source}: decoded view ${i} changed`);
    if (!quantized.has(i)) assert.deepEqual(newDecoded[i], decoded[i], `${model.source}: protected view ${i} changed`);
  }
  for (const key of Object.keys(json)) if (!['buffers', 'bufferViews', 'accessors'].includes(key)) {
    assert.deepEqual(Reflect.get(verified.json, key), Reflect.get(json, key), `${model.source}: ${key} changed`);
  }
  for (let i = 0; i < json.accessors.length; i++) {
    const { min: oldMin, max: oldMax, ...oldAccessor } = json.accessors[i]!;
    const { min, max, ...accessor } = verified.json.accessors[i]!;
    assert.deepEqual(accessor, oldAccessor, `${model.source}: accessor structure changed`);
  }
  assert.equal(sha(readFileSync(sourcePath)), sha(source), 'Original changed during build');
  assert.equal(sha(readFileSync(inputPath)), sha(input), 'Texture baseline changed during build');
  const outputPath = model.output.replace(/\.glb$/, '-compact.glb'), destination = resolve(root, 'public', outputPath);
  writeFileSync(`${destination}.tmp`, result); renameSync(`${destination}.tmp`, destination);
  console.log(`${model.output}: ${input.length} → ${result.length} bytes (${(100 * (1 - result.length / input.length)).toFixed(1)}% smaller)`);
  return { ...model, output: outputPath, before: model.output, beforeBytes: input.length, beforeSha256: sha(input),
    outputBytes: result.length, storedBufferBytes, quantizedViews: quantized.size, bufferErrors: errors };
}

assert.equal(process.argv.length, 2, 'This script builds both 512 and 256 compact tiers; no arguments expected');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
for (const tier of ['ktx2', 'ktx2-256']) {
  const report = JSON.parse(readFileSync(resolve(root, `assets/characters/${tier}-models-report.json`), 'utf8'));
  const models = (report.models as ModelReport[]).map(build);
  writeFileSync(resolve(root, `assets/characters/${tier}-compact-models-report.json`), `${JSON.stringify({ ...report,
    modelCompression: { filter: 'EXPONENTIAL', bits, mode: 'SharedComponent', topology: 'unchanged', animationTimes: 'unchanged', textures: 'byte-identical' }, models }, null, 2)}\n`);
}
