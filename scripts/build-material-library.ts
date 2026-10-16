import { writeFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { RESIDENCE_RESOURCES, type ResidenceResource } from '../src/config/residence.ts';
import { TILE_SHAPE_DEFINITIONS } from '../src/config/definition-kit.ts';
import { createAiCityFixture } from '../src/render/ai-city-architecture.ts';

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
const table = (headers: string[], data: string[][]): string => [headers, headers.map(() => '---'), ...data]
  .map(row => `| ${row.map(value => value.replaceAll('|', '\\|')).join(' | ')} |`).join('\n');
const sections = [...Map.groupBy(RESIDENCE_RESOURCES, r => r.group)].map(([name, resources]) =>
  `## ${name}\n\n${table(['名称', '内部 ID', '占位宽×高', '深度（格）', '规则'], resources.map(r => [r.label, r.id, `${r.width}×${r.height}`, ...rules(r)]))}`);
const shapes = table(['形状', '名称', '实际宽×高'], TILE_SHAPE_DEFINITIONS.map(s => {
  const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]);
  return [s.id, s.label, `${Math.max(...xs) - Math.min(...xs)}×${Math.max(...ys) - Math.min(...ys)}`];
}));
writeFileSync(new URL('../public/concepts/material-library.md', import.meta.url), `# 材料与构件库

本表从共享游戏资源配置自动生成。维护源：src/config/residence.ts、src/config/definition-kit.ts；附属构件的模型深度直接测量 src/render/ai-city-architecture.ts 共享工厂。更新后运行 npm run docs:resources，不手改此表。

当前登记 ${RESIDENCE_RESOURCES.length} 个可选形态，不代表相同数量的材料。全砖、半砖、坡面、平台宽度都是变化，不重复计为材料。

状态：资源已注册并接入资料页面、自由搭建场和住宅共享资源。格子组合、加深互斥、平台承托与逐块编辑已进行专项行为验证；尺寸列区分注册占位、已确认标准深度和工厂模型包络，不把标准占位误称为精确几何包围盒。Markdown 正文通过 HTTP 提供，网页读取同一文件转换展示，LLM 索引见 [llms.txt](../llms.txt)。未制作的坐卧动画和后续装饰规则单独列出。

## 查看入口

- [分类与命名](resource-classification.md)
- [自由搭建场](/?mode=lab&demo=sandbox)
- [材料与形状](/?mode=lab&demo=tiles)
- [AI 住宅](/?mode=lab&demo=residence)

所有表中条目来自住宅与自由搭建场共用的资源注册表，允许选择、铺设和移除。占位表示锚点范围；小块的实际轮廓见形状表，不表示每个小块填满父格。

## 通用约定

普通实体深 2，加深深 3。一个格可放四个互不重叠的四分之一块；任一加深小块禁止整个父格的背景墙。米黄色方石用于铺地、砌墙和盖房，同形、同高、同深度的固定相邻配对可合缝，逻辑仍逐格编辑。

平台是一个构件类型：整宽、左右半、挂墙与顶齐是平台内部属性。家具属于蓝白合金系列，软垫和织物不会因系列名变为金属。

家具标准占位深1，通常贴格子背面占Z=[−1,0]；悬吊灯深1但居中占Z=[−0.5,+0.5]。本表太阳能板为居中深2；透视定义另外支持深3方案，不能据此把它当成目录中另一个家具材料。深度字段中的“标准占位”不把全息投影或柔性叶片当成实心碰撞体；“模型包络”从实际构件几何测量，取到小数点后四位，花槽包含植物伸出部分。

${sections.join('\n\n')}

## 实体形状

${shapes}

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
- 家具坐卧动画尚未制作；拆平台时家具支撑依赖的级联处理尚未接入，跨格支撑与物品返还规则待定。

尺寸登记、规则实现与动画制作分别记录，不把已完成的资源接入误写成“整体尚未制作”，也不把这些后续能力标记为已实现。
`);
