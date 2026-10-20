import * as THREE from 'three';
import { TILE_SHAPE_DEFINITIONS, TILE_SHAPE_JOINS, type DefinitionDepthMode } from '../../config/definition-kit.ts';
import { RESIDENCE_MATERIALS, type ResidenceMaterial } from '../../config/residence.ts';
import { mapLevel, placeDefinitionSolid } from '../../sim/definition-world.ts';
import { createSimWorld } from '../../sim/sim-world.ts';
import { createTileMap } from '../../world/tile-map.ts';
import { DEFAULT_TILES, TILE_AIR } from '../../world/tile-types.ts';
import { createDefinitionKit } from '../../render/building/definition-kit.ts';
import { warmUpStage } from '../../render/stage/warm-up.ts';
import { createBuildingFieldStage } from '../workspace/building-field-stage.ts';
import { createSceneViewControls, type SceneViewAngle } from '../../ui/panels/scene-view-controls.tsx';
import type { SceneMountContext } from '../workspace/scene-mount.ts';
import { t } from '../../config/i18n.ts';
import '../../ui/hud/tile-material-gallery.css';

// 格位间距取整格：形状写进格子世界。
const SHAPE_STEP = 3;
const JOIN_STEP = 5;
const GALLERY_MAP = { width: 48, height: 64 };

export async function mountTileMaterialGallery(context: SceneMountContext): Promise<void> {
  const page = document.createElement('section');
  page.className = 'tile-material-gallery';
  page.innerHTML = `<header class="resource-inspection-toolbar">
    <span data-scene-view-controls></span><button type="button" data-fit>${t('查看全部')}</button>
    <label data-depth-label>${t('格子深度')} <select aria-label="${t('画廊格子深度')}"><option value="normal">${t('普通 · 深 2 格')}</option><option value="deep">${t('加深 · 深 3 格')}</option></select></label>
    </header><div class="tile-gallery-body"><aside class="tile-gallery-materials" aria-label="${t('材质列表')}">
    <h2>${t('选择材质')}</h2><div data-materials></div><p data-description></p>
    <p>${t('左键旋转 · 右键拖动 · 滚轮缩放')}</p><a href="./?mode=lab&demo=sandbox">${t('前往自由搭建场')}</a>
    </aside><div class="tile-gallery-viewport"></div></div>`;
  context.root.append(page);
  context.onDispose(() => page.remove());
  context.attachToolbar(page.querySelector<HTMLElement>('.resource-inspection-toolbar')!);
  const viewport = page.querySelector<HTMLElement>('.tile-gallery-viewport')!;
  // 画廊按整格排布，形状写进格子世界，雨雪按真实形状遮挡；换材质或尺寸时整张地图重写。
  const map = createTileMap(GALLERY_MAP.width, GALLERY_MAP.height, DEFAULT_TILES);
  const world = createSimWorld({ level: mapLevel(map, { x: 1, y: 0 }) });
  context.onDispose(() => world.fluid.dispose());
  const runtime = createBuildingFieldStage(context, viewport, world);
  const { stage, orbit } = runtime;
  stage.canvas.setAttribute('aria-label', t('瓦片材质与形状画廊'));
  orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  const labels: THREE.Sprite[] = [];
  let galleryWidth = 30, galleryHeight = 24;
  let content: { root: THREE.Group; dispose(): void } | null = null;
  let material = 'ceramic';
  let depth: DefinitionDepthMode = 'normal';
  let view: SceneViewAngle = 'angle';
  const viewControls = createSceneViewControls(page.querySelector<HTMLElement>('[data-scene-view-controls]')!, { presetsOnly: true });
  context.onDispose(viewControls.dispose);
  // 预设只发视角动作；手动转动镜头后不再对应任何预设，“查看全部”回到最后选的预设。
  viewControls.on((action) => { view = action as SceneViewAngle; fit(); }, context.signal);
  orbit.addEventListener('start', () => viewControls.set({ preset: null }));
  const clear = (): void => {
    if (content) { content.root.removeFromParent(); content.dispose(); content = null; }
    for (const label of labels.splice(0)) { label.removeFromParent(); label.material.map!.dispose(); label.material.dispose(); }
  };
  context.onDispose(clear);
  const label = (text: string, x: number, y: number, maxWidth = 3.5): void => {
    const canvas = document.createElement('canvas');
    const painter = canvas.getContext('2d');
    if (!painter) throw new Error('材质画廊无法创建文字画布');
    const font = '600 48px "PingFang SC", sans-serif';
    painter.font = font;
    canvas.width = Math.ceil(painter.measureText(text).width) + 24;
    canvas.height = 80;
    painter.font = font; painter.textAlign = 'center'; painter.textBaseline = 'middle';
    painter.lineJoin = 'round'; painter.lineWidth = 7; painter.strokeStyle = '#10252e'; painter.fillStyle = '#f0f6f1';
    painter.strokeText(text, canvas.width / 2, 40); painter.fillText(text, canvas.width / 2, 40);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false }));
    const height = Math.min(.7, maxWidth * canvas.height / canvas.width);
    sprite.scale.set(height * canvas.width / canvas.height, height, 1);
    sprite.position.set(x, y, 1.65); sprite.renderOrder = 15;
    stage.scene.add(sprite); labels.push(sprite);
  };
  const fit = (): void => {
    orbit.target.set(galleryWidth / 2, galleryHeight / 2, 0);
    runtime.setView(view);
    viewControls.set({ preset: view });
    const direction = stage.camera.position.clone().sub(orbit.target).normalize();
    const distance = Math.max(galleryHeight + 2, (galleryWidth + 2) / stage.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
    stage.camera.position.copy(orbit.target).addScaledVector(direction, distance);
    orbit.update();
  };
  const materials = page.querySelector<HTMLElement>('[data-materials]')!;
  for (const [id, name] of Object.entries(RESIDENCE_MATERIALS)) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = t(name!); button.dataset.material = id;
    button.addEventListener('click', () => { material = id!; rebuild(); }, { signal: context.signal }); materials.append(button);
  }
  const rebuild = (): void => {
    clear();
    for (const button of materials.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.material === material));
    const kit = createDefinitionKit({ style: 'ai-city' });
    kit.root.scale.z = -1;
    content = kit;
    const targetWidth = Math.sqrt(360 * viewport.clientWidth / viewport.clientHeight);
    const shapeColumns = Math.max(3, Math.min(11, Math.round(targetWidth / SHAPE_STEP)));
    const joinColumns = Math.max(2, Math.min(6, Math.floor(targetWidth / JOIN_STEP)));
    const shapeRows = Math.ceil(TILE_SHAPE_DEFINITIONS.length / shapeColumns);
    const joinRows = Math.ceil(TILE_SHAPE_JOINS.length / joinColumns);
    galleryWidth = Math.max(shapeColumns * SHAPE_STEP, joinColumns * JOIN_STEP) + 1;
    galleryHeight = shapeRows * SHAPE_STEP + joinRows * 3 + 5;
    const shapeTop = galleryHeight - 3;
    const joinTop = shapeTop - shapeRows * SHAPE_STEP - 2;
    TILE_SHAPE_DEFINITIONS.forEach((shape, index) => {
      const x = 1 + index % shapeColumns * SHAPE_STEP, y = shapeTop - Math.floor(index / shapeColumns) * SHAPE_STEP;
      kit.solid(shape.id, x, y, material as ResidenceMaterial, depth);
      label(shape.id, x + .5, y - .6, 2.1);
    });
    TILE_SHAPE_JOINS.forEach((shapes, index) => {
      const x = 1 + index % joinColumns * JOIN_STEP, y = joinTop - Math.floor(index / joinColumns) * 3;
      if (material === 'ashlar' && shapes.length === 2 && shapes[0] === shapes[1] && ['A', 'B', 'C'].includes(shapes[0]!)) kit.solid(shapes[0]!, x, y, 'ashlar', depth, 2);
      else shapes.forEach((id, offset) => kit.solid(id, x + offset, y, material as ResidenceMaterial, depth));
      label(shapes.join(' + '), x + shapes.length / 2, y - .7, 4);
    });
    label(t('全部形状 · 33 种'), galleryWidth / 2, galleryHeight - .5, 8);
    label(t('明确拼接 · 11 组'), galleryWidth / 2, joinTop + 2, 8);
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) map.set(x, y, TILE_AIR);
    for (const solid of kit.solids) placeDefinitionSolid(map, solid, { x: 0, y: 0 });
    page.querySelector('[data-description]')!.textContent = t(depth === 'normal' ? '33 种正式形状、11 组拼接。普通格深 2 格。字母对应空间标准中的形状编号。'
      : '33 种正式形状、11 组拼接。加深格前后各增加 0.5 格，总深 3 格；同占位不能放背景墙。字母对应空间标准中的形状编号。');
    stage.scene.add(content.root);
    fit();
  };
  page.querySelector('select')!.addEventListener('change', event => {
    depth = (event.target as HTMLSelectElement).value as DefinitionDepthMode; rebuild();
  }, { signal: context.signal });
  page.querySelector('[data-fit]')!.addEventListener('click', fit, { signal: context.signal });
  context.progress(t('装配材质与全部形状')); rebuild();
  let viewportSize = `${viewport.clientWidth}:${viewport.clientHeight}`;
  const resize = new ResizeObserver(() => {
    const nextSize = `${viewport.clientWidth}:${viewport.clientHeight}`;
    if (viewport.clientWidth > 0 && viewport.clientHeight > 0 && nextSize !== viewportSize) {
      viewportSize = nextSize;
      rebuild();
    }
  });
  resize.observe(viewport);
  context.onDispose(() => resize.disconnect());
  await warmUpStage(stage, [], context.signal);
  context.signal.throwIfAborted();
  runtime.onFrame(() => {});
}
