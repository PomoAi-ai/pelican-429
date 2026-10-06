import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// TOKTX=/path/to/toktx node scripts/build-free-world-backgrounds.ts --compare camp
// After visual approval: ... --width 1024 --quality 192
const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['camp', 'forest', 'lake', 'desert', 'islands', 'cave', 'cathedral', 'abyss'];
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  compare: { type: 'boolean', default: false }, width: { type: 'string' },
  quality: { type: 'string' }, clevel: { type: 'string', default: '2' }, output: { type: 'string' },
} });
const selected = positionals.length ? positionals : names;
const clevel = Number(values.clevel);
assert(Number.isInteger(clevel) && clevel >= 0 && clevel <= 5, '--clevel must be 0–5');
for (const name of selected) assert(names.includes(name), `Unknown background: ${name}`);
const candidates = values.compare
  ? [768, 1024, 1536].flatMap(width => [128, 192].map(quality => ({ width, quality })))
  : [{ width: Number(values.width), quality: Number(values.quality) }];
for (const { width, quality } of candidates) {
  assert(Number.isInteger(width) && width > 0 && width % 4 === 0, '--width must be a positive multiple of 4');
  assert(Number.isInteger(quality) && quality >= 1 && quality <= 255, '--quality must be 1–255');
}
const destination = resolve(values.output ?? (values.compare
  ? resolve(tmpdir(), 'pelican-background-comparison') : resolve(root, 'public/resources/free-world')));
const toktx = process.env.TOKTX ?? 'toktx';
const ktx = toktx === 'toktx' ? 'ktx' : resolve(dirname(toktx), 'ktx');
const maxBuffer = 64 * 1024 * 1024;
const commandOptions = { maxBuffer, env: { ...process.env, MAGICK_THREAD_LIMIT: '2' } };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sources = selected.map(name => {
  const path = resolve(root, `assets/environments/free-world/${name}.png`);
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path}: expected PNG`);
  return { name, path, bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
});
const temporary = mkdtempSync(resolve(tmpdir(), 'pelican-background-build-'));
const report = [];
try {
  for (const source of sources) for (const { width, quality } of candidates) {
    const height = Math.max(4, Math.round(source.height * width / source.width / 4) * 4);
    const folder = values.compare ? resolve(destination, `${width}-q${quality}`) : destination;
    mkdirSync(folder, { recursive: true });
    const resized = resolve(temporary, `${source.name}.png`);
    const encoded = resolve(temporary, `${source.name}.ktx2`);
    execFileSync('magick', [source.path, '-colorspace', 'RGB', '-filter', 'Lanczos', '-resize',
      `${width}x${height}!`, '-colorspace', 'sRGB', '-alpha', 'off', '-depth', '8', `PNG24:${resized}`], commandOptions);
    execFileSync(toktx, ['--t2', '--2d', '--genmipmap', '--threads', '4', '--encode', 'etc1s',
      '--qlevel', String(quality), '--clevel', String(clevel), '--assign_oetf', 'srgb', '--assign_primaries', 'bt709',
      encoded, resized], commandOptions);
    execFileSync(ktx, ['validate', '--gltf-basisu', '--warnings-as-errors', encoded], commandOptions);
    const bytes = readFileSync(encoded);
    assert.equal(bytes.readUInt32LE(20), width, `${source.name}: width changed`);
    assert.equal(bytes.readUInt32LE(24), height, `${source.name}: height changed`);
    const mipLevels = bytes.readUInt32LE(40);
    assert.equal(mipLevels, Math.floor(Math.log2(Math.max(width, height))) + 1, `${source.name}: incomplete mip pyramid`);
    let blocks = 0;
    for (let level = 0; level < mipLevels; level++) {
      blocks += Math.ceil(Math.max(1, width >> level) / 4) * Math.ceil(Math.max(1, height >> level) / 4);
    }
    const output = resolve(folder, `${source.name}.ktx2`);
    writeFileSync(output, bytes);
    if (values.compare) {
      writeFileSync(resolve(folder, `${source.name}-reference.png`), readFileSync(resized));
      execFileSync(ktx, ['extract', '--transcode', 'rgb8', output, resolve(folder, `${source.name}-decoded.png`)], commandOptions);
    }
    report.push({ name: source.name, source: relative(root, source.path), sourceSha256: hash(source.bytes), sourceBytes: source.bytes.length,
      sourceWidth: source.width, sourceHeight: source.height, output: relative(root, output), outputSha256: hash(bytes), outputBytes: bytes.length,
      width, height, encoding: `ETC1S q${quality} clevel${clevel} sRGB RGB`, mipLevels,
      gpuBytesEtc1Bc1: blocks * 8, gpuBytesBc7Astc4x4: blocks * 16 });
    console.log(`${source.name} ${width}×${height} q${quality}: ${bytes.length} bytes; GPU 4bpp ${blocks * 8}, 8bpp ${blocks * 16}`);
  }
  for (const source of sources) assert.equal(hash(readFileSync(source.path)), hash(source.bytes), `${source.name}: source changed`);
  const reportPath = values.compare || values.output ? resolve(destination, 'report.json')
    : resolve(root, 'assets/environments/free-world/compression-report.json');
  writeFileSync(reportPath, `${JSON.stringify({ assets: report, outputBytes: report.reduce((sum, asset) => sum + asset.outputBytes, 0) }, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
} finally {
  rmSync(temporary, { recursive: true });
}
