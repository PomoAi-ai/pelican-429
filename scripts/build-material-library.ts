import { writeFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { RESIDENCE_LIGHTS, RESIDENCE_RESOURCES, RESIDENCE_WORLD, type ResidenceResource } from '../src/config/residence.ts';
import { TILE_SHAPE_DEFINITIONS } from '../src/config/definition-kit.ts';
import { createAiCityFixture } from '../src/render/city/ai-city-architecture.ts';
import { TILE_TEXTURE_PERIOD } from '../src/render/tile/tile-textures.ts';

const fixtureDepths = new Map(RESIDENCE_RESOURCES.filter(r => r.kind === 'fixture').map(r => {
  const view = createAiCityFixture(r.fixture);
  const depth = new Box3().setFromObject(view.root).getSize(new Vector3()).z;
  view.dispose();
  return [r.fixture, String(Number(depth.toFixed(4)))];
}));

function rules(r: ResidenceResource): [string, string] {
  switch (r.kind) {
    case 'solid': return ['2 / 加深 3', '实心；按实际轮廓组合；加深禁止整父格背景墙'];
    case 'wall': return ['0.2', '背景层；不承托；禁止与加深格同格'];
    case 'glazing': return ['[0.2（墙窗标准）](wall-window-definitions.md)', '背景层跨格占位；不承托；占位范围禁止加深格'];
    case 'door': return ['[2（门框占位）](door-definitions.md)', '自动感应开关；保留门洞；关闭屏障阻挡人物；能量粒子不扩大占格'];
    case 'platform': return ['无墙 1 / 有墙 1.5', '单向承托；顶面=安装 y+0.5；可半格安装；宽度与材质分别选择'];
    case 'furniture': return [r.furniture === 'solar' ? '2（居中）' : '1（标准占位）', r.standTop === null ? '整件摆放和拆除；不提供承托顶面' : `整件摆放和拆除；承托顶面=安装 y+${r.standTop}`];
    case 'fixture': return [`${fixtureDepths.get(r.fixture)!}（模型包络）`, r.fixture.startsWith('trim-')
      ? '整件摆放与拆除；收边依附和拆支撑限制先记录，暂未强制，开放规则后续决定'
      : r.fixture === 'planter' ? '整件摆放与拆除；包络包含叶片；不新增实体承托' : '整件摆放与拆除；装饰不新增实体承托'];
  }
}
function lighting(r: ResidenceResource): string {
  const light = RESIDENCE_LIGHTS[r.id];
  return light ? `；照明半径 ${light.radius} 格，灯色 #${light.color.toString(16).padStart(6, '0')}` : '';
}
const table = (headers: string[], data: string[][]): string => [headers, headers.map(() => '---'), ...data]
  .map(row => `| ${row.map(value => value.replaceAll('|', '\\|')).join(' | ')} |`).join('\n');
function category(r: ResidenceResource): string {
  switch (r.kind) {
    case 'solid': return '块';
    case 'wall': return '墙';
    case 'glazing': return '窗';
    case 'door': return '门';
    case 'platform': return '平台';
    case 'furniture':
    case 'fixture': return r.group === '蓝白合金家具' ? '家具' : r.group;
  }
}
const shapeFamilies = [
  ['整砖', ['A']], ['半砖', ['B', 'C', 'K', 'L']], ['四分之一砖', ['M', 'N', 'O', 'P']],
  ['整格坡', ['D', 'E', 'D-U', 'E-U']], ['缓坡低段', ['F', 'I']],
  ['缓坡高段', ['G', 'H']], ['双斜尖顶', ['J']],
] as const;
const shapeById = new Map(TILE_SHAPE_DEFINITIONS.map(shape => [shape.id, shape]));
function shapeTable(variants: ResidenceResource[]): string {
  const solids = variants.filter(r => r.kind === 'solid');
  if (solids.length === 0) return table(['形态', '登记占位（宽×高，格）'], variants.map(r =>
    [r.label.split(' · ').slice(1).join(' · ') || '标准', `${r.width}×${r.height}`]));
  return table(['形态', '支持方向 / 旋转', '实际宽×高（格）'], shapeFamilies.flatMap(([family, ids]) => {
    const shapes = solids.filter(r => (ids as readonly string[]).includes(r.shape.replace(/-(90|180|270)$/, '')))
      .map(r => shapeById.get(r.shape)!);
    if (shapes.length === 0) return [];
    const directions = [...Map.groupBy(shapes, shape => shape.id.replace(/-(90|180|270)$/, ''))].map(([base, members]) => {
      const direction = shapeById.get(base)!.label.replace(family, '');
      const angles = members.map(shape => shape.id.match(/-(90|180|270)$/)?.[1] ?? '0');
      return { direction, rotations: `${angles.join('°、')}°` };
    });
    const orientations = [...Map.groupBy(directions, direction => direction.rotations)].map(([rotations, members]) => {
      const names = members.map(member => member.direction).filter(Boolean).join('、');
      return rotations === '0°' ? names || '标准' : `${names}${names ? '；' : ''}${rotations}`;
    });
    const sizes = [...new Set(shapes.map(shape => {
      const xs = shape.points.map(p => p[0]), ys = shape.points.map(p => p[1]);
      return `${Math.max(...xs) - Math.min(...xs)}×${Math.max(...ys) - Math.min(...ys)}`;
    }))];
    return [[family, orientations.join('；'), sizes.join(' / ')]];
  }));
}
function media(r: ResidenceResource, label: string): string {
  const figure = (file: string, caption: string, texture = false): string =>
    `<figure${texture ? ' class="material-texture"' : ''}><img src="material-previews/${file}.png" alt="${label}：${caption}" width="${texture ? 180 : 240}" height="180"><figcaption>${caption}</figcaption></figure>`;
  const images = [figure(r.id, '游戏构件预览')];
  let description = '材质由模型组合，预览直接来自游戏构件。';
  if (r.kind === 'wall' || r.kind === 'solid' && ['ceramic', 'alloy', 'ashlar'].includes(r.material)) {
    images.push(figure(`${r.id}-surface`, '程序材质表面 · 渲染快照'));
    description = '表面由程序材质生成，没有独立图片贴图；上图展示实际纹理与光泽。';
  } else if (r.kind === 'solid') {
    const textureLayers: Record<string, readonly string[]> = {
      grass: ['grassTop', 'dirt'], dirt: ['dirt'], stone: ['stone'], sand: ['sand'], sandstone: ['sandstone'], timber: ['planks'],
    };
    textureLayers[r.material]!.forEach(layer => images.push(figure(`texture-${layer}`,
      r.material === 'grass' ? `${layer === 'grassTop' ? '顶部' : '侧面'}色彩图 · 程序生成` : '色彩图 · 程序生成', true)));
    description = `以上色彩图直接导出自游戏纹理，一张覆盖 ${TILE_TEXTURE_PERIOD}×${TILE_TEXTURE_PERIOD} 格，非单格截图；光照与阴影在场景中实时计算。`;
  }
  return `<div class="material-resource-media">\n${images.join('\n')}\n</div>\n\n${description}`;
}
const sections = [...Map.groupBy(RESIDENCE_RESOURCES, category)].map(([name, resources]) => {
  const legacyAnchor = name === '墙' ? '<span id="墙与通行"></span>\n\n'
    : name === '家具' ? '<span id="蓝白合金家具"></span>\n\n' : '';
  const entries = [...Map.groupBy(resources, r => r.label.split(' · ')[0]!)].map(([label, variants]) => {
    const r = variants[0]!;
    const [depth, rule] = rules(r);
    return `### ${label}\n\n${media(r, label)}\n\n${shapeTable(variants)}\n\n**深度：**${depth} 格。${rule}${lighting(r)}。`;
  });
  return `${legacyAnchor}## ${name}\n\n${entries.join('\n\n')}`;
});
writeFileSync(new URL('../public/concepts/material-library.md', import.meta.url), `# 材料与构件库

按“类别 → 资源”查阅外观、贴图和支持形态。当前登记 ${new Set(RESIDENCE_RESOURCES.map(r => r.label.split(' · ')[0])).size} 种资源、${RESIDENCE_RESOURCES.length} 个可选形态；形态变化不重复计为新材料。

图片来自共享游戏工厂：构件图展示整体外观，自然材料附实际色彩图，程序建筑材质附表面渲染快照。点击图片可查看原图；实际光泽随场景光照变化。

<details>
<summary>资料来源与更新</summary>

正文由 src/config/residence.ts、src/config/definition-kit.ts 生成；附属构件包络来自 src/render/city/ai-city-architecture.ts。修改资源后运行 npm run docs:resources，不直接编辑生成正文。材质或模型改变时，在 Vite 浏览器环境调用 scripts/export-material-previews.ts 的 exportMaterialPreviews()，重新导出 material-previews 图片快照。网页与 HTTP Markdown 使用同一份图文，LLM 索引见 [llms.txt](../llms.txt)。

</details>

## 查看入口

- [分类与命名](resource-classification.md)
- [自由搭建场](../?mode=lab&demo=sandbox)
- [材料与形状](../?mode=lab&demo=tiles)
- [主世界城区](../?mode=game)
- [原版住宅](../?mode=homestead&scene=residence)

所有条目均可在住宅与自由搭建场选择、铺设和移除。登记占位表示锚点范围；小块按实际轮廓占格，不会填满整个父格。

## 通用约定

普通实体深 2，加深深 3。一个格可放四个互不重叠的四分之一块；任一加深小块禁止整个父格的背景墙。米黄色方石用于铺地、砌墙和盖房，同形、同高、同深度的固定相邻配对可合缝，逻辑仍逐格编辑。

平台是一个构件类型：整宽、左右半、挂墙与顶齐是平台内部属性。家具属于蓝白合金系列，软垫和织物不会因系列名变为金属。

家具标准占位深1，通常贴格子背面占Z=[−1,0]；悬吊灯深1但居中占Z=[−0.5,+0.5]。本表太阳能板为居中深2；透视定义另外支持深3方案，不能据此把它当成目录中另一个家具材料。深度字段中的“标准占位”不把全息投影或柔性叶片当成实心碰撞体；“模型包络”从实际构件几何测量，取到小数点后四位，花槽包含植物伸出部分。

${sections.join('\n\n')}

## 实体形状

各材料表中仅列当前支持的形态。精确轮廓、旋转方向和组合规则见[格子形态与支持范围定义](tile-shape-definitions.md)，普通 / 加深的前后范围见[深度定义](depth-definitions.md)。

## 环境与特殊瓦片

| 对象 | 用途 | 玩家编辑 |
| --- | --- | --- |
| 远景城市、天空、太阳、星空 | 世界环境 | 不作为建筑材料 |
| 无人机、列车 | 环境交通动画 | 不作为建筑格子 |
| 河流、水面、睡莲 | 环境水体与植物 | 本轮不开放为建造构件 |
| 背景树、草花、灌木 | 游戏植物工厂生成环境 | 盆栽与花槽可建造；背景植被另管 |
| 空气 | 空瓦片标识 | 清理产生，不是材料 |
| 树枝承托面 | 树木生成的单向碰撞 | 不单独建造 |
| 渔屋屋顶瓦片 | 屋顶模型配套碰撞 | 建造屋顶使用已登记材料与坡形 |
| 旧游戏平台瓦片 | 世界单向碰撞类型 | 建造目录使用上表正式平台构件 |

## 当前能力与后续边界

- 四小块、互补斜块、半宽平台按实际轮廓组合与编辑；加深与整格背景墙双向互斥。米黄色方石两格合缝保留逐格选取、替换与拆除。
- 住宅地台使用可编辑方石，平台承托随实际宽度和顶面变化；自由搭建目录包含全部已登记资源。
- 暖白岩板、方石和合金使用共享材质，细微纹理固定在世界坐标，反光与阴影随实际光照变化；不把单张静态参考图当成所有天气下的固定颜色。
- 收边依附、拆支撑后的装饰处理，以及坡面和加深格收边的开放范围暂未强制，按用户要求留待后续决定。
- 自然光只经天空、挖通的开口、门与地上窗进入。窗代表后墙开口；低于基础顶面（y=${RESIDENCE_WORLD.foundationTop}）的地下窗背后是地质实体，不产生天空光。地上密闭空间不按高度获得天光。
- 灯具照明有半径上限，沿空气绕拐角传播并随路径长度变暗；灯光与天空漫射光渗入实心构件后迅速衰减，约 2～3 格归零，1 格薄墙另一侧透出微光，2 格以上另一侧基本全黑；太阳直射仍被实心完全遮挡；每盏灯都照亮周围，与镜头位置无关。能量门、全息、能源柱只自发光，不照亮周围。
- 精细高光只由镜头附近少量灯提供：高画质 4 盏，低画质 2 盏。
- 家具坐卧动画尚未制作；拆平台时家具支撑依赖的级联处理尚未接入，跨格支撑与物品返还规则待定。

尺寸登记、规则实现与动画制作分别记录，不把已完成的资源接入误写成“整体尚未制作”，也不把这些后续能力标记为已实现。
`);
