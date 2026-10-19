import * as THREE from 'three';
import { GRASSY_HEIGHT } from '../../config/grassy.ts';
import { onLanguageChange, t } from '../../config/i18n.ts';

/** 格子尺画到 4 格：3.1 格是有发赤脚基础版外观高，帽子、装备形态和更高的角色需要顶线以上的余量。 */
export const RULER_TILES = 4;
const HEAD_COUNT = 3.3;
const TILE_COLOR = '#c75c25';
const HEAD_COLOR = '#7550aa';
const INK_COLOR = '#21324a';
const PAPER_COLOR = '#f5f4ef';
/** 两把尺主轴到中心的距离；中间留给 3.1 格顶线标签。 */
const BAR_OFFSET = .36;
const LABEL_HEIGHT = .15;

/**
 * 与原画标尺标准一致的场景标尺：右侧橙色格子尺，左侧紫色 3.3 头身参照尺，共用地面和 3.1 格顶线。
 * 原点在地面中心，1 世界单位 = 1 格；不受光、不受雾，地上地下颜色一致。
 */
export function createSizeRuler(): { readonly root: THREE.Group; dispose(): void } {
  const root = new THREE.Group();
  root.name = 'size-ruler';
  const unit = new THREE.PlaneGeometry(1, 1);
  const flat = (color: string): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  const tile = flat(TILE_COLOR), head = flat(HEAD_COLOR), ink = flat(INK_COLOR);
  const disposeMesh = (mesh: THREE.Mesh): void => {
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
    if (mesh.geometry !== unit) mesh.geometry.dispose();
  };
  const bar = (material: THREE.Material, x: number, y: number, width: number, height: number): void => {
    const mesh = new THREE.Mesh(unit, material);
    mesh.position.set(x, y, 0);
    mesh.scale.set(width, height, 1);
    root.add(mesh);
  };
  const label = (text: string, color: string, x: number, y: number, align: 'left' | 'right' | 'center'): THREE.Mesh => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('标尺刻度标签需要 canvas 2D 上下文');
    const font = 'bold 44px "STHeiti Medium", "PingFang SC", sans-serif';
    context.font = font;
    canvas.width = Math.ceil(context.measureText(text).width) + 20;
    canvas.height = 60;
    // 改尺寸会重置画布状态。纸色底让刻度在草地、夜空和地下背景前都能读出。
    context.fillStyle = PAPER_COLOR;
    context.globalAlpha = .88;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;
    context.font = font;
    context.fillStyle = color;
    context.textBaseline = 'middle';
    context.fillText(text, 10, canvas.height / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const width = LABEL_HEIGHT * canvas.width / canvas.height;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, LABEL_HEIGHT),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, fog: false }));
    mesh.position.set(align === 'left' ? x + width / 2 : align === 'right' ? x - width / 2 : x, y, .002);
    root.add(mesh);
    return mesh;
  };

  // 橙色格子尺：0.1 格小刻度、0.5 格中刻度、整格长刻度并标数字，刻度朝右。
  bar(tile, BAR_OFFSET, RULER_TILES / 2, .03, RULER_TILES);
  for (let tenth = 0; tenth <= RULER_TILES * 10; tenth++) {
    const length = tenth % 10 === 0 ? .22 : tenth % 5 === 0 ? .14 : .08;
    bar(tile, BAR_OFFSET + length / 2, tenth / 10, length, tenth % 10 === 0 ? .024 : .014);
    if (tenth % 10 === 0) label(String(tenth / 10), TILE_COLOR, BAR_OFFSET + .26, tenth / 10, 'left');
  }
  // 紫色 3.3 头身参照尺：3.1 格等分 3.3 份，刻度朝左。
  const headHeight = GRASSY_HEIGHT / HEAD_COUNT;
  bar(head, -BAR_OFFSET, GRASSY_HEIGHT / 2, .03, GRASSY_HEIGHT);
  for (const heads of [0, 1, 2, 3, HEAD_COUNT]) {
    bar(head, -BAR_OFFSET - .11, heads * headHeight, .22, .024);
    label(`${heads}H`, HEAD_COLOR, -BAR_OFFSET - .26, heads * headHeight, 'right');
  }
  // 共用地面与 3.1 格顶线。
  const span = 2 * BAR_OFFSET + .44;
  bar(ink, 0, 0, span, .02);
  bar(ink, 0, GRASSY_HEIGHT, span, .016);
  const heightLabel = (): THREE.Mesh => label(t('{n} 格').replace('{n}', String(GRASSY_HEIGHT)), INK_COLOR, 0, GRASSY_HEIGHT + LABEL_HEIGHT / 2 + .04, 'center');
  // 标签画布宽度随文字测量，换语言时整块重建而不是重绘。
  let topLabel = heightLabel();
  const stopLanguage = onLanguageChange(() => {
    disposeMesh(topLabel);
    topLabel.removeFromParent();
    topLabel = heightLabel();
  });
  // 细刻度难以点中；不渲染的覆盖面让整把尺都能被选中和拖动。
  const hit = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, RULER_TILES / 2, 0);
  hit.scale.set(2 * BAR_OFFSET + 1.2, RULER_TILES + .3, 1);
  root.add(hit);

  return {
    root,
    dispose() {
      stopLanguage();
      root.traverse((object) => { if (object instanceof THREE.Mesh) disposeMesh(object); });
      unit.dispose();
      root.removeFromParent();
    },
  };
}
