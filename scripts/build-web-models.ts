import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { WEB_MODEL_SOURCES, webModelPath, web1kModelPath, ktxModelPath, ktx256ModelPath } from '../src/config/web-models.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const maxBuffer = 64 * 1024 * 1024;
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const args = process.argv.slice(2);
const filters = args.filter(arg => arg.startsWith('--only='));
const modes = args.filter(arg => !arg.startsWith('--only='));
assert.ok(filters.length <= 1 && (modes.length === 0 || modes.length === 1 && ['--ktx2', '--web-1k', '--ktx2-256'].includes(modes[0]!)),
  'Expected optional --ktx2, --web-1k, or --ktx2-256 and optional --only=source-path-prefix');
const only = filters[0]?.slice('--only='.length).replace(/^\.\//, '');
assert.notEqual(only, '', '--only requires a nonempty source path prefix');
const sources = WEB_MODEL_SOURCES.filter(source => only === undefined || source.replace(/^\.\//, '').startsWith(only));
assert.ok(sources.length > 0, `No registered model matches --only=${only}`);
const ktx256 = modes[0] === '--ktx2-256';
const ktx2 = modes[0] === '--ktx2' || ktx256;
const web1k = modes[0] === '--web-1k';
const textureLimit = web1k ? 1024 : ktx256 ? 256 : 512;
const toktx = process.env.TOKTX ?? 'toktx';
const ktx = toktx === 'toktx' ? 'ktx' : resolve(dirname(toktx), 'ktx');
type Compression = { buffer: number; byteOffset: number; byteLength: number; byteStride: number; count: number; mode: 'ATTRIBUTES' | 'INDICES' };
type View = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; extensions?: { EXT_meshopt_compression?: Compression } };
type Image = { bufferView: number; mimeType: string; name?: string };
type Texture = { source?: number; extensions?: Record<string, unknown> };
type TextureInfo = { index: number };
type Material = {
  normalTexture?: TextureInfo;
  emissiveTexture?: TextureInfo;
  pbrMetallicRoughness?: { baseColorTexture?: TextureInfo };
};
type Document = {
  buffers: { byteLength: number; uri?: string; extensions?: { EXT_meshopt_compression: { fallback: true } } }[];
  bufferViews: View[];
  images?: Image[];
  textures?: Texture[];
  materials: Material[];
  accessors: {
    bufferView?: number;
    componentType: number;
    type: string;
    sparse?: {
      indices: { bufferView: number; componentType: number };
      values: { bufferView: number };
    };
  }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};

function parseGlb(bytes: Buffer) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Expected GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'Expected GLB v2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'Expected JSON chunk');
  const end = 20 + bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(end + 4), 0x004e4942, 'Expected BIN chunk');
  assert.equal(end + 8 + bytes.readUInt32LE(end), bytes.length, 'Unexpected extra chunks');
  const json = JSON.parse(bytes.subarray(20, end).toString()) as Document;
  assert.equal(json.buffers[0]!.uri, undefined, 'External buffers are not supported');
  return { json, bin: bytes.subarray(end + 8) };
}

function decodedView(bin: Buffer, view: View) {
  const compressed = view.extensions?.EXT_meshopt_compression;
  if (!compressed) return viewBytes(bin, view);
  const bytes = Buffer.alloc(view.byteLength);
  assert.equal(compressed.count * compressed.byteStride, bytes.length);
  MeshoptDecoder.decodeGltfBuffer(bytes, compressed.count, compressed.byteStride,
    viewBytes(bin, compressed), compressed.mode);
  return bytes;
}

function bufferLayouts(json: Document) {
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const layouts = new Map<number, Pick<Compression, 'byteStride' | 'mode'>>();
  for (const accessor of json.accessors) {
    const stride = components[accessor.type]! * sizes[accessor.componentType]!;
    assert.ok(Number.isInteger(stride), `Unsupported accessor layout: ${accessor.type}/${accessor.componentType}`);
    if (accessor.bufferView !== undefined) {
      layouts.set(accessor.bufferView, {
        byteStride: json.bufferViews[accessor.bufferView]!.byteStride ?? stride,
        mode: accessor.type === 'SCALAR' && [5123, 5125].includes(accessor.componentType) ? 'INDICES' : 'ATTRIBUTES',
      });
    }
    if (accessor.sparse) {
      layouts.set(accessor.sparse.indices.bufferView, { byteStride: sizes[accessor.sparse.indices.componentType]!, mode: 'INDICES' });
      layouts.set(accessor.sparse.values.bufferView, { byteStride: stride, mode: 'ATTRIBUTES' });
    }
  }
  return layouts;
}

function viewBytes(bin: Buffer, view: View) {
  assert.equal(view.buffer, 0, 'Expected embedded buffer');
  const start = view.byteOffset ?? 0;
  assert.ok(start >= 0 && start + view.byteLength <= bin.length, 'Buffer view outside BIN chunk');
  return bin.subarray(start, start + view.byteLength);
}

function padded(bytes: Buffer, value = 0) {
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, value)]);
}

function packGlb(json: Document, bin: Buffer) {
  const jsonBytes = padded(Buffer.from(JSON.stringify(json)), 0x20);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonBytes.length + bin.length, 8);
  header.writeUInt32LE(jsonBytes.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBytes, binHeader, bin]);
}

function mipBytes(width: number, height: number) {
  let total = 0;
  while (true) {
    total += width * height * 4;
    if (width === 1 && height === 1) return total;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
}

function compressKtx(png: Buffer, kind: 'color' | 'normal' | 'data', width: number, height: number) {
  const directory = mkdtempSync(resolve(tmpdir(), 'pelican-ktx-'));
  try {
    const input = resolve(directory, 'input.png'), output = resolve(directory, 'output.ktx2');
    writeFileSync(input, png);
    const color = kind === 'color';
    const options = color ? ['--encode', 'etc1s', '--qlevel', '255', '--clevel', '2']
      : ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', ...(kind === 'data' ? ['--uastc_rdo_l', '0.5'] : [])];
    // Keep XYZ normals: normal_mode's X/Y packing requires a different shader.
    execFileSync(toktx, ['--t2', '--2d', '--genmipmap', '--threads', '4', ...options,
      '--assign_oetf', color ? 'srgb' : 'linear', '--assign_primaries', color ? 'bt709' : 'none',
      ...(kind === 'normal' ? ['--normalize'] : []), output, input], { maxBuffer });
    execFileSync(ktx, ['validate', '--gltf-basisu', '--warnings-as-errors', output], { maxBuffer });
    const encoded = readFileSync(output);
    assert.equal(encoded.readUInt32LE(20), width, 'KTX width changed');
    assert.equal(encoded.readUInt32LE(24), height, 'KTX height changed');
    const mipLevels = encoded.readUInt32LE(40);
    assert.equal(mipLevels, Math.floor(Math.log2(Math.max(width, height))) + 1, 'Incomplete KTX mip pyramid');
    return { encoded, compression: color ? 'ETC1S' : 'UASTC', transferFunction: color ? 'sRGB' : 'linear',
      ...(kind === 'data' ? { rdoLambda: 0.5 } : {}), mipLevels };
  } finally {
    rmSync(directory, { recursive: true });
  }
}

/** Large bidirectional image pipes can stall native encoders on macOS. */
function imageTool(command: string, args: string[], input: Buffer): Buffer {
  const directory = mkdtempSync(resolve(tmpdir(), 'pelican-image-'));
  try {
    const source = resolve(directory, 'input'), destination = resolve(directory, 'output');
    writeFileSync(source, input);
    execFileSync(command, args.map(arg => arg.replace('@input', source).replace('@output', destination)), { maxBuffer });
    return readFileSync(destination);
  } finally { rmSync(directory, { recursive: true }); }
}

function compressImage(png: Buffer, kind: 'color' | 'normal' | 'data') {
  assert.deepEqual(png.subarray(0, 8), pngSignature, 'Expected embedded PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const scale = Math.min(1, textureLimit / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  let resized = png;
  if (scale < 1) {
    // Color is filtered in linear light; packed material channels are numerical data.
    const colorspace = kind === 'color' ? ['-colorspace', 'RGB'] : ['-set', 'colorspace', 'RGB'];
    const rgba = imageTool('magick', ['png:@input', ...colorspace, '-filter', 'Lanczos', '-resize',
      `${outputWidth}x${outputHeight}!`, ...(kind === 'color' ? ['-colorspace', 'sRGB'] : []),
      '-depth', '8', 'rgba:@output'], png);
    if (kind === 'normal') {
      // Averaging unit normals shortens them; restore unit length before encoding.
      for (let p = 0; p < rgba.length; p += 4) {
        const x = rgba[p]! / 127.5 - 1, y = rgba[p + 1]! / 127.5 - 1, z = rgba[p + 2]! / 127.5 - 1;
        const length = Math.hypot(x, y, z);
        rgba[p] = Math.round((x / length + 1) * 127.5);
        rgba[p + 1] = Math.round((y / length + 1) * 127.5);
        rgba[p + 2] = Math.round((z / length + 1) * 127.5);
      }
    }
    resized = imageTool('magick', ['-size', `${outputWidth}x${outputHeight}`, '-depth', '8',
      'rgba:@input', 'png:@output'], rgba);
  }
  if (ktx2) return { ...compressKtx(resized, kind, outputWidth, outputHeight), width, height, outputWidth, outputHeight, kind };
  const options = kind === 'color' ? ['-q', '90', '-alpha_q', '100', '-sharp_yuv'] : ['-lossless', '-exact'];
  const encoded = imageTool('cwebp', ['-quiet', ...options, '-m', '6', '-o', '@output', '--', '@input'], resized);
  // Check real output pixels, including alpha, rather than just encoder exit status.
  const decoded = imageTool('magick', ['webp:@input', '-depth', '8', 'rgba:@output'], encoded);
  const reference = imageTool('magick', ['png:@input', '-depth', '8', 'rgba:@output'], resized);
  assert.equal(decoded.length, outputWidth * outputHeight * 4);
  if (kind !== 'color') assert.deepEqual(decoded, reference, 'Data texture encoding changed pixels');
  else for (let p = 3; p < decoded.length; p += 4) assert.equal(decoded[p], reference[p], 'Alpha changed');
  return { encoded, width, height, outputWidth, outputHeight, kind };
}

function buildModel(source: string) {
  const sourceFile = resolve(root, 'public', source);
  const original = readFileSync(sourceFile);
  const { json, bin } = parseGlb(original);
  assert.equal(json.buffers.length, 1, `${source}: expected a single-buffer source export`);
  const output = structuredClone(json);
  const colorImages = new Set<number>(), normalImages = new Set<number>();
  for (const material of json.materials) {
    for (const info of [material.pbrMetallicRoughness?.baseColorTexture, material.emissiveTexture]) {
      if (info) colorImages.add(json.textures![info.index]!.source!);
    }
    if (material.normalTexture) normalImages.add(json.textures![material.normalTexture.index]!.source!);
  }
  const replacements = new Map<number, Buffer>();
  const images = (json.images ?? []).map((image, index) => {
    assert.equal(image.mimeType, 'image/png', `${source}: unexpected image type`);
    assert.ok(!colorImages.has(index) || !normalImages.has(index), 'Shared color and normal image needs separate export');
    const input = viewBytes(bin, json.bufferViews[image.bufferView]!);
    const { encoded, ...info } = compressImage(input, colorImages.has(index) ? 'color' : normalImages.has(index) ? 'normal' : 'data');
    replacements.set(image.bufferView, encoded);
    output.images![index]!.mimeType = ktx2 ? 'image/ktx2' : 'image/webp';
    return { name: image.name, ...info, sourceBytes: input.length, outputBytes: encoded.length,
      sourceRgbaMipBytes: mipBytes(info.width, info.height), outputRgbaMipBytes: mipBytes(info.outputWidth, info.outputHeight) };
  });
  for (const texture of output.textures ?? []) {
    assert.ok(Number.isInteger(texture.source), 'Expected image source');
    texture.extensions = { ...texture.extensions, [ktx2 ? 'KHR_texture_basisu' : 'EXT_texture_webp']: { source: texture.source } };
    delete texture.source;
  }
  const extensions = images.length ? [ktx2 ? 'KHR_texture_basisu' : 'EXT_texture_webp'] : [];
  const layouts = bufferLayouts(json);
  let offset = 0, decodedOffset = 0, sourceBufferBytes = 0, storedBufferBytes = 0;
  const chunks = json.bufferViews.map((view, index) => {
    let bytes = replacements.get(index) ?? viewBytes(bin, view);
    const layout = layouts.get(index);
    let compression: Compression | undefined;
    if (!replacements.has(index)) {
      sourceBufferBytes += bytes.length;
      // UINT8 sparse indices and tiny views stay raw; INDICES preserves exact triangle order.
      if (layout && bytes.length % layout.byteStride === 0 &&
        (layout.mode === 'INDICES' ? [2, 4].includes(layout.byteStride) : layout.byteStride % 4 === 0 && layout.byteStride <= 256)) {
        const encoded = Buffer.from(MeshoptEncoder.encodeGltfBuffer(bytes, bytes.length / layout.byteStride, layout.byteStride, layout.mode));
        if (encoded.length + 192 < bytes.length) {
          compression = { buffer: 0, byteOffset: offset, byteLength: encoded.length,
            count: bytes.length / layout.byteStride, ...layout };
          bytes = encoded;
        }
      }
      storedBufferBytes += bytes.length;
    }
    if (compression) {
      output.bufferViews[index] = { ...view, buffer: 1, byteOffset: decodedOffset,
        extensions: { ...view.extensions, EXT_meshopt_compression: compression } };
      decodedOffset += Math.ceil(view.byteLength / 4) * 4;
    } else output.bufferViews[index] = { ...view, byteOffset: offset, byteLength: bytes.length };
    const chunk = padded(bytes);
    offset += chunk.length;
    return chunk;
  });
  output.buffers[0]!.byteLength = offset;
  if (decodedOffset > 0) {
    output.buffers.push({ byteLength: decodedOffset, extensions: { EXT_meshopt_compression: { fallback: true } } });
    extensions.push('EXT_meshopt_compression');
  }
  output.extensionsUsed = [...new Set([...json.extensionsUsed ?? [], ...extensions])];
  output.extensionsRequired = [...new Set([...json.extensionsRequired ?? [], ...extensions])];
  const result = packGlb(output, Buffer.concat(chunks));
  const verified = parseGlb(result);
  for (const [index, view] of json.bufferViews.entries()) {
    if (!replacements.has(index)) assert.deepEqual(decodedView(verified.bin, verified.json.bufferViews[index]!), viewBytes(bin, view),
      `${source}: non-image buffer changed`);
  }
  for (const key of Object.keys(json)) {
    if (!['images', 'textures', 'bufferViews', 'buffers', 'extensionsUsed', 'extensionsRequired'].includes(key)) {
      assert.deepEqual(Reflect.get(verified.json, key), Reflect.get(json, key), `${source}: ${key} changed`);
    }
  }
  assert.deepEqual(readFileSync(sourceFile), original, `${source} changed during compression; rerun after export finishes`);
  const outputPath = ktx256 ? ktx256ModelPath(source) : ktx2 ? ktxModelPath(source) : web1k ? web1kModelPath(source) : webModelPath(source);
  const destination = resolve(root, 'public', outputPath);
  writeFileSync(`${destination}.tmp`, result);
  renameSync(`${destination}.tmp`, destination);
  const report = { source, output: outputPath, sourceSha256: createHash('sha256').update(original).digest('hex'),
    sourceBytes: original.length, outputBytes: result.length, sourceBufferBytes, storedBufferBytes, images };
  console.log(`${source}: ${original.length} → ${result.length} bytes (${(100 * (1 - result.length / original.length)).toFixed(1)}% smaller)`);
  return report;
}

// Tool versions are recorded with the artifacts so regeneration is reproducible.
const imageMagick = execFileSync('magick', ['-version'], { encoding: 'utf8' }).split('\n')[0];
const encoder = ktx2 ? { ktxSoftware: execFileSync(ktx, ['--version'], { encoding: 'utf8' }).trim() }
  : { webp: execFileSync('cwebp', ['-version'], { encoding: 'utf8' }).trim() };
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const built = sources.map(buildModel);
const reportName = ktx256 ? 'ktx2-256' : ktx2 ? 'ktx2' : web1k ? 'web-1k' : 'web';
const reportPath = resolve(root, `assets/characters/${reportName}-models-report.json`);
// 局部生成保留其他模型的记录，后续 compact 仍可按完整清单构建。
const previous = only !== undefined && existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')).models as ReturnType<typeof buildModel>[] : [];
const replacements = new Map(built.map(model => [model.source, model]));
const models = [...previous.filter(model => !replacements.has(model.source)), ...built];
writeFileSync(reportPath, `${JSON.stringify({ imageMagick, ...encoder, textureLimit, meshopt: '0.22.0', models }, null, 2)}\n`);
