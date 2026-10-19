import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Bone, Skeleton, SkinnedMesh, Float32BufferAttribute, Uint16BufferAttribute, BoxGeometry, CompressedTexture, Mesh, MeshStandardMaterial, NumberKeyframeTrack, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { WEB_MODEL_SOURCES } from '../src/config/web-models.ts';
import { ENEMY_RULES } from '../src/config/enemy-rules.ts';
import { configureCharacterTextures, disposeCharacterTextures, loadCharacterModel, type TextureTier } from '../src/render/character-model.ts';
import { createEnemyRig, disposeEnemyAssets, loadEnemyAsset } from '../src/render/enemy-rig.ts';
import { createFacilityPresentation, disposePreloadedFortressTextures, preloadFortressTextures } from '../src/app/facility-presentation.ts';
import type { Stage } from '../src/render/stage.ts';
import { createD1Rig, disposeD1Asset, disposeD1Assets, loadD1Asset } from '../src/render/grassy/d1-rig.ts';
import { CUSTOMIZATION_MODELS } from '../src/config/character-customization-assets.ts';
import { disposeCustomizationAssets, loadCustomizationAssets } from '../src/render/grassy/grassy-appearance.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('堡垒预加载字节供两个渲染器独立转码，失败后等待同批请求结束再释放', async (t) => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('http://localhost/') });
  t.after(() => {
    disposePreloadedFortressTextures();
    if (location) Object.defineProperty(globalThis, 'location', location);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  let downloads = 0;
  t.mock.method(globalThis, 'fetch', async () => { downloads++; return new Response(new Uint8Array([42])); });
  const decoders = new Map<KTX2Loader, WebGLRenderer>();
  const released: KTX2Loader[] = [];
  const requests: Array<{ loader: KTX2Loader; finish(texture: CompressedTexture): void; fail(error: unknown): void }> = [];
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function (this: KTX2Loader, renderer: WebGLRenderer) {
    decoders.set(this, renderer);
    return this;
  });
  t.mock.method(KTX2Loader.prototype, 'parse', function (this: KTX2Loader, bytes: ArrayBuffer, onLoad: (texture: CompressedTexture) => void, onError: (error: unknown) => void) {
    assert.deepEqual([...new Uint8Array(bytes)], [42], '第二个 renderer 不能收到已被 Worker 转移的缓存');
    structuredClone(bytes, { transfer: [bytes] });
    requests.push({ loader: this, finish: onLoad, fail: onError });
  });
  t.mock.method(KTX2Loader.prototype, 'dispose', function (this: KTX2Loader) { released.push(this); return this; });
  await preloadFortressTextures();
  assert.equal(decoders.size, 0, '预加载无需 WebGL 上下文');
  const stages = [{ renderer: {} }, { renderer: {} }] as Stage[];
  const failures = stages.map(stage => assert.rejects(createFacilityPresentation(stage, 'fortress'), /texture failure/));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(downloads, 4, '并行场景共享下载');
  assert.equal(requests.length, 8);
  assert.deepEqual([...decoders.values()], stages.map(stage => stage.renderer));
  disposePreloadedFortressTextures();
  const disposed: CompressedTexture[] = [];
  for (const loader of decoders.keys()) {
    const batch = requests.filter(request => request.loader === loader);
    batch[0]!.fail(new Error('texture failure'));
    await Promise.resolve();
    assert.equal(released.includes(loader), false, '首个失败不能中断同批仍在转码的请求');
    for (const request of batch.slice(1)) {
      const texture = new CompressedTexture([], 1, 1);
      texture.addEventListener('dispose', () => disposed.push(texture));
      request.finish(texture);
    }
  }
  await Promise.all(failures);
  assert.equal(disposed.length, 6, '失败批次的成功纹理全部释放');
  assert.deepEqual(released, [...decoders.keys()]);
});

test('角色和堡垒共用同一渲染器的转码器，角色退出不打断尚未完成的背景加载', async (t) => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('http://localhost/') });
  t.after(() => {
    disposeCharacterTextures();
    disposePreloadedFortressTextures();
    if (location) Object.defineProperty(globalThis, 'location', location);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }), '');
  const model = deferred<GLTF>();
  const created: KTX2Loader[] = [];
  const released: KTX2Loader[] = [];
  const background: Array<() => void> = [];
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([42])));
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function (this: KTX2Loader) { created.push(this); return this; });
  t.mock.method(KTX2Loader.prototype, 'init', async () => {});
  t.mock.method(KTX2Loader.prototype, 'dispose', function (this: KTX2Loader) { released.push(this); return this; });
  t.mock.method(KTX2Loader.prototype, 'parse', function (this: KTX2Loader, _bytes: ArrayBuffer, _onLoad: unknown, onError: (error: unknown) => void) {
    assert.equal(this, created[0], '背景必须复用角色正在使用的转码器');
    background.push(() => onError(new Error('background failure')));
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => model.promise);
  const renderer = {} as WebGLRenderer;
  configureCharacterTextures(renderer);
  const character = loadCharacterModel(WEB_MODEL_SOURCES[0]!);
  const facility = assert.rejects(createFacilityPresentation({ renderer } as Stage, 'fortress'), /background failure/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(created.length, 1);
  assert.equal(background.length, 4);
  disposeCharacterTextures();
  model.resolve(gltf);
  await character;
  assert.deepEqual(released, [], '角色会话结束后背景仍然持有转码器');
  for (const finish of background) finish();
  await facility;
  assert.deepEqual(released, created, '最后一位使用者结算后仅释放一次');
});

test('退出时等待旧模型加载结算再释放转码器，不影响新场景加载', async (t) => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('http://localhost/?textures=ktx2') });
  t.after(() => {
    disposeCharacterTextures();
    if (location) Object.defineProperty(globalThis, 'location', location);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }), '');
  const oldModel = deferred<GLTF>();
  const newModel = deferred<GLTF>();
  const oldDecoder = deferred<void>();
  const newDecoder = deferred<void>();
  const decoders: KTX2Loader[] = [];
  const disposed: KTX2Loader[] = [];
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function (this: KTX2Loader) {
    decoders.push(this);
    return this;
  });
  t.mock.method(KTX2Loader.prototype, 'init', function (this: KTX2Loader) {
    return this === decoders[0] ? oldDecoder.promise : newDecoder.promise;
  });
  t.mock.method(KTX2Loader.prototype, 'dispose', function (this: KTX2Loader) { disposed.push(this); });
  let downloads = 0;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => downloads++ === 0 ? oldModel.promise : newModel.promise);
  const renderer = {} as WebGLRenderer;

  configureCharacterTextures(renderer);
  const previous = loadCharacterModel(WEB_MODEL_SOURCES[0]!);
  disposeCharacterTextures();
  assert.deepEqual(disposed, [], '退出不能终止仍在加载的转码器');

  configureCharacterTextures({} as WebGLRenderer);
  const current = loadCharacterModel(WEB_MODEL_SOURCES[0]!);
  oldModel.resolve(gltf);
  await Promise.resolve();
  assert.deepEqual(disposed, [], '模型下载完成后仍需等待转码器初始化');
  oldDecoder.resolve();
  assert.equal(await previous, gltf);
  assert.deepEqual(disposed, [decoders[0]], '只释放已退休且完成加载的旧转码器');

  newDecoder.resolve();
  newModel.resolve(gltf);
  assert.equal(await current, gltf);
  assert.deepEqual(disposed, [decoders[0]], '新场景继续拥有其转码器');
  disposeCharacterTextures();
  assert.deepEqual(disposed, decoders);
});

test('同时加载同一角色的多个贴图档位，缓存与实例不会串用资源', async (t) => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('http://localhost/') });
  const rigs: ReturnType<typeof createEnemyRig>[] = [];
  t.after(() => {
    for (const rig of rigs) rig.dispose();
    disposeEnemyAssets();
    disposeCharacterTextures();
    if (location) Object.defineProperty(globalThis, 'location', location);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  const requested: string[] = [];
  const compressed: string[] = [];
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function (this: KTX2Loader) { return this; });
  t.mock.method(KTX2Loader.prototype, 'init', async () => {});
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function (this: GLTFLoader, path: string) {
    requested.push(path);
    if (this.ktx2Loader) compressed.push(path);
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }), '');
    gltf.scene.name = path;
    const height = ENEMY_RULES.lineHound.height;
    const mesh = new Mesh(new BoxGeometry(1, height, 1), new MeshStandardMaterial());
    mesh.position.y = height / 2;
    gltf.scene.add(mesh);
    gltf.animations = ['idle', 'move', 'skill1', 'skill2', 'hit'].map(name =>
      new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]),
    );
    return gltf;
  });
  configureCharacterTextures({} as WebGLRenderer);
  const variants: Array<[TextureTier, string]> = [
    ['original', './characters/enemies/line-hound/model.glb'],
    ['web-1k', './characters/enemies/line-hound/model.web-1k.glb'],
    ['web', './characters/enemies/line-hound/model.web.glb'],
    ['ktx2', './characters/enemies/line-hound/model.ktx2.glb'],
    ['ktx2-256', './characters/enemies/line-hound/model.ktx2-256.glb'],
    ['ktx2-compact', './characters/enemies/line-hound/model.ktx2-compact.glb'],
    ['ktx2-256-compact', './characters/enemies/line-hound/model.ktx2-256-compact.glb'],
  ];
  await Promise.all(variants.flatMap(([tier]) => [loadEnemyAsset('lineHound', tier), loadEnemyAsset('lineHound', tier)]));
  assert.equal(requested.length, variants.length, '相同档位并发请求共用缓存，不同档位独立加载');
  for (const [tier, path] of variants) {
    const rig = createEnemyRig('lineHound', 0, tier);
    rigs.push(rig);
    assert.equal(rig.root.children[0]!.name, path, `${tier} 实例必须使用本档位资源`);
  }
  const defaultRig = createEnemyRig('lineHound');
  rigs.push(defaultRig);
  assert.equal(defaultRig.root.children[0]!.name, './characters/enemies/line-hound/model.ktx2-compact.glb', '显式加载其他档位不能改变游戏默认档位');
  assert.deepEqual(compressed.sort(), [
    './characters/enemies/line-hound/model.ktx2-256-compact.glb',
    './characters/enemies/line-hound/model.ktx2-256.glb',
    './characters/enemies/line-hound/model.ktx2-compact.glb',
    './characters/enemies/line-hound/model.ktx2.glb',
  ]);
});

test('首页切换渲染器时新模型使用新转码器，旧请求完成后才释放旧会话', async (t) => {
  t.after(disposeCharacterTextures);
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }), '');
  const pending = [deferred<GLTF>(), deferred<GLTF>()];
  const renderers = [{} as WebGLRenderer, {} as WebGLRenderer];
  const routes = new Map<KTX2Loader, WebGLRenderer>();
  const released: KTX2Loader[] = [];
  const requested: KTX2Loader[] = [];
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function (this: KTX2Loader, renderer: WebGLRenderer) {
    routes.set(this, renderer); return this;
  });
  t.mock.method(KTX2Loader.prototype, 'init', async () => {});
  t.mock.method(KTX2Loader.prototype, 'dispose', function (this: KTX2Loader) { released.push(this); return this; });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', function (this: GLTFLoader) {
    requested.push(this.ktx2Loader!); return pending[requested.length - 1]!.promise;
  });
  configureCharacterTextures(renderers[0]!);
  const old = loadCharacterModel(WEB_MODEL_SOURCES[0]!, 'ktx2');
  configureCharacterTextures(renderers[1]!);
  const current = loadCharacterModel(WEB_MODEL_SOURCES[0]!, 'ktx2');
  assert.equal(routes.get(requested[0]!), renderers[0]);
  assert.equal(routes.get(requested[1]!), renderers[1]);
  assert.notEqual(requested[0], requested[1], '两个 WebGL 上下文必须分别检测压缩纹理能力');
  assert.deepEqual(released, [], '切换不打断旧请求');
  pending[0]!.resolve(gltf); await old;
  assert.deepEqual(released, [requested[0]]);
  pending[1]!.resolve(gltf); await current;
  assert.deepEqual(released, [requested[0]], '新会话保留供后续模型复用');
  disposeCharacterTextures();
  assert.deepEqual(released, requested);
});

test('已退出的定制资源请求延迟失败时不删除新场景的加载缓存', async (t) => {
  t.after(disposeCustomizationAssets);
  const failures: Array<(error: Error) => void> = [];
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => new Promise<GLTF>((_resolve, reject) => { failures.push(reject); }));
  const count = CUSTOMIZATION_MODELS.length;
  const old = loadCustomizationAssets('original');
  const oldFailure = assert.rejects(old, /old download/);
  disposeCustomizationAssets();
  const current = loadCustomizationAssets('original');
  const currentFailure = assert.rejects(current, /new download/);
  assert.equal(failures.length, count * 2);
  for (const fail of failures.slice(0, count)) fail(new Error('old download'));
  await oldFailure;
  const repeated = loadCustomizationAssets('original');
  assert.equal(repeated, current, '旧 catch 不能清除另一代正在加载的 promise');
  assert.equal(failures.length, count * 2, '重复读取不能再次下载整组定制模型');
  for (const fail of failures.slice(count)) fail(new Error('new download'));
  await currentFailure;
});

test('D1 短发实验沿用批准身体尺度，未声明或缩放身体的资源仍拒绝', async (t) => {
  t.after(() => { disposeD1Assets(); disposeCharacterTextures(); });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (path: string) => {
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }), '');
    if (path !== 'unmarked.glb') gltf.scene.userData.d1ScaleReference = 'approved-outfit-body';
    if (path === 'scaled.glb') gltf.scene.scale.setScalar(1.03);
    const geometry = new BoxGeometry(1.41261637, 2.96568698, .99921259).translate(0, 2.96568698 / 2, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
    const body = new SkinnedMesh(geometry, new MeshStandardMaterial({ name: 'model' }));
    body.name = 'Body';
    const bone = new Bone(); body.add(bone); body.bind(new Skeleton([bone]));
    const hair = new Mesh(new BoxGeometry(.8, .1, .8).translate(0, 2.99, 0), new MeshStandardMaterial({ name: 'model.001' }));
    hair.name = 'Hair';
    gltf.scene.add(body, hair);
    gltf.animations = ['idle', 'walk', 'run', 'jump'].map(name => new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]));
    return gltf;
  });
  await loadD1Asset('outfit', 'original', 'short-hair.glb');
  const rig = createD1Rig('outfit', 'anime', 'original', undefined, 'short-hair.glb');
  rig.dispose();
  await assert.rejects(loadD1Asset('outfit', 'original', 'unmarked.glb'), /尺寸不符/);
  await assert.rejects(loadD1Asset('outfit', 'original', 'scaled.glb'), /身体尺度不符/);
});

test('D1 三档与贴图缓存独立，复制实例不串用模型或头发开关', async (t) => {
  const rigs: ReturnType<typeof createD1Rig>[] = [];
  t.after(() => { for (const rig of rigs) rig.dispose(); disposeD1Assets(); disposeCharacterTextures(); });
  const requested: string[] = [];
  const gates = new Map<string, Promise<void>>();
  const disposed: string[] = [];
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function (this: GLTFLoader, path: string) {
    requested.push(path);
    const gate = gates.get(path);
    const gltf = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] }), '');
    gltf.scene.name = path;
    const geometry = new BoxGeometry(1, 3.1, 1).translate(0, 1.55, 0);
    geometry.addEventListener('dispose', () => disposed.push(path));
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial({ name: 'model.001' }));
    mesh.name = 'Hair'; mesh.userData.characterPart = 'hair';
    const bone = new Bone(); mesh.add(bone); mesh.bind(new Skeleton([bone]));
    gltf.scene.add(mesh);
    gltf.animations = ['idle', 'walk', 'run', 'jump'].map(name => new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]));
    await gate;
    return gltf;
  });
  await Promise.all([
    loadD1Asset('game', 'original'), loadD1Asset('game', 'original'),
    loadD1Asset('game', 'web'), loadD1Asset('detailed', 'original'), loadD1Asset('light', 'original'),
  ]);
  assert.equal(requested.length, 4, '相同档位请求合并，不同模型和贴图分别加载');
  for (const [variant, tier, suffix] of [
    ['game', 'original', 'd1-base-game.glb'], ['game', 'web', 'd1-base-game.web.glb'],
    ['detailed', 'original', 'd1-base-animated.glb'], ['light', 'original', 'd1-base-light.glb'],
  ] as const) {
    const rig = createD1Rig(variant, 'anime', tier); rigs.push(rig);
    assert.equal(rig.root.children[0]!.name, `./characters/human/customization/${suffix}`);
    rig.actions.walk.play(); rig.mixer.update(.5);
    assert.equal(rig.actions.walk.time, .5);
  }
  const copy = createD1Rig('game', 'anime', 'original'); rigs.push(copy);
  rigs[0]!.setHairVisible(false);
  assert.equal(rigs[0]!.root.getObjectByName('Hair')!.visible, false);
  assert.equal(copy.root.getObjectByName('Hair')!.visible, true, '另一个角色的头发不能跟随隐藏');

  const sourceA = requested[0]!;
  const sourceB = './characters/human/render-lab/hair-b.glb';
  await Promise.all([loadD1Asset('game', 'web', sourceA), loadD1Asset('game', 'web', sourceB)]);
  const explicitA = createD1Rig('game', 'anime', 'web', undefined, sourceA); rigs.push(explicitA);
  const explicitB = createD1Rig('game', 'anime', 'web', undefined, sourceB); rigs.push(explicitB);
  assert.equal(explicitA.root.children[0]!.name, sourceA, '显式源路径不再按 web 档位改写');
  assert.equal(explicitB.root.children[0]!.name, sourceB, '同档位的多个源模型可并存');
  explicitA.dispose(); rigs.splice(rigs.indexOf(explicitA), 1);
  disposeD1Asset('game', 'web', sourceA);
  assert.throws(() => createD1Rig('game', 'anime', 'web', undefined, sourceA), /尚未加载/);
  const retained = createD1Rig('game', 'anime', 'web', undefined, sourceB); rigs.push(retained);
  assert.equal(retained.root.children[0]!.name, sourceB, '释放一个模型不影响其他模型');

  const retiredPath = './characters/human/render-lab/retired-hair.glb';
  const oldGate = deferred<void>();
  gates.set(retiredPath, oldGate.promise);
  const old = loadD1Asset('game', 'web', retiredPath);
  disposeD1Asset('game', 'web', retiredPath);
  const currentGate = deferred<void>();
  gates.set(retiredPath, currentGate.promise);
  const current = loadD1Asset('game', 'web', retiredPath);
  oldGate.resolve(); await old;
  assert.throws(() => createD1Rig('game', 'anime', 'web', undefined, retiredPath), /尚未加载/, '旧请求成功不能恢复已释放的资源');
  assert.equal(disposed.filter(path => path === retiredPath).length, 1, '退出期间完成的模型应释放');
  assert.equal(loadD1Asset('game', 'web', retiredPath), current, '旧请求不能替换新请求的缓存');
  currentGate.resolve(); await current;
  const restored = createD1Rig('game', 'anime', 'web', undefined, retiredPath); rigs.push(restored);
  assert.equal(restored.root.children[0]!.name, retiredPath);
});
