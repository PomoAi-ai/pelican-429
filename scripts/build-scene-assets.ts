import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const maxBuffer = 64 * 1024 * 1024;
const imageOptions = { maxBuffer, env: { ...process.env, MAGICK_THREAD_LIMIT: '2' } };
const toktx = process.env.TOKTX ?? 'toktx';
const ktx = toktx === 'toktx' ? 'ktx' : resolve(dirname(toktx), 'ktx');
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const sources = [
  { source: 'public/ui/hud-icons.png', output: 'public/ui/hud-icons.webp', width: 768, height: 576 },
  ...['01-grassy-coding-concept-v3-mac-studio', '02-neural-breach-game-v3',
    '03-feather-transformation-v2', '03-neural-rift-game-v3'].map(name => ({
    source: `assets/chapter-one/${name}.png`, output: `assets/chapter-one/${name}.webp`, width: 1672, height: 941,
  })),
  ...['sky', 'far-city', 'middle-district', 'near-rooftops'].map(name => ({
    source: `public/environments/city-depth-v3/${name}.png`,
    output: `public/resources/home/fortress/${name}.ktx2`, width: 1536, height: 1024,
  })),
];
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const originals = sources.map(({ source }) => readFileSync(resolve(root, source)));
const directory = mkdtempSync(resolve(tmpdir(), 'pelican-scene-assets-'));

try {
  const report = sources.map(({ source, output, width, height }, index) => {
    const original = originals[index]!;
    assert.deepEqual(original.subarray(0, 8), pngSignature, `${source}: expected PNG`);
    const sourceWidth = original.readUInt32BE(16), sourceHeight = original.readUInt32BE(20);
    const compressedTexture = output.endsWith('.ktx2');
    const temporary = resolve(directory, `${index}.${compressedTexture ? 'ktx2' : 'webp'}`);
    let mipLevels = 1;
    if (compressedTexture) {
      assert.equal(sourceWidth, width, `${source}: unexpected width`);
      assert.equal(sourceHeight, height, `${source}: unexpected height`);
      execFileSync(toktx, ['--t2', '--2d', '--genmipmap', '--threads', '4', '--encode', 'etc1s',
        '--qlevel', '255', '--clevel', '2', '--assign_oetf', 'srgb', '--assign_primaries', 'bt709',
        temporary, resolve(root, source)], { maxBuffer });
      execFileSync(ktx, ['validate', '--gltf-basisu', '--warnings-as-errors', temporary], { maxBuffer });
      const encoded = readFileSync(temporary);
      assert.equal(encoded.readUInt32LE(20), width, `${output}: width changed`);
      assert.equal(encoded.readUInt32LE(24), height, `${output}: height changed`);
      mipLevels = encoded.readUInt32LE(40);
      assert.equal(mipLevels, Math.floor(Math.log2(Math.max(width, height))) + 1, `${output}: incomplete mip pyramid`);
    } else {
      const resized = sourceWidth === width && sourceHeight === height ? original
        : execFileSync('magick', ['png:-', '-colorspace', 'RGB', '-filter', 'Lanczos', '-resize',
          `${width}x${height}!`, '-colorspace', 'sRGB', '-depth', '8', 'png:-'], { ...imageOptions, input: original });
      execFileSync('cwebp', ['-quiet', '-q', '80', '-alpha_q', '100', '-sharp_yuv', '-m', '6',
        '-o', temporary, '--', '-'], { input: resized, maxBuffer });
      const decoded = execFileSync('magick', [temporary, '-depth', '8', 'rgba:-'], imageOptions);
      const reference = execFileSync('magick', ['png:-', '-depth', '8', 'rgba:-'], { ...imageOptions, input: resized });
      assert.equal(decoded.length, width * height * 4, `${output}: unexpected dimensions`);
      for (let p = 3; p < decoded.length; p += 4) assert.equal(decoded[p], reference[p], `${output}: alpha changed`);
    }
    const encoded = readFileSync(temporary);
    writeFileSync(resolve(root, output), encoded);
    const baseline = compressedTexture ? output.replace(/\.ktx2$/, '.webp') : source;
    const baselineBytes = readFileSync(resolve(root, baseline)).length;
    console.log(`${output}: ${baselineBytes} -> ${encoded.length} bytes`);
    return { source, sourceSha256: hash(original), sourceBytes: original.length, sourceWidth, sourceHeight,
      baseline, baselineBytes, output, outputSha256: hash(encoded), outputBytes: encoded.length, width, height,
      encoding: compressedTexture ? 'ETC1S q255 clevel2 sRGB' : 'WebP q80 alpha100', mipLevels };
  });
  for (const [index, { source }] of sources.entries()) {
    assert.equal(hash(readFileSync(resolve(root, source))), hash(originals[index]!), `${source}: original changed`);
  }
  writeFileSync(resolve(root, 'assets/scene-compression-report.json'), `${JSON.stringify({ assets: report,
    baselineBytes: report.reduce((sum, entry) => sum + entry.baselineBytes, 0),
    outputBytes: report.reduce((sum, entry) => sum + entry.outputBytes, 0),
  }, null, 2)}\n`);
} finally {
  rmSync(directory, { recursive: true });
}
