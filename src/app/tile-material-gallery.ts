import * as THREE from 'three';
import { TILE_SHAPE_DEFINITIONS, TILE_SHAPE_JOINS, type DefinitionDepthMode } from '../config/definition-kit.ts';
import { RESIDENCE_MATERIALS, type ResidenceMaterial } from '../config/residence.ts';
import type { DefinitionCollider } from '../physics/definition-collision.ts';
import { createDefinitionKit } from '../render/definition-kit.ts';
import { warmUpStage } from '../render/warm-up.ts';
import { createBuildingFieldStage, type BuildingFieldView } from './building-field-stage.ts';
import type { SceneMountContext } from './scene-mount.ts';


export async function mountTileMaterialGallery(context: SceneMountContext): Promise<void> {
  const page = document.createElement('section');
  page.className = 'tile-material-gallery';
  page.innerHTML = `<header class="resource-inspection-toolbar">
    <button type="button" data-view="front">正视</button><button type="button" data-view="angle">斜视</button>
    <button type="button" data-view="top">俯视</button><button type="button" data-fit>查看全部</button>
    <label data-depth-label>格子深度 <select aria-label="画廊格子深度"><option value="normal">普通 · 深 2 格</option><option value="deep">加深 · 深 3 格</option></select></label>
    </header><div class="tile-gallery-body"><aside class="tile-gallery-materials" aria-label="材质列表">
    <h2>选择材质</h2><div data-materials></div><p data-description></p>
    <p>左键旋转 · 右键拖动 · 滚轮缩放</p><a href="./?mode=lab&demo=sandbox">前往自由搭建场</a>
    </aside><div class="tile-gallery-viewport"></div></div>`;
  context.root.append(page);
  context.onDispose(() => page.remove());
  const viewport = page.querySelector<HTMLElement>('.tile-gallery-viewport')!;
  let solids: readonly DefinitionCollider[] = [];
  const runtime = createBuildingFieldStage(context, viewport, () => solids, { minX: 0, width: 46 });
  const { stage, orbit } = runtime;
  stage.canvas.setAttribute('aria-label', '瓦片材质与形状画廊');
  orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  const labels: THREE.Sprite[] = [];
  let galleryWidth = 30, galleryHeight = 24;
  let content: { root: THREE.Group; dispose(): void } | null = null;
  let material = 'ceramic';
  let depth: DefinitionDepthMode = 'normal';
  let view: BuildingFieldView = 'angle';
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
    const direction = stage.camera.position.clone().sub(orbit.target).normalize();
    const distance = Math.max(galleryHeight + 2, (galleryWidth + 2) / stage.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
    stage.camera.position.copy(orbit.target).addScaledVector(direction, distance);
    orbit.update();
  };
  const materials = page.querySelector<HTMLElement>('[data-materials]')!;
  for (const [id, name] of Object.entries(RESIDENCE_MATERIALS)) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name!; button.dataset.material = id;
    button.addEventListener('click', () => { material = id!; rebuild(); }, { signal: context.signal }); materials.append(button);
  }
  const rebuild = (): void => {
    clear();
    for (const button of materials.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.material === material));
    const kit = createDefinitionKit({ style: 'ai-city' });
    kit.root.scale.z = -1;
    content = kit;
    const targetWidth = Math.sqrt(360 * viewport.clientWidth / viewport.clientHeight);
    const shapeColumns = Math.max(3, Math.min(11, Math.round(targetWidth / 2.6)));
    const joinColumns = Math.max(2, Math.min(6, Math.floor(targetWidth / 4.5)));
    const shapeRows = Math.ceil(TILE_SHAPE_DEFINITIONS.length / shapeColumns);
    const joinRows = Math.ceil(TILE_SHAPE_JOINS.length / joinColumns);
    galleryWidth = Math.max(shapeColumns * 2.6, joinColumns * 4.5) + 1;
    galleryHeight = shapeRows * 2.8 + joinRows * 3 + 5;
    const shapeTop = galleryHeight - 3;
    const joinTop = shapeTop - shapeRows * 2.8 - 2;
    TILE_SHAPE_DEFINITIONS.forEach((shape, index) => {
      const x = 1 + index % shapeColumns * 2.6, y = shapeTop - Math.floor(index / shapeColumns) * 2.8;
      kit.solid(shape.id, x, y, material as ResidenceMaterial, depth);
      label(shape.id, x + .5, y - .6, 2.1);
    });
    TILE_SHAPE_JOINS.forEach((shapes, index) => {
      const x = 1 + index % joinColumns * 4.5, y = joinTop - Math.floor(index / joinColumns) * 3;
      if (material === 'ashlar' && shapes.length === 2 && shapes[0] === shapes[1] && ['A', 'B', 'C'].includes(shapes[0]!)) kit.solid(shapes[0]!, x, y, 'ashlar', depth, 2);
      else shapes.forEach((id, offset) => kit.solid(id, x + offset, y, material as ResidenceMaterial, depth));
      label(shapes.join(' + '), x + shapes.length / 2, y - .7, 4);
    });
    label('全部形状 · 33 种', galleryWidth / 2, galleryHeight - .5, 8);
    label('明确拼接 · 11 组', galleryWidth / 2, joinTop + 2, 8);
    solids = kit.solids;
    page.querySelector('[data-description]')!.textContent = `33 种正式形状、11 组拼接。${depth === 'normal' ? '普通格深 2 格。' : '加深格前后各增加 0.5 格，总深 3 格；同占位不能放背景墙。'}字母对应空间标准中的形状编号。`;
    stage.scene.add(content.root);
    fit();
  };
  page.querySelector('select')!.addEventListener('change', event => {
    depth = (event.target as HTMLSelectElement).value as DefinitionDepthMode; rebuild();
  }, { signal: context.signal });
  for (const button of page.querySelectorAll<HTMLButtonElement>('[data-view]')) button.addEventListener('click', () => {
    view = button.dataset.view as BuildingFieldView; fit();
  }, { signal: context.signal });
  page.querySelector('[data-fit]')!.addEventListener('click', fit, { signal: context.signal });
  context.progress('装配材质与全部形状'); rebuild();
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
