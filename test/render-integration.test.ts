// 渲染/输入集成层中可脱离浏览器验证的部分：DOM 键鼠绑定（伪造 EventTarget）、相机、瓦片视图、视图注册表、实体视图。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING } from '../src/config/tuning.ts';
import { DEFAULT_BINDINGS, buildBindingLookup } from '../src/config/keybindings.ts';
import { createActionTracker } from '../src/input/action-map.ts';
import { bindKeyboardMouse } from '../src/input/keyboard-mouse.ts';
import type { PointerSurface, VisibilitySource } from '../src/input/keyboard-mouse.ts';
import { createCameraRig, focusHeight } from '../src/render/camera-rig.ts';
import { createTileView, SLAB_HEIGHT, TILE_APPEARANCE } from '../src/render/tile-view.ts';
import { TILE_TEXTURE_LAYERS } from '../src/render/tile-textures.ts';
import { createBackdrop, shadowHalfExtent } from '../src/render/stage.ts';
import { createOrbViews } from '../src/render/orb-view.ts';
import { createOrbFx, ORB_FX_POOL_SIZE } from '../src/render/orb-fx.ts';
import { createHud } from '../src/ui/hud.ts';
import type { SimEvent } from '../src/core/game-events.ts';
import { createBody } from '../src/physics/body.ts';
import { createViewRegistry } from '../src/render/view-registry.ts';
import type { EntityView } from '../src/render/view-registry.ts';
import { attackPhaseProgress, createDummyViewFactory } from '../src/render/entity-views.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { BUILTIN_TILES, DEFAULT_TILES, TILE_DIRT, TILE_PLATFORM, TILE_STONE, createTileRegistry } from '../src/world/tile-types.ts';
import { startAttack } from '../src/combat/attacks.ts';
import { createDummyEntity, createPelicanEntity } from '../src/entities/entity.ts';
import type { Entity } from '../src/entities/entity.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';

// ---------- keyboard-mouse ----------

function keyEvent(type: string, code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}): Event {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  return e;
}

function mouseEvent(type: string, button: number, clientX = 50, clientY = 50): Event {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { button, clientX, clientY });
  return e;
}

function setupInput() {
  const target = new EventTarget();
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
    focused: 0,
    focus() {
      this.focused++;
    },
  }) as PointerSurface & { focused: number };
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as VisibilitySource & { visibilityState: string };
  const tracker = createActionTracker();
  const binding = bindKeyboardMouse({ target, canvas, doc, tracker, lookup: buildBindingLookup(DEFAULT_BINDINGS) });
  return { target, canvas, doc, tracker, binding };
}

describe('keyboard-mouse', () => {
  test('左右键分别主攻与副攻，数字技能直接释放且按住不会重复释放', () => {
    const { target, canvas, tracker, binding } = setupInput();
    canvas.dispatchEvent(mouseEvent('mousedown', 0));
    const primary = tracker.consume(null);
    assert.equal(primary.shootHeld, true);
    assert.equal(primary.skillPressed, 0);
    target.dispatchEvent(mouseEvent('mouseup', 0));
    canvas.dispatchEvent(mouseEvent('mousedown', 2));
    const secondary = tracker.consume(null);
    assert.equal(secondary.skillPressed, 1);
    assert.equal(secondary.shootHeld, false);
    assert.equal(tracker.consume(null).skillPressed, 0);
    target.dispatchEvent(mouseEvent('mouseup', 2));
    for (const [code, slot] of [['Digit1', 2], ['Digit2', 3], ['Digit3', 4], ['KeyE', 4]] as const) {
      target.dispatchEvent(keyEvent('keydown', code));
      assert.equal(tracker.consume(null).skillPressed, slot);
      target.dispatchEvent(keyEvent('keydown', code));
      assert.equal(tracker.consume(null).skillPressed, 0);
      target.dispatchEvent(keyEvent('keyup', code));
    }
    binding.dispose();
  });

  test('方向键默认奔跑，双 Shift 慢走直到全部释放，失焦清除移动', () => {
    const { target, tracker, binding } = setupInput();
    target.dispatchEvent(keyEvent('keydown', 'KeyD'));
    let frame = tracker.consume(null);
    assert.equal(frame.moveX, 1);
    assert.equal(frame.runHeld, true);
    target.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    target.dispatchEvent(keyEvent('keydown', 'ShiftRight'));
    assert.equal(tracker.consume(null).runHeld, false);
    target.dispatchEvent(keyEvent('keyup', 'ShiftLeft'));
    assert.equal(tracker.consume(null).runHeld, false);
    target.dispatchEvent(keyEvent('keyup', 'ShiftRight'));
    assert.equal(tracker.consume(null).runHeld, true);
    target.dispatchEvent(new Event('blur'));
    frame = tracker.consume(null);
    assert.equal(frame.moveX, 0);
    binding.dispose();
  });

  test('按键映射为动作，阻止默认滚动；key repeat 不重复锁存', () => {
    const { target, tracker } = setupInput();
    const down = keyEvent('keydown', 'Space');
    target.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(tracker.isHeld('jump'), true);
    assert.equal(tracker.consume(null).jumpPressed, true);
    target.dispatchEvent(keyEvent('keydown', 'Space'));
    assert.equal(tracker.consume(null).jumpPressed, false, 'repeat keydown must not latch again');
    target.dispatchEvent(keyEvent('keyup', 'Space'));
    assert.equal(tracker.isHeld('jump'), false);
  });

  test('未绑定按键与带修饰键的组合不拦截', () => {
    const { target, tracker } = setupInput();
    const unbound = keyEvent('keydown', 'KeyZ');
    target.dispatchEvent(unbound);
    assert.equal(unbound.defaultPrevented, false);
    const ctrlD = keyEvent('keydown', 'KeyD', { ctrlKey: true });
    target.dispatchEvent(ctrlD);
    assert.equal(ctrlD.defaultPrevented, false);
    assert.equal(tracker.isHeld('moveRight'), false);
  });

  test('画布上鼠标左键吐水，窗口上松开释放；右键菜单被阻止', () => {
    const { target, canvas, tracker } = setupInput();
    canvas.dispatchEvent(mouseEvent('mousedown', 0));
    assert.equal(canvas.focused, 1);
    const frame = tracker.consume({ x: 3, y: 4 });
    assert.equal(frame.shootPressed, true);
    assert.equal(frame.shootHeld, true);
    assert.deepEqual(frame.aim, { x: 3, y: 4 });
    target.dispatchEvent(mouseEvent('mouseup', 0));
    assert.equal(tracker.isHeld('shoot'), false);
    const menu = new Event('contextmenu', { cancelable: true });
    canvas.dispatchEvent(menu);
    assert.equal(menu.defaultPrevented, true);
  });

  test('指针位置与是否在画布内', () => {
    const { target, canvas, binding } = setupInput();
    target.dispatchEvent(mouseEvent('mousemove', 0, 20, 30));
    assert.deepEqual({ ...binding.pointer }, { clientX: 20, clientY: 30, inside: true });
    target.dispatchEvent(mouseEvent('mousemove', 0, 150, 30));
    assert.equal(binding.pointer.inside, false);
    target.dispatchEvent(mouseEvent('mousemove', 0, 20, 30));
    canvas.dispatchEvent(new Event('mouseleave'));
    assert.equal(binding.pointer.inside, false);
  });

  test('失焦与页面隐藏时释放全部按键；dispose 后不再响应', () => {
    const { target, doc, tracker, binding } = setupInput();
    target.dispatchEvent(keyEvent('keydown', 'KeyD'));
    target.dispatchEvent(new Event('blur'));
    assert.equal(tracker.isHeld('moveRight'), false);
    target.dispatchEvent(keyEvent('keydown', 'KeyA'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(tracker.isHeld('moveLeft'), false);
    binding.dispose();
    target.dispatchEvent(keyEvent('keydown', 'KeyA'));
    assert.equal(tracker.isHeld('moveLeft'), false);
  });
});

// ---------- camera-rig ----------

function setupCamera(width = 64, height = 24) {
  const camera = new THREE.PerspectiveCamera(TUNING.camera.fov, 16 / 9, 0.5, 200);
  const light = new THREE.DirectionalLight();
  const rig = createCameraRig({
    camera,
    tuning: TUNING,
    bounds: { width, height },
    viewport: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
    light,
    lightOffset: { x: 3, y: 7.5, z: 10 },
  });
  return { camera, light, rig };
}

describe('camera-rig', () => {
  test('竖直取景：framingOffsetY 抬高注视点，鹈鹕身体中心（脚底 +1）位于画面自上而下 62–66% 处', () => {
    const { camera, rig } = setupCamera(64, 40);
    rig.snapTo(30, 15, 1);
    assert.equal(camera.position.y, 15 + 2 + TUNING.camera.framingOffsetY);
    const body = new THREE.Vector3(30, 16, 0).project(camera);
    const fromTop = (1 - body.y) / 2;
    assert.ok(fromTop >= 0.62 && fromTop <= 0.66, `body at ${fromTop.toFixed(3)} of screen height from top`);
    const t = structuredClone(TUNING) as any;
    t.camera.framingOffsetY = Number.NaN;
    assert.throws(() => createCameraRig({ camera, tuning: t, bounds: { width: 64, height: 40 }, viewport: () => ({ left: 0, top: 0, width: 1600, height: 900 }) }), /camera-rig/);
  });

  test('snapTo 对准目标（含前瞻/抬高），屏幕中心反投影回注视点', () => {
    const { camera, light, rig } = setupCamera();
    rig.snapTo(30, 10, 1);
    assert.equal(camera.position.x, 30 + TUNING.camera.lookAhead);
    assert.equal(camera.position.y, 10 + focusHeight(TUNING));
    assert.equal(camera.position.z, TUNING.camera.distance);
    const p = rig.screenToWorld(800, 450, { x: 0, y: 0 });
    assert.ok(p);
    assert.ok(Math.abs(p.x - camera.position.x) < 1e-6 && Math.abs(p.y - camera.position.y) < 1e-6);
    assert.equal(light.position.x - light.target.position.x, 3);
    assert.equal(light.position.y - light.target.position.y, 7.5);
  });

  test('屏幕右上方映射到世界右上方', () => {
    const { rig } = setupCamera();
    rig.snapTo(30, 10, 1);
    const center = rig.screenToWorld(800, 450, { x: 0, y: 0 });
    const corner = rig.screenToWorld(1600, 0, { x: 0, y: 0 });
    assert.ok(center && corner);
    assert.ok(corner.x > center.x && corner.y > center.y);
  });

  test('夹紧在地图范围内：贴左下角时视野不越界', () => {
    const { camera, rig } = setupCamera();
    rig.snapTo(0, 0, -1);
    const hh = TUNING.camera.distance * Math.tan(THREE.MathUtils.degToRad(TUNING.camera.fov) / 2);
    assert.ok(Math.abs(camera.position.y - hh) < 1e-9);
    assert.ok(Math.abs(camera.position.x - hh * camera.aspect) < 1e-9);
  });

  test('死区内的小位移不推动相机，大位移平滑跟随', () => {
    const { camera, rig } = setupCamera();
    rig.snapTo(30, 10, 1);
    const x0 = camera.position.x;
    rig.update(30.5, 10, 1, 1 / 60);
    assert.ok(Math.abs(camera.position.x - x0) < 1e-9);
    rig.update(36, 10, 1, 1 / 60);
    assert.ok(camera.position.x > x0 && camera.position.x < 36 + TUNING.camera.lookAhead);
  });

  test('非法输入即抛', () => {
    const { rig } = setupCamera();
    assert.throws(() => rig.update(Number.NaN, 0, 1, 0.016), /camera-rig/);
  });
});

// ---------- tile-view ----------

/** 按瓦片 key 统计方块/斜坡/薄板实例（每区块共用一个方块网格，实例 key 见 userData.tileKeys；花草与填角不计）。 */
function instanceCounts(root: THREE.Object3D): Map<string, number> {
  const counts = new Map<string, number>();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || m.name.startsWith('tiles-flora-') || m.name.startsWith('tiles-cover-') || m.name.startsWith('tiles-shrub-') || m.name.startsWith('tiles-fillet')) return;
    for (const key of m.userData.tileKeys as string[]) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

describe('tile-view', () => {
  test('按类型实例化全部可见瓦片，空气不渲染，平台为贴顶薄板', () => {
    const map = createTileMap(40, 40, DEFAULT_TILES);
    for (let x = 0; x < 40; x++) map.set(x, 0, TILE_STONE);
    map.set(5, 1, TILE_DIRT);
    map.set(35, 34, TILE_DIRT);
    map.set(10, 5, TILE_PLATFORM);
    const view = createTileView(map);
    assert.equal(view.update(), 4, 'all four chunks are built on the first update');
    assert.deepEqual(Object.fromEntries(instanceCounts(view.root)), { stone: 40, dirt: 2, platform: 1 });
    let slabY: number | null = null;
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh && m.name.startsWith('tiles-slab')) {
        const mat = new THREE.Matrix4();
        m.getMatrixAt(0, mat);
        slabY = new THREE.Vector3().setFromMatrixPosition(mat).y;
        assert.equal(m.castShadow, true);
      }
    });
    assert.equal(slabY, 6 - SLAB_HEIGHT / 2);
    view.dispose();
  });

  test('只重建脏区块（及其 8 邻区块）', () => {
    const map = createTileMap(64, 64, DEFAULT_TILES);
    const view = createTileView(map);
    view.update();
    assert.equal(view.update(), 0);
    map.set(40, 40, TILE_DIRT);
    assert.equal(view.update(), 4, 'chunk (1,1) and its in-bounds neighbours (whole 2×2 map)');
    assert.equal(instanceCounts(view.root).get('dirt'), 1);
    map.set(40, 40, 0);
    view.update();
    assert.equal(instanceCounts(view.root).get('dirt'), undefined);
    view.dispose();
  });

  test('注册表中存在无外观定义的瓦片即抛', () => {
    const registry = createTileRegistry([...BUILTIN_TILES, { id: 9, key: 'lava', collision: 'none' }]);
    assert.equal(Object.hasOwn(TILE_APPEARANCE, 'lava'), false);
    assert.throws(() => createTileView(createTileMap(4, 4, registry)), /no appearance defined for tile 'lava'/);
  });
});

// ---------- view-registry / entity views ----------

describe('view-registry', () => {
  test('按 kind 创建、同步、在实体消失时销毁；缺工厂即抛', () => {
    const scene = new THREE.Scene();
    const log: string[] = [];
    const factory = (e: Entity): EntityView => ({
      object: new THREE.Object3D(),
      sync: (_e, alpha) => log.push(`sync ${e.id} ${alpha}`),
      dispose: () => log.push(`dispose ${e.id}`),
    });
    const registry = createViewRegistry(scene, { trainingDummy: factory });
    const a = createDummyEntity(1, { x: 1, y: 1 }, TUNING);
    const b = createDummyEntity(2, { x: 3, y: 1 }, TUNING);
    registry.sync([a, b], 0.5, 0.016);
    assert.equal(scene.children.length, 2);
    registry.sync([a], 0.25, 0.016);
    assert.equal(scene.children.length, 1);
    assert.deepEqual(log, ['sync 1 0.5', 'sync 2 0.5', 'sync 1 0.25', 'dispose 2']);
    assert.throws(() => registry.sync([createPelicanEntity(3, { x: 0, y: 0 }, TUNING)], 0, 0), /no view factory for entity kind 'pelican'/);
    registry.dispose();
    assert.equal(scene.children.length, 0);
  });

  test('攻击阶段内进度', () => {
    const a = startAttack(TUNING.attacks.peck);
    assert.deepEqual(attackPhaseProgress(a), { phase: 'startup', progress: 0 });
    a.elapsed = TUNING.attacks.peck.startup + TUNING.attacks.peck.active / 2;
    assert.deepEqual(attackPhaseProgress(a), { phase: 'active', progress: 0.5 });
    a.elapsed = TUNING.attacks.peck.startup + TUNING.attacks.peck.active + TUNING.attacks.peck.recovery;
    assert.deepEqual(attackPhaseProgress(a), { phase: 'recovery', progress: 1 });
  });

  test('假人视图：插值位置、受击闪白、归零半透明', () => {
    const dummy = createDummyEntity(7, { x: 10, y: 3 }, TUNING);
    const view = createDummyViewFactory({ tuning: TUNING })(dummy);
    dummy.body.prevX = 10;
    dummy.body.x = 12;
    view.sync(dummy, 0.5, 1 / 60);
    assert.equal(view.object.position.x, 11);
    const materials = new Set<THREE.MeshStandardMaterial>();
    view.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material instanceof THREE.MeshStandardMaterial) materials.add(m.material);
    });
    const health = dummy.health;
    assert.ok(health);
    health.flashTicks = TUNING.combat.hitFlashTicks;
    health.hp = 0;
    view.sync(dummy, 1, 1 / 60);
    assert.ok([...materials].some((m) => m.emissiveIntensity > 0.5));
    assert.ok([...materials].every((m) => m.transparent && m.opacity < 1));
    view.dispose();
  });
});

// ---------- 011 W4：可视范围 / 流式瓦片 / 远景 / 光球 / HUD ----------

describe('camera-rig visibleRect', () => {
  test('按夹紧后的相机位置与半视野计算，margin 向四周扩展', () => {
    const { camera, rig } = setupCamera(200, 100);
    rig.snapTo(80, 40, 1);
    const hh = TUNING.camera.distance * Math.tan(THREE.MathUtils.degToRad(TUNING.camera.fov) / 2);
    const hw = hh * camera.aspect;
    const r = rig.visibleRect();
    assert.ok(Math.abs(r.x - (camera.position.x - hw)) < 1e-9 && Math.abs(r.y - (camera.position.y - hh)) < 1e-9);
    assert.ok(Math.abs(r.w - 2 * hw) < 1e-9 && Math.abs(r.h - 2 * hh) < 1e-9);
    const m = rig.visibleRect(3);
    assert.ok(Math.abs(m.x - (r.x - 3)) < 1e-9 && Math.abs(m.w - (r.w + 6)) < 1e-9 && Math.abs(m.h - (r.h + 6)) < 1e-9);
  });

  test('贴边时使用夹紧后的位置（不越出地图左下）', () => {
    const { rig } = setupCamera(200, 100);
    rig.snapTo(0, 0, -1);
    const r = rig.visibleRect();
    assert.ok(Math.abs(r.x) < 1e-9 && Math.abs(r.y) < 1e-9);
    assert.throws(() => rig.visibleRect(-1), /camera-rig/);
  });
});

/** 本地构造含地表方块的注册表（id 4–6：grass/sand/branch）。 */
function worldRegistry() {
  return createTileRegistry([
    ...BUILTIN_TILES.filter((d) => d.id <= 3),
    { id: 4, key: 'grass', collision: 'solid' },
    { id: 5, key: 'sand', collision: 'solid' },
    { id: 6, key: 'branch', collision: 'oneWay' },
  ]);
}

function instancePositions(root: THREE.Object3D, prefix: string): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const mat = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith(prefix)) return;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      out.push(new THREE.Vector3().setFromMatrixPosition(mat));
    }
  });
  return out;
}

/** (x,y) 处方块实例的 aLayers（侧, 顶, 底）。 */
function layersAt(root: THREE.Object3D, x: number, y: number): number[] {
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  let found: number[] | null = null;
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith('tiles-block')) return;
    const layers = m.geometry.getAttribute('aLayers');
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      pos.setFromMatrixPosition(mat);
      if (Math.abs(pos.x - (x + 0.5)) < 1e-9 && Math.abs(pos.y - (y + 0.5)) < 1e-9) found = [layers.getX(i), layers.getY(i), layers.getZ(i)];
    }
  });
  assert.ok(found, `block instance at (${x},${y})`);
  return found;
}

describe('tile-view 外观 / 草皮', () => {
  test('新方块均有外观，key 不含连字符；branch 不渲染；wood/leaves/copper 已删除', () => {
    for (const key of ['grass', 'sand']) {
      const a = TILE_APPEARANCE[key];
      assert.ok(a, `appearance for ${key}`);
      assert.ok(!key.includes('-'));
    }
    assert.ok(Object.hasOwn(TILE_APPEARANCE, 'branch'));
    assert.equal(TILE_APPEARANCE.branch, null);
    for (const key of ['wood', 'leaves', 'copper']) assert.equal(Object.hasOwn(TILE_APPEARANCE, key), false, key);
    assert.equal(TILE_APPEARANCE.grass?.tufts, true);
  });

  test('branch 瓦片不生成实例，地形层 z=0', () => {
    const map = createTileMap(8, 8, worldRegistry());
    map.set(1, 0, 4);
    map.set(1, 1, 6);
    const view = createTileView(map);
    view.update();
    assert.deepEqual(instancePositions(view.root, 'tiles-branch'), []);
    assert.deepEqual(instancePositions(view.root, 'tiles-block').map((p) => p.z), [0]);
    view.dispose();
  });

  test('草皮判定：上方为空气或不渲染的 branch 算暴露，上方为地形不算（被覆盖显示泥土）', () => {
    const map = createTileMap(8, 8, worldRegistry());
    map.set(1, 0, 4); // 上方空气
    map.set(3, 0, 4);
    map.set(3, 1, 6); // 上方 branch（不渲染）
    map.set(5, 0, 4);
    map.set(5, 1, TILE_STONE); // 上方石头
    const view = createTileView(map);
    view.update();
    const layer = (n: (typeof TILE_TEXTURE_LAYERS)[number]) => TILE_TEXTURE_LAYERS.indexOf(n);
    // 草皮正面底材为泥土（草边由过渡规则 air|grass 的装饰带绘制），顶面草顶。
    const grassy = [layer('dirt'), layer('grassTop'), layer('dirt')];
    assert.deepEqual(layersAt(view.root, 1, 0), grassy, 'exposed under air → grass top');
    assert.deepEqual(layersAt(view.root, 3, 0), grassy, 'exposed under non-rendered branch tile → grass top');
    assert.deepEqual(layersAt(view.root, 5, 0), [layer('dirt'), layer('dirt'), layer('dirt')], 'covered by terrain → plain dirt');
    view.dispose();
  });

  test('缺外观仍抛（新 key 未定义时）', () => {
    const registry = createTileRegistry([...BUILTIN_TILES.filter((d) => d.id <= 3), { id: 12, key: 'obsidian', collision: 'solid' }]);
    assert.throws(() => createTileView(createTileMap(4, 4, registry)), /no appearance defined for tile 'obsidian'/);
  });
});

describe('tile-view 流式加载', () => {
  // 256×256 → 8×8 区块；视野 (100,100,40,40) 覆盖区块 cx/cy ∈ [3,4]。
  const VIEW = Object.freeze({ x: 100, y: 100, w: 40, h: 40 });

  test('可视区块立即构建，余量区块按每帧上限补齐', () => {
    const map = createTileMap(256, 256, DEFAULT_TILES);
    const view = createTileView(map, { marginChunks: 1, keepChunks: 2, maxBuildsPerFrame: 4 });
    assert.equal(view.update(VIEW), 4 + 4, '4 visible + 4 margin');
    assert.equal(view.loadedChunks, 8);
    assert.equal(view.pendingChunks, 8);
    for (let cy = 3; cy <= 4; cy++) for (let cx = 3; cx <= 4; cx++) assert.ok(view.isChunkLoaded(cx, cy));
    assert.equal(view.update(VIEW), 4);
    assert.equal(view.update(VIEW), 4);
    assert.equal(view.loadedChunks, 16);
    assert.equal(view.pendingChunks, 0);
    assert.equal(view.update(VIEW), 0);
    view.dispose();
  });

  test('余量区块按到视野中心的距离优先', () => {
    const map = createTileMap(256, 256, DEFAULT_TILES);
    const view = createTileView(map, { maxBuildsPerFrame: 1 });
    // 视野 x∈[126,146]、y∈[112,144]：中心 (4.25,4.0) 区块单位 → 最近的余量区块是右侧 (5,3)/(5,4)。
    view.update({ x: 126, y: 112, w: 20, h: 32 });
    assert.equal(view.loadedChunks, 5);
    let right = 0;
    for (let cy = 2; cy <= 5; cy++) if (view.isChunkLoaded(5, cy)) right++;
    assert.equal(right, 1);
    view.dispose();
  });

  test('超出保留范围才卸载（滞回），视野移动时新区块立即构建', () => {
    const map = createTileMap(256, 256, DEFAULT_TILES);
    const view = createTileView(map, { marginChunks: 1, keepChunks: 2, maxBuildsPerFrame: 64 });
    view.update(VIEW);
    assert.equal(view.loadedChunks, 16); // cx,cy ∈ [2,5]
    // 右移一个区块：视野 cx ∈ [4,5]，余量 [3,6]，保留 [2,7] → 不卸载任何区块。
    view.update({ x: 132, y: 100, w: 40, h: 40 });
    assert.ok(view.isChunkLoaded(2, 3), 'still within keep range');
    assert.equal(view.loadedChunks, 20);
    // 远移：视野 cx ∈ [6,7]，保留 [4,7] → cx 2、3 被卸载。
    view.update({ x: 200, y: 100, w: 40, h: 40 });
    assert.equal(view.isChunkLoaded(2, 3), false);
    assert.equal(view.isChunkLoaded(3, 3), false);
    assert.ok(view.isChunkLoaded(4, 3));
    let groups = 0;
    view.root.traverse((o) => {
      if (o.name.startsWith('tile-chunk-')) groups++;
    });
    assert.equal(groups, view.loadedChunks, 'unloaded chunk groups are removed from the scene');
    view.dispose();
  });

  test('已加载脏区块（及其 8 邻）重建；未加载脏区块等到进入视野时按当前数据构建', () => {
    const map = createTileMap(256, 256, DEFAULT_TILES);
    const view = createTileView(map, { maxBuildsPerFrame: 64 });
    view.update(VIEW);
    map.set(110, 110, TILE_DIRT); // 区块 (3,3)，8 邻 cx,cy ∈ [2,4] 均已加载
    assert.equal(view.update(VIEW), 9);
    assert.equal(instanceCounts(view.root).get('dirt'), 1);
    map.set(250, 250, TILE_STONE); // 区块 (7,7) 未加载
    assert.equal(view.update(VIEW), 0);
    assert.equal(view.isChunkLoaded(7, 7), false);
    view.update({ x: 216, y: 216, w: 40, h: 40 });
    assert.ok(view.isChunkLoaded(7, 7));
    assert.equal(instanceCounts(view.root).get('stone'), 1);
    view.dispose();
  });

  test('无参 update 保持全量构建；非法选项即抛', () => {
    const map = createTileMap(64, 64, DEFAULT_TILES);
    const view = createTileView(map);
    assert.equal(view.update(), 4);
    assert.equal(view.loadedChunks, 4);
    assert.equal(view.pendingChunks, 0);
    view.dispose();
    assert.throws(() => createTileView(map, { marginChunks: 3, keepChunks: 2 }), /tile-view/);
    assert.throws(() => createTileView(map, { maxBuildsPerFrame: 0 }), /tile-view/);
  });
});

describe('stage 远景与阴影', () => {
  test('远山每层一个网格；无地下背景墙（只做地表）', () => {
    const width = 120;
    const surface = new Int16Array(width);
    for (let x = 0; x < width; x++) surface[x] = 60 + (x % 7);
    const backdrop = createBackdrop({ width, height: 100, surface });
    const meshes: THREE.Mesh[] = [];
    backdrop.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    assert.equal(meshes.find((m) => m.name === 'backdrop-wall'), undefined);
    const hills = meshes.filter((m) => m.name.startsWith('backdrop-hills'));
    const mean = 63;
    for (const h of hills) {
      h.geometry.computeBoundingBox();
      const box = h.geometry.boundingBox as THREE.Box3;
      assert.ok(box.max.y > mean - 10 && box.max.y < mean + 40, `hill tops near mean surface, got ${box.max.y}`);
    }
    backdrop.dispose();
    assert.equal(backdrop.root.children.length, 0);
    assert.throws(() => createBackdrop({ width: 10, height: 10, surface: new Int16Array(5) }), /stage/);
  });

  test('阴影半范围随宽高比扩大，最小 14', () => {
    assert.equal(shadowHalfExtent(30, 30, 0.5), 14);
    const hh = 30 * Math.tan(THREE.MathUtils.degToRad(15));
    assert.ok(Math.abs(shadowHalfExtent(30, 30, 4) - (hh * 4 + 2)) < 1e-9);
  });
});

function makeOrb(id: number, x: number, y: number): Entity {
  const r = TUNING.attacks.orb.radius;
  return {
    id,
    kind: 'orb',
    team: 'player',
    body: createBody({ x, y: y - r, halfWidth: r, height: 2 * r }),
    facing: 1,
    projectile: { ownerId: 1, def: TUNING.attacks.orb, lifeTicks: 10, impactTicks: null, hitIds: [], bouncesLeft: 0, leftWater: false, level: 1, returned: false },
  };
}

describe('orb-view', () => {
  test('光源池数量恒定且启动即在场景中；按距玩家远近分配', () => {
    const scene = new THREE.Scene();
    const orbs = createOrbViews({ tuning: TUNING, scene });
    const lights = (): THREE.PointLight[] => scene.children.filter((o) => (o as THREE.PointLight).isPointLight) as THREE.PointLight[];
    assert.equal(lights().length, TUNING.render.orbLights);
    assert.ok(lights().every((l) => l.intensity === 0));
    const player = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
    const far = makeOrb(10, 40, 1);
    const near = makeOrb(11, 3, 1);
    const mid = makeOrb(12, 10, 1);
    orbs.update([player, far, near, mid], 1);
    assert.equal(lights().length, TUNING.render.orbLights);
    const lit = lights().filter((l) => l.intensity > 0);
    assert.equal(lit.length, Math.min(3, TUNING.render.orbLights));
    assert.ok(lit.some((l) => Math.abs(l.position.x - 3) < 1e-9), 'nearest orb gets a light');
    assert.ok(!lit.some((l) => Math.abs(l.position.x - 40) < 1e-9) || TUNING.render.orbLights >= 3);
    orbs.update([player], 1);
    assert.ok(lights().every((l) => l.intensity === 0));
    assert.equal(lights().length, TUNING.render.orbLights);
    orbs.dispose();
    assert.equal(lights().length, 0);
  });

  test('视图共享几何/材质、插值位置、光晕加性混合；dispose 释放共享资源', () => {
    const scene = new THREE.Scene();
    const orbs = createOrbViews({ tuning: TUNING, scene });
    const a = makeOrb(20, 5, 5);
    const b = makeOrb(21, 8, 5);
    const va = orbs.factory(a);
    const vb = orbs.factory(b);
    const parts = (v: { object: THREE.Object3D }) => {
      let mesh: THREE.Mesh | null = null;
      let sprite: THREE.Sprite | null = null;
      v.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !(o as THREE.Sprite).isSprite) mesh = o as THREE.Mesh;
        if ((o as THREE.Sprite).isSprite) sprite = o as THREE.Sprite;
      });
      assert.ok(mesh && sprite);
      return { mesh: mesh as THREE.Mesh, sprite: sprite as THREE.Sprite };
    };
    const pa = parts(va);
    const pb = parts(vb);
    assert.equal(pa.mesh.geometry, pb.mesh.geometry);
    assert.equal(pa.mesh.material, pb.mesh.material);
    assert.equal(pa.sprite.material, pb.sprite.material);
    const glow = pa.sprite.material as THREE.SpriteMaterial;
    assert.equal(glow.blending, THREE.AdditiveBlending);
    assert.equal(glow.depthWrite, false);
    assert.equal(glow.toneMapped, false);
    assert.ok(glow.map instanceof THREE.DataTexture);
    a.body.prevX = 4;
    a.body.x = 6;
    va.sync(a, 0.5, 1 / 60);
    assert.equal(va.object.position.x, 5);
    assert.ok(Math.abs(va.object.position.y - 5) < 1e-9, 'view origin is the orb centre');
    assert.throws(() => orbs.factory(createPelicanEntity(2, { x: 0, y: 0 }, TUNING)), /orb view/);
    let disposed = 0;
    pa.mesh.geometry.addEventListener('dispose', () => disposed++);
    (pa.mesh.material as THREE.Material).addEventListener('dispose', () => disposed++);
    glow.addEventListener('dispose', () => disposed++);
    (glow.map as THREE.Texture).addEventListener('dispose', () => disposed++);
    va.dispose();
    assert.equal(disposed, 0, 'per-view dispose keeps shared resources');
    orbs.dispose();
    assert.equal(disposed, 4);
  });
});

describe('orb-fx', () => {
  test('发射/命中从固定 sprite 池取爆闪，淡出后回收复用', () => {
    const scene = new THREE.Scene();
    const fx = createOrbFx(scene);
    const sprites = (): THREE.Sprite[] => {
      const out: THREE.Sprite[] = [];
      scene.traverse((o) => {
        if ((o as THREE.Sprite).isSprite) out.push(o as THREE.Sprite);
      });
      return out;
    };
    assert.equal(sprites().length, ORB_FX_POOL_SIZE);
    assert.equal(ORB_FX_POOL_SIZE, 16);
    const events: SimEvent[] = [
      { type: 'projectileFired', kind: 'orb', id: 5, ownerId: 1, x: 2, y: 3, dirX: 1, dirY: 0, level: 1, returned: false },
      { type: 'projectileImpact', kind: 'orb', id: 5, x: 8, y: 3, vx: 22, vy: 0, reason: 'terrain', level: 1, returned: false },
      // 非光球的投射物事件不触发光球爆闪。
      { type: 'projectileFired', kind: 'waterShot', id: 6, ownerId: 1, x: 2, y: 3, dirX: 1, dirY: 0, level: 1, returned: false },
      { type: 'hit', attackerId: 1, sourceId: 5, targetId: 2, damage: 8, x: 0, y: 0 },
    ];
    fx.handleEvents(events);
    assert.equal(fx.activeCount, 2);
    const active = sprites().filter((s) => s.visible);
    assert.equal(active.length, 2);
    const s0 = active[0] as THREE.Sprite;
    const scale0 = s0.scale.x;
    const opacity0 = (s0.material as THREE.SpriteMaterial).opacity;
    fx.update(0.05);
    assert.ok(s0.scale.x > scale0, 'flash grows');
    assert.ok((s0.material as THREE.SpriteMaterial).opacity < opacity0, 'flash fades');
    fx.update(10);
    assert.equal(fx.activeCount, 0);
    assert.ok(sprites().every((s) => !s.visible));
    // 超出池容量：复用最旧的，数量不增长。
    const many: SimEvent[] = [];
    for (let i = 0; i < 40; i++) many.push({ type: 'projectileImpact', kind: 'orb', id: i, x: i, y: 0, vx: 0, vy: 0, reason: 'expire', level: 1, returned: false });
    fx.handleEvents(many);
    assert.equal(fx.activeCount, ORB_FX_POOL_SIZE);
    assert.equal(sprites().length, ORB_FX_POOL_SIZE);
    fx.dispose();
    assert.equal(sprites().length, 0);
  });
});

// ---------- HUD（伪 DOM） ----------

describe('hud 飞行能量条', () => {
  const stats = { fps: 60, tick: 0, droppedTicks: 0 };

  test('按 flightTicks/flightMaxTicks 显示，<25% 变红，max=0 隐藏；玩家缺失即抛', () => {
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createHud(root as unknown as HTMLElement, () => ({ x: 0, y: 0 }));
      const player = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
      const p = player.pelican;
      assert.ok(p);
      p.flightMaxTicks = 300;
      p.flightTicks = 150;
      const frame = { entities: [player], alpha: 1, frameDt: 1 / 60, stats, playerId: 1 };
      hud.update(frame);
      const panel = root.find('hud-flight');
      const fill = root.find('hud-flight-fill');
      assert.ok(panel && fill);
      assert.equal(panel.hidden, false);
      assert.equal(fill.style.width, '50.0%');
      assert.equal(panel.classList.contains('hud-flight-low'), false);
      assert.ok(panel.find('hud-flight-label')?.textContent?.includes('飞行'));
      p.flightTicks = 60;
      hud.update(frame);
      assert.equal(fill.style.width, '20.0%');
      assert.equal(panel.classList.contains('hud-flight-low'), true);
      p.flightMaxTicks = 0;
      p.flightTicks = 0;
      hud.update(frame);
      assert.equal(panel.hidden, true);
      assert.throws(() => hud.update({ ...frame, playerId: 99 }), /hud: player 99/);
      hud.dispose();
    });
  });

  test('光球冷却指示与命中事件兼容', () => {
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createHud(root as unknown as HTMLElement, () => ({ x: 0, y: 0 }), { orbCooldownTicks: 20 });
      const player = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
      const p = player.pelican;
      assert.ok(p);
      p.shootCooldownTicks = 5;
      hud.update({ entities: [player], alpha: 1, frameDt: 1 / 60, stats, playerId: 1 });
      const orb = root.find('hud-orb-fill');
      assert.ok(orb);
      assert.equal(orb.style.width, '75.0%');
      hud.handleEvents([
        { type: 'projectileFired', kind: 'orb', id: 5, ownerId: 1, x: 0, y: 0, dirX: 1, dirY: 0, level: 1, returned: false },
        { type: 'hit', attackerId: 1, sourceId: 5, targetId: 2, damage: 8, x: 0, y: 0 },
      ]);
      assert.equal(hud.popupCount, 1);
      hud.dispose();
    });
  });
});
