import { getLanguage, onLanguageChange } from './language.ts';
import { ECONOMY_DOCUMENT } from './concept-economy.ts';
import { TILE_SHAPE_DOCUMENT } from './concept-tile-shapes.ts';
import { NATURAL_RESOURCE_DOCUMENT, NATURAL_RESOURCE_STATES, NATURAL_SPATIAL_DOCUMENT } from './concept-natural-resources.ts';
import { addConceptCopyControls } from './concept-copy.ts';
import { TERRAIN_COMPOSITIONS } from '../config/terrain-compositions.ts';
import { translateShowcaseText } from './showcase-language.ts';

/** The resource directory uses the same links as navigation, including release filtering. */
export function mountSitePage(mode: 'catalog' | 'about' | 'concepts', navigation: HTMLElement): void {
  document.body.classList.add('site-home');
  const page = document.getElementById('dev-index')!;
  const section = page.querySelector('section')!;
  const render = (): void => {
    const en = getLanguage() === 'en';
    const title = mode === 'catalog' ? (en ? 'Resource library' : '资源总览')
      : mode === 'concepts' ? (en ? 'Basic concepts' : '基础概念定义') : (en ? 'Help & about' : '帮助与关于');
    document.title = `${title} · ${en ? 'Pelican' : '鹈鹕'} 429`;
    section.innerHTML = `<p class="home-eyebrow">PELICAN 429 / ${mode === 'catalog' ? 'LIBRARY' : 'HELP'}</p><h1>${title}</h1>`;
    if (mode === 'catalog') {
      const description = document.createElement('p');
      description.className = 'dev-catalog-description';
      description.textContent = en ? 'Explore the characters, environments and sounds used in the game.' : '集中查看游戏里的角色、场景素材、声音与画质展示。';
      const links = document.createElement('nav');
      links.id = 'dev-catalog';
      links.setAttribute('aria-label', title);
      for (const source of navigation.querySelectorAll<HTMLAnchorElement>('#home-resources-menu a:not([data-page="catalog"])')) {
        const link = document.createElement('a');
        link.href = source.href;
        link.textContent = source.textContent;
        links.append(link);
      }
      const cast = document.createElement('a');
      cast.href = './#home-cast';
      cast.textContent = en ? 'Meet the characters' : '角色介绍';
      links.append(cast);
      section.append(description, links);
      if (import.meta.env.PROD && import.meta.env.MODE !== 'full') {
        const note = document.createElement('p');
        note.className = 'dev-catalog-description';
        note.textContent = en ? 'Interactive asset showcases are available in the local full edition.' : '交互式角色、场景和声音展示在本地完整版中提供。';
        section.append(note);
      }
    } else if (mode === 'concepts') {
      section.className = 'help-page concepts-page';
      section.innerHTML = conceptsPage(en);
      addConceptCopyControls(section, en);
    } else {
      section.className = 'help-page';
      section.innerHTML = aboutPage(en);
    }
  };
  render();
  onLanguageChange(render);
  page.hidden = false;
  document.getElementById('loading')!.hidden = true;
}

function conceptsPage(en: boolean): string {
  const t = (zh: string, english: string): string => en ? english : zh;
  const systemChapters = [
    t('设计原则', 'Design principles'), t('起点与初始化', 'Starting conditions'), t('时间与日历', 'Time & calendar'),
    t('气候', 'Climate'), t('电力', 'Power'), t('算力', 'Compute'), t('机器人与伙伴', 'Robots & companions'),
    t('材料', 'Materials'), t('食物', 'Food'), t('战斗、血量与防御', 'Combat, health & defence'),
    t('装备与强化', 'Equipment & upgrades'), 'Token', t('怪物与清场', 'Enemies & clearing'),
    t('污染与核电风险', 'Pollution & nuclear risks'), t('NPC 与城镇', 'NPCs & towns'), t('节奏', 'Pacing'),
    t('开发顺序', 'Development sequence'), t('概念版本（阶段 1）', 'Concept version · phase 1'),
    t('本版不做', 'Outside this version'), t('待选', 'Open decisions'),
  ];
  const dimensions = [
    [t('基础格子', 'World tile'), '1 × 1', t('世界长度单位；画面缩放不改变格子尺寸。', 'World units stay constant when the camera zooms.')],
    [t('人物造型', 'Character proportions'), t('3.3 头身', '3.3 heads'), t('设计参照：全身高度约为一个头高的 3.3 倍。', 'Design reference: total height is approximately 3.3 head heights.')],
    [t('人物外观高度', 'Visual height'), t('3.1 格', '3.1 tiles'), t('用于将人物原图与场景放到同一尺度下比较。', 'Used to compare the character artwork and scenery at the same scale.')],
    [t('人物碰撞范围', 'Collision bounds'), t('宽 0.8 × 高 2.8 格', '0.8 wide × 2.8 tall'), t('角色移动与地形交互的范围，不等于头发、服装的外轮廓。', 'The movement and terrain collision bounds differ from the hair and clothing silhouette.')],
  ];
  const layers = [
    [t('背景墙', 'Background wall'), '1 × 1', t('图中按一格模块示意，位于人物身后，不阻挡、不承托角色。可与实体地形处在同一平面坐标。', 'Shown as a one-tile module behind the character. It neither blocks nor supports movement and may share coordinates with solid terrain.')],
    [t('整格地形砖', 'Full terrain tile'), '1 × 1', t('实心地形，提供站立表面并阻挡角色。正面与图中的背景墙模块同宽同高。', 'Solid terrain supports and blocks the character. Its face matches the illustrated wall module in width and height.')],
    [t('下半高地形砖', 'Lower half-height tile'), '1 × 0.5', t('占格子的下半部分，与整格砖同宽，仍是实心地形；当前没有上半砖或倒置斜坡。', 'Fills the lower half of a tile and remains solid. Upper half tiles and inverted slopes are not current shapes.')],
    [t('左右斜坡', 'Left and right slopes'), '1 × 1', t('各占一格边界，分别左高右低、左低右高；坡面为角色提供倾斜落脚面。', 'Each fits within a one-tile square, descending left-to-right or right-to-left and providing a sloped standing surface.')],
    [t('单向平台', 'One-way platform'), t('薄平台', 'Thin platform'), t('从下方可跳过，从上方可站立；与实心半高砖的碰撞行为不同。', 'Pass through from below and stand on top; collision differs from a solid half-height tile.')],
  ];
  const sceneParts = [
    [t('远景背景', 'Distant scenery'), t('天空、云、山体、远城；按景深分层', 'Sky, clouds, mountains and city layers'), t('不承托、不阻挡。视差只改变远近观感。', 'No support or blocking; parallax provides visual depth.')],
    [t('背景墙', 'Background walls'), t('人物后方的房间、洞壁与薄墙板', 'Rooms, cave walls and panels behind the character'), t('不承托、不阻挡，可与实体地形共用平面坐标。', 'No support or blocking; may share planar coordinates with terrain.')],
    [t('地形瓦片', 'Terrain tiles'), t('整格、下半格、左坡、右坡、单向平台', 'Full tiles, lower halves, both slopes and one-way platforms'), t('构成可行走地面与碰撞边界；具体形状见下节。', 'Forms walking surfaces and collision boundaries; see the shapes below.')],
    [t('建筑与设施', 'Buildings & facilities'), t('房屋、栈桥、门、机房与能源设备', 'Houses, piers, doors, server halls and power equipment'), t('可站立结构由地形或平台承托，设备外形本身不等于完整碰撞体。渔屋有左侧、右侧栈桥变体。', 'Terrain and platforms support walkable structures; an equipment silhouette is not a complete collider. Fishing huts have left- and right-pier variants.')],
    [t('植被与装饰', 'Vegetation & decoration'), t('地被、花草、灌木、树、岩石、洞穴装饰', 'Ground cover, flowers, shrubs, trees, rocks and cave decoration'), t('装饰通常不阻挡；树冠可配置为单向平台。悬挂装饰保留顶壁朝向，植物依生长环境和种子变化。', 'Decoration generally does not block; tree canopies can provide one-way platforms. Hanging decoration keeps its ceiling orientation; plants vary with habitat and seed.')],
    [t('液体', 'Liquids'), t('湖泊、水池与冷却液', 'Lakes, pools and coolant'), t('由液体规则处理水面与水下交互，不按实心砖处理。', 'Liquid rules govern surface and underwater interactions, rather than solid-tile collision.')],
    [t('角色与交互对象', 'Characters & interactables'), t('主角、伙伴、守卫、首领与机器人', 'Protagonist, companions, guards, bosses and robots'), t('各自使用移动、战斗或交互范围，不能由画面外轮廓直接判断。', 'Each uses movement, combat or interaction bounds that differ from its visible silhouette.')],
    [t('光照、天气与特效', 'Lighting, weather & effects'), t('昼夜、风、雨雪、粒子、光晕与前景遮挡', 'Day and night, wind, precipitation, particles, glow and foreground occlusion'), t('表现层不会因为遮住人物就新增碰撞；玩法影响需由对应系统明确规定。', 'Visual occlusion does not create collision. Gameplay effects require explicit rules in the relevant system.')],
  ];
  const buildings = [
    [t('实心建筑格', 'Solid building tile'), t('宽 1 × 高 1 格；标准厚 0.9，齐地形变体厚 1.5', 'Width 1 × height 1 tile; standard depth 0.9, terrain-aligned variant 1.5'), t('单格、连续三格、墙地转角与齐地形全深度单格。暖白封板与钴蓝包边，外露侧面和底部封闭。', 'Single tile, three-tile row, wall-floor corner and terrain-aligned full-depth tile. Warm ivory panels and cobalt trim enclose exposed sides and the bottom.')],
    [t('背景墙格', 'Background wall panel'), t('宽 1 × 高 1 格；厚 0.14', 'Width 1 × height 1 tile; depth 0.14'), t('单格、墙板拼接。薄墙用于人物后方背景层；最终世界 Z 位置待统一，与实心建筑格分层。', 'Single and joined panels. Thin walls are intended for a background layer behind the character; their final world Z placement is not yet unified.')],
    [t('能量门', 'Energy door'), t('沿 X 厚 0.14 格；高 3；Z 跨度 1.4', 'X thickness 0.14; height 3; Z span 1.4'), t('关闭、开启两种预览。门框常驻；开启只关闭能量屏障，门洞沿横版左右方向通行。', 'Closed and open previews. The frame remains in place; opening only hides the energy barrier, leaving a passage along the horizontal gameplay axis.')],
    [t('一体门楣组件', 'Door with integrated lintel'), t('沿 X 厚 0.14；门高 3 + 门楣 1 = 总高 4；Z 跨度 1.5', 'X thickness 0.14; door 3 + lintel 1 = total height 4; Z span 1.5'), t('门与上方补格为同一个薄组件，安装在房间右侧外沿，前后沿齐地板。门楣常驻；开闭仅控制下方屏障，净高仍约2.64格。', 'The door and upper infill form one thin component at the room’s right outer edge, aligned with the floor front and back. The lintel remains when the barrier opens; clear height is still about 2.64 tiles.')],
    [t('太阳能板', 'Solar panel'), t('宽 1 × 高 0.5 × 深 1 格', 'Width 1 × height 0.5 × depth 1 tile'), t('整板左右倾转；踩踏受力，离开后渐进恢复朝向太阳。占位包含面板、转轴、底座及倾转范围，支撑砖独立。', 'The whole panel tilts left or right under the player, then gradually returns toward the sun. Its envelope includes the panel, pivot, base and tilt; the support tile is separate.')],
  ];
  return `
    <header class="concepts-heading">
      <h1>${t('基础概念定义', 'Basic concepts')}</h1>
      <details class="concepts-reading-guide"><summary>${t('阅读与复制说明', 'Reading & copying')}</summary>
        <p>${t('集中整理世界、角色、场景构件与系统设定。基础定义配合原图阅读，经济与生存系统保留完整设计文档，并注明当前概念版与草案的区别。', 'Reference for the world, characters, scenery and game systems, with original artwork and the full economy document. Current behavior and draft plans are identified separately.')}</p>
      </details>
    </header>
    <div class="help-layout">
      <nav class="help-index" aria-label="${t('基础概念目录', 'Basic concepts contents')}">
        <p>${t('概念目录', 'CONCEPT DIRECTORY')}</p>
        <details class="concepts-nav-group"><summary>${t('基础设定', 'Basic definitions')}</summary>
          <a href="#concept-overview">01 <span>${t('设定总览', 'Overview')}</span></a>
          <a href="#concept-scale">02 <span>${t('统一尺度图', 'Scale reference')}</span></a>
          <a href="#concept-character">03 <span>${t('主角与伙伴', 'Cast & proportions')}</span></a>
          <a href="#concept-scene">04 <span>${t('场景组成', 'Scene composition')}</span></a>
          <a href="#concept-tiles">05 <span>${t('地形瓦片与组合', 'Terrain tiles & combinations')}</span></a>
          <a href="#concept-building">06 <span>${t('建筑构件', 'Building components')}</span></a>
          <a href="#concept-regions">07 <span>${t('世界区域', 'World regions')}</span></a>
          <a href="#concept-sources">08 <span>${t('原图与资料来源', 'Artwork & sources')}</span></a>
        </details>
        <details class="concepts-nav-group" open><summary>${t('场景分层', 'Scene depth layers')}</summary>
          <a href="#scene-depth-layers">01 <span>${t('背景、远景与近景', 'Background, distance and near scenery')}</span></a>
          <a href="#scene-depth-valley">02 <span>${t('山谷阶地', 'Valley terraces')}</span></a>
          <a href="#scene-depth-buildings">03 <span>${t('错落建筑', 'Staggered buildings')}</span></a>
          <a href="#scene-depth-cave">04 <span>${t('洞穴层叠', 'Layered cave')}</span></a>
          <a href="#scene-depth-sky">05 <span>${t('天空：云、日月与星星', 'Sky: clouds, sun, moon and stars')}</span></a>
        </details>
        <details class="concepts-nav-group" open><summary>${t('液体定义', 'Liquid definitions')}</summary>
          <a href="#concept-liquids">01 <span>${t('水体空间与透视', 'Water volume and perspective')}</span></a>
          <a href="#liquid-flow">02 <span>${t('流动规则（定稿）', 'Final flow rules')}</span></a>
        </details>
<details class="concepts-nav-group" open><summary>${t("建筑定义 · 六类", "Building definitions · six topics")}</summary><a href="#building-depth">01 <span>${t("深度划分", "Depth layers")}</span></a><a href="#building-walls">↳ <span>${t("墙体形态与窗口", "Wall shapes and windows")}</span></a><a href="#wall-window-assembly">↳ <span>${t("墙窗装配透视", "Wall and window assembly")}</span></a><a href="#wall-window-catalog">↳ <span>${t("墙窗全形态集合", "Wall and window catalog")}</span></a><a href="#building-shapes">02 <span>${t("格子形态", "Tile shapes")}</span></a><a href="#building-shapes-low">↳ <span>${t("3 不重要 · 参考形态", "3 Low-priority references")}</span></a><a href="#building-shape-spec">↳ <span>${t("形态定义文档", "Shape specification")}</span></a><a href="#building-joins">03 <span>${t("格子互相结合方式", "Tile connections")}</span></a><a href="#building-platforms">↳ <span>${t("跳跃平台", "Jump-through platforms")}</span></a><a href="#platform-mounts">↳ <span>${t("平台高度与深度", "Platform alignment and depth")}</span></a><a href="#building-house">04 <span>${t("房子", "Room definition")}</span></a><a href="#building-house-two-storey">↳ <span>${t("两层房子", "Two-storey room")}</span></a><a href="#building-house-half-two-storey">↳ <span>${t("两层半砖房", "Two-storey half-brick room")}</span></a><a href="#building-floor-combinations">↳ <span>${t("半砖层间组合", "Half-brick floor combinations")}</span></a><a href="#building-door">05 <span>${t("门", "Door definition")}</span></a><a href="#building-furniture">06 <span>${t("建筑物与家具定义", "Buildings and furniture")}</span></a><a href="#furniture-spatial-cases">↳ <span>${t("家具与人物 · 六种摆法", "Furniture · six placements")}</span></a><a href="#furniture-catalog">↳ <span>${t("当前家具清单与透视", "Furniture list and perspectives")}</span></a><a href="#solar-grid-and-load">↳ <span>${t("半格太阳能板 · 踩踏与追光", "Half-height solar · Load and tracking")}</span></a><a href="#liquid-display">↳ <span>${t("液体展示", "Liquid display")}</span></a><a href="#building-legacy">↳ <span>${t("旧实现与历史图", "Legacy reference")}</span></a></details>
        <details class="concepts-nav-group" open><summary>${t('植物', 'Plants')}</summary>
          <a href="#natural-space">01 <span>${t('空间透视与青苔附着', 'Spatial perspectives & moss')}</span></a>
          <a href="#natural-grass">02 <span>${t('整格草地 · 状态透视', 'Full-tile grass · growth states')}</span></a>
          <a href="#natural-flower">03 <span>${t('花卉与草本 · 状态透视', 'Flowers & herbs · growth states')}</span></a>
          <a href="#natural-shrub">04 <span>${t('灌木与野果丛 · 状态透视', 'Shrubs & berries · growth states')}</span></a>
          <a href="#natural-bonsai">05 <span>${t('盆景与盆栽 · 状态透视', 'Bonsai & potted plants · growth states')}</span></a>
          <a href="#natural-tree">06 <span>${t('树木 · 状态透视', 'Trees · growth states')}</span></a>
          <a href="#natural-vine">07 <span>${t('藤蔓与贴面植物 · 12种形态', 'Vines & surface plants · 12 forms')}</span></a>
          <a href="#natural-drooping">08 <span>${t('下垂植物 · 形态与状态', 'Drooping plants · forms and states')}</span></a>
        </details>
        <details class="concepts-nav-group" open><summary>${t('岩土与矿产', 'Terrain & minerals')}</summary>
          <a href="#natural-rock">01 <span>${t('泥土、空岛底岩与含矿岩层', 'Soil, island bedrock & ore-bearing rock')}</span></a>
          <a href="#natural-ore">02 <span>${t('矿脉 · 开采透视', 'Ore veins · mining states')}</span></a>
          <a href="#natural-resources">↳ <span>${t('自然资源共同定义', 'Shared natural-resource reference')}</span></a>
        </details>
        <details class="concepts-nav-group" open><summary>${t('系统设定', 'Game systems')}</summary>
          <a href="#concept-economy">↳ <span>${t('经济与生存系统', 'Economy & survival')}</span></a>
          ${systemChapters.map((title, index) => `<a href="#system-${index}">${String(index).padStart(2, '0')} <span>${title}</span></a>`).join('')}
        </details>
      </nav>
      <div class="help-content">
        <section id="concept-overview" class="help-block">
          <p class="home-eyebrow">01 / WORLD & SCOPE</p><h2>${t('世界设定与适用范围', 'World and scope')}</h2>
          <p>${t('《鹈鹕 429》从一场 AGI 降智风暴出发，探索算力、自然遗迹和巨大机房交织的世界。横版移动与瓦片规则构成玩法空间，远景、光照和立体构件建立画面的纵深。', 'Pelican 429 begins with an AGI storm and explores a world of compute, natural ruins and vast server halls. Side-scrolling movement and tile rules define gameplay space; scenery, light and dimensional components add depth.')}</p>
          <dl class="concepts-definitions">
            <div><dt>${t('主线试玩', 'Playable story')}</dt><dd><strong>${t('序章 → 山体堡垒', 'Prelude → mountain fortress')}</strong><p>${t('鹈鹕与人形 Grassy 两种形态，包含守卫及 Tibo、Sam 首领战。击败 Tibo 后解锁变身；算力大教堂和光纤深渊另有自由探索入口。', 'Pelican and human Grassy forms, guards, and boss fights against Tibo and Sam. Defeating Tibo unlocks transformation; the cathedral and abyss have separate exploration entries.')}</p></dd></div>
            <div><dt>${t('家园概念版', 'Homestead concept')}</dt><dd><strong>${t('人形探索 · 机器人生产 · 电力与算力', 'Human exploration · robot labour · power and compute')}</strong><p>${t('按经济草案试验另一套玩法：玩家操作人形，鹈鹕留守基地；Tibo 担任初始化与结算向导，光子作为随身伙伴。它与主线试玩分别说明，不能把两者的角色职责和解锁规则直接混用。', 'An economy prototype with a human player and Pelican staying at base. Tibo handles initialization and settlement; Photon accompanies the player. Its roles and unlock rules are distinct from those in the playable story.')}</p></dd></div>
          </dl>
          <p class="concepts-note">${t('阅读约定：下文“当前概念版”表示现行配置；系统原文中的示例、后续方向和“待选”仍是草案。页面整理已有资料，不把规划自动视为已实现功能。', 'Reading guide: “current concept version” refers to the current configuration. Examples, future directions and open decisions in the source document remain draft material, rather than automatically representing implemented features.')}</p>
          <a class="help-text-link" href="#concept-economy">${t('阅读完整经济与生存系统', 'Read the full economy and survival design')} →</a>
        </section>
        <section id="concept-scale" class="help-block">
          <p class="home-eyebrow">02 / SCALE REFERENCE</p><h2>${t('人物与场景，共用一把尺', 'One scale for character and scenery')}</h2>
          <p>${t('标尺和模块由本地 Python 绘制，主角使用正面与右侧原图。图中 1 格 = 240 像素，这是制图尺度，不是游戏固定屏幕像素。', 'Rulers and modules were drawn locally with Python and combined with the original front and right-side artwork. One tile is 240 pixels in this illustration, not a fixed screen size in the game.')}</p>
          <figure class="concepts-figure">
            <a href="./concepts/character-tile-scale.png" target="_blank" rel="noopener"><img src="./concepts/character-tile-scale.png" width="2560" height="1600" alt="${t('主角正侧原图、世界格标尺、3.3 头身参照尺及背景墙和砖块的统一尺度图', 'Front and side artwork with world-tile rulers, a 3.3-head reference ruler, background wall and terrain modules')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/character-tile-scale.png" target="_blank" rel="noopener">${t('打开完整尺寸图', 'Open full-size reference')} ↗</a></figcaption>
          </figure>
        </section>
        <section id="concept-character" class="help-block">
          <p class="home-eyebrow">03 / CHARACTERS</p><h2>${t('主角、伙伴与人物比例', 'Protagonist, companions and proportions')}</h2>
          <dl class="concepts-definitions">${dimensions.map(([label, value, description]) => `<div><dt>${label}</dt><dd><strong>${value}</strong><p>${description}</p></dd></div>`).join('')}</dl>
          <p class="concepts-note">${t('3.3 头身尺是设计参照，不表示原图已按头顶、下颌等地标完成精确校准。正侧原图只裁除留白并等比缩放，没有单独拉伸头、身体或腿。', 'The 3.3-head ruler is a design reference, not evidence of exact landmark calibration of the artwork. The front and side images were cropped and scaled uniformly, without separately stretching the head, body or legs.')}</p>
          <p>${t('Grassy 是人形主角；本页以 D1 无装备正侧原图讨论外观尺度。鹈鹕是主线中的另一可操作形态。光子在家园中承载基础算力、跟随并中继大招充能，完整独立伙伴剧情属于后续方向。工具机器人负责采集、搬运和建造，玩家负责探索与清场。', 'Grassy is the human protagonist; this page uses the unequipped D1 front and side artwork for visual scale. Pelican is the other playable story form. In homestead, Photon carries base compute, follows the player and relays ultimate charging; a full independent companion narrative is a future direction. Tool robots collect, transport and build, while the player explores and clears threats.')}</p>
        </section>
        <section id="concept-scene" class="help-block">
          <p class="home-eyebrow">04 / SCENE COMPOSITION</p><h2>${t('场景由哪些部分组成', 'What makes up a scene')}</h2>
          <p class="concepts-note">${t('二维玩法，三维场景：X 是左右移动，Y 是高度与跳跃，Z 是画面的前后纵深。移动、占格与碰撞使用 XY 规则平面；三维模型、地表厚度、植物、光影和透视构成场景表现。玩法平面按 Z=0 对照，不能把 Z 纵深画成可自由走动的第三条移动轴。', '2D gameplay in a 3D scene: X is horizontal movement, Y is height and jumping, and Z is visual depth. Movement, tile occupancy and collision use XY rules, while models, terrain depth, vegetation, lighting and perspective create the scene. Z=0 is the reference gameplay plane, not an extra freely traversable axis.')}</p>
          <p><a class="help-text-link" href="#natural-resources">${t('查看新增植物、生长物与矿脉定义及透视图', 'View new plant, growth and ore definitions with perspectives')} →</a></p>
          <h3>${t('现有游戏的植物与远景：实现坐标参考', 'Existing game vegetation and backgrounds: runtime coordinates')}</h3>
          <p>本段记录现行游戏从+Z观察的坐标；植物大类的新透视图采用前方为−Z的制图坐标，尚未统一。新方案的尺寸与摆放见<a href="#natural-space">植物空间定义</a>，两套数值不可直接混用。</p>
          <figure class="concepts-figure">
            <a href="./concepts/plants-distant-perspective.png" target="_blank" rel="noopener"><img src="./concepts/plants-distant-perspective.png" width="2400" height="2200" loading="lazy" alt="${t('植物与远景深度校准图：地形、洞壁、植物共用 Z 标尺；正面植物轮廓；按距离30的真实镜头计算砖前后投影比约1.051；远景按独立层序说明，不代表城市物理距离', 'Calibrated scene depth: terrain, cave wall and vegetation share a Z ruler; frontal plant silhouettes; actual camera projection gives a front/back tile size ratio of about 1.051; background layer order does not represent physical city distances')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/plants-distant-perspective.png" target="_blank" rel="noopener">${t('打开植物与远景透视概念图', 'Open the vegetation and background perspective guide')} ↗</a></figcaption>
          </figure>
          <p>${t('当前游戏使用透视相机：默认视角 30°、距离 30 格，从 +Z 平视 Z=0；不是固定俯视或 45° 斜视。同尺寸的独立几何体会近大远小，纵深边随投影收敛，但玩法格子的世界尺寸不变。新版图按正面镜头计算投影：自然砖前后截面的投影尺寸比约为 1.051，露出多少顶面和侧面取决于它相对画面中心的位置。侧剖面使用统一 Z 标尺，远景另按层序说明。', 'The game uses a perspective camera: default FOV 30° and distance 30 tiles, looking straight from +Z toward Z=0. It is not a fixed overhead or 45-degree view. Equal-size geometry appears smaller at greater distance, while gameplay tile sizes remain constant. The revised guide uses the frontal camera projection: the natural tile front/back size ratio is about 1.051, and visible top and side faces depend on position relative to the image center. Cross-sections share one Z ruler; distant backgrounds use a separate layer-order diagram.')}</p>
          <p>${t('普通花草的生成位置在 Z=−0.85～+0.2 内分前、中、后带；树中心 Z=−0.7，最前沿不超过 −0.1。低矮地被有独立范围 −0.83～+0.4，不能把所有植物都归为同一张平面。植物依地表高度和坡面落脚；树木外形、枝叶遮挡与可站立的树冠平台分别处理。', 'Ordinary flora is positioned within Z=−0.85 to +0.2 in depth bands. Trees are centered at Z=−0.7 and their frontmost extent is at most −0.1. Low ground cover uses a separate −0.83 to +0.4 range. Plants follow terrain height and slopes; tree appearance, foliage occlusion and standable crown platforms are separate concerns.')}</p>
          <p>${t('远景有两种现行做法：普通自由世界使用 Z=−121 的背景画幅，随视口缩放覆盖并轻微偏移；要塞城市使用天空、远城、中景城区、近屋顶四层平片，Z 依次为 −120／−92／−60／−28，视差系数为 0／0.06／0.32／0.9。系数用于镜头构图，不能直接当作世界移动速度倍率；画幅会适配尺寸，远景中的城市并非全部独立三维建筑。', 'Ordinary free-world scenery uses a background image at Z=−121, resized to cover the viewport with small offsets. Fortress scenery uses four planes: sky, far city, middle district and near rooftops at Z=−120/−92/−60/−28, with parallax coefficients 0/0.06/0.32/0.9. These are framing coefficients, not direct world-speed multipliers; background images are resized and do not imply every depicted building is independent 3D geometry.')}</p>
          <dl class="concepts-definitions">${sceneParts.map(([label, value, description]) => `<div><dt>${label}</dt><dd><strong>${value}</strong><p>${description}</p></dd></div>`).join('')}</dl>
        </section>
        <section id="scene-depth-layers" class="help-block">
          <p class="home-eyebrow">SCENE / DEPTH LAYERS</p><h2>${t('背景、远景与近景', 'Background, distance and near scenery')}</h2>
          <p>${t('最新定义：角色后方至少两层背景格子，远景再分多层；以下三种组合各用三层远景示范。近景可以直接由格子构成，靠格缝、厚度和遮挡建立空间，不必另外添加一套装饰。', 'Latest definition: at least two background tile layers behind the character, followed by multiple distant layers. The three examples below each use three distant layers. Near scenery can consist of tiles whose seams, thickness and occlusion establish depth without a separate decoration system.')}</p>
          <p>${t('从镜头向远处：可选前景格子 → 角色与可玩格子 → 背景格子第一层 → 背景格子第二层 → 远景第一、第二、第三层 → 天空。前景格子不计入两层背景格子；两层背景格子通过错位、门窗或缺口露出后方空间，远景以轮廓错开和对比逐层降低表现距离。', 'From camera to horizon: optional foreground tiles → character and playable tiles → first background tile layer → second background tile layer → three distant layers → sky. Foreground tiles do not count toward the two background tile layers. Staggered walls, windows and gaps reveal space behind them, while offset silhouettes and progressively lower contrast convey distance.')}</p>
          <p class="concepts-note">${t('背景墙厚 0.2 是局部建筑构件的厚度，不是全部景别的总厚度，也不能把两层背景格子挤进同一墙体预留区。以下图片用于定义构图与层序，人物尺寸、层间距离和动态视差仍待校准；当前游戏实现不因此自动变更。', 'A background wall thickness of 0.2 describes a local building component, not the total depth of all scenery layers. Two background tile layers must not be compressed into the same wall reserve. These images define composition and layer order; character scale, layer spacing and dynamic parallax still need calibration. They do not change the current game implementation.')}</p>
          <a class="help-text-link" href="./concepts/depth-definitions.md" download>${t('下载完整深度与场景分层定义（Markdown）', 'Download the full depth and scene-layer definition (Markdown)')}</a>
          <p><a class="help-text-link" href="./?mode=resources&scene=depth">${t('进入场景分层演示：操控玩家查看山谷、建筑、洞穴与日夜天空', 'Enter the playable depth demo: explore valleys, buildings, caves and day/night skies')} →</a></p>
          <h3 id="scene-depth-valley">${t('山谷阶地 · 两层背景格子与三层远景', 'Valley terraces · two background tile layers and three distant layers')}</h3>
          <figure class="concepts-figure">
            <a href="./concepts/scene-depth-valley-perspective.png" target="_blank" rel="noopener"><img src="./concepts/scene-depth-valley-perspective.png" width="1536" height="1024" loading="lazy" alt="${t('山谷阶地合成透视与分层展开：角色后方两排岩石格子前后错开，再依次露出林地山坡、山谷山体与远山。', 'Composed and exploded valley perspective: two staggered rock-tile layers behind the character reveal wooded slopes, valley mountains and distant peaks.')}" /></a>
            <figcaption>${t('两排阶地留出视线通道，让后排格子和三层远景连续可见。点击查看完整透视图。', 'Gaps between the terraces keep the rear tiles and three distant layers visible. Click to open the full perspective.')}</figcaption>
          </figure>
          <h3 id="scene-depth-buildings">${t('错落建筑 · 穿过门窗看见后层', 'Staggered buildings · depth through windows and doorways')}</h3>
          <figure class="concepts-figure">
            <a href="./concepts/scene-depth-buildings-perspective.png" target="_blank" rel="noopener"><img src="./concepts/scene-depth-buildings-perspective.png" width="1536" height="1024" loading="lazy" alt="${t('错落建筑合成透视与分层展开：前排断墙拱门和后排建筑构成两层背景格子，之后是屋顶树木、远处城镇和山脉。', 'Composed and exploded building perspective: broken walls and arches precede a second background tile layer of buildings, followed by rooftops and trees, a distant town and mountains.')}" /></a>
            <figcaption>${t('前排开口与后排建筑错位，门窗后仍有可见的纵深。点击查看完整透视图。', 'Openings are offset from the rear buildings so depth remains visible through doors and windows. Click to open the full perspective.')}</figcaption>
          </figure>
          <h3 id="scene-depth-cave">${t('洞穴层叠 · 两道洞壁与深处洞厅', 'Layered cave · two cave walls and deeper chambers')}</h3>
          <figure class="concepts-figure">
            <a href="./concepts/scene-depth-cave-perspective.png" target="_blank" rel="noopener"><img src="./concepts/scene-depth-cave-perspective.png" width="1536" height="1024" loading="lazy" alt="${t('洞穴合成透视与分层展开：两道格子洞壁的开口前后错开，深处依次是岩柱群、岩桥洞拱和洞厅。', 'Composed and exploded cave perspective: staggered openings in two tile-wall layers reveal rock pillars, bridges and arches, then a deeper chamber.')}" /></a>
            <figcaption>${t('洞壁不能封死全部后景，开口后保留岩柱、洞拱与洞厅的层层遮挡。点击查看完整透视图。', 'The cave walls leave openings that reveal successive pillars, arches and chambers. Click to open the full perspective.')}</figcaption>
          </figure>
          <h3 id="scene-depth-sky">${t('天空：云、日月与星星', 'Sky: clouds, sun, moon and stars')}</h3>
          <p>${t('天空拆成底色、星星、太阳／月亮、远云和近云，分别控制可见性与遮挡。云可以遮住日月和星星，山体可以遮住低处天空；近云与远云通过错位和不同层次形成空间，不能把全部天空元素烘成同一张底图。', 'Separate the sky into its base color, stars, sun/moon, far clouds and near clouds, with independent visibility and occlusion. Clouds can cover celestial bodies, and mountains can hide the lower sky. Offset near and far clouds establish depth; the sky elements should not all be baked into one backdrop.')}</p>
          <figure class="concepts-figure">
            <a href="./concepts/scene-depth-sky-perspective.png" target="_blank" rel="noopener"><img src="./concepts/scene-depth-sky-perspective.png" width="1536" height="1024" loading="lazy" alt="${t('天空分层透视：云、太阳、月亮和星星配合天空底色，展示日间与夜间组合，以及近云、远云、天体和远山之间的遮挡关系。', 'Sky-layer perspective: clouds, sun, moon and stars over a sky base, with day and night combinations showing occlusion among near clouds, far clouds, celestial bodies and distant mountains.')}" /></a>
            <figcaption>${t('日间与夜间只是两种组合示例，不排除白天出现月亮；天体层序表示画面遮挡，不代表真实天文距离。点击查看完整透视图。', 'Day and night are example combinations; the moon may also appear during daytime. Celestial layer order describes visual occlusion, not astronomical distance. Click to open the full perspective.')}</figcaption>
          </figure>
          <p class="concepts-note">${t('昼夜周期、日月轨迹、星星亮度变化、云移动速度及各层视差尚未定稿，本轮只补齐概念与图片入口。', 'Day/night timing, sun and moon paths, star brightness changes, cloud speeds and layer parallax remain undefined. This update provides the concept definitions and image entries.')}</p>
        </section>
        <section id="concept-liquids" class="help-block">
          <p class="home-eyebrow">LIQUID / WATER</p><h2>${t('液体定义与水体透视', 'Liquid definition and water perspective')}</h2>
          <p class="concepts-note">${t('程序已有水。本节补齐定义资料，不修改模拟与渲染；中间深1格属于新版设计，现行程序尺寸另列。湖泊、水池、积水和下落水流是同一种水的不同状态。', 'Water already exists in the game. This section adds design documentation without changing simulation or rendering. The central one-tile depth is a new design; current runtime dimensions are listed separately. Lakes, pools, puddles and falling streams are states of the same water.')}</p>
          <a class="help-text-link" href="./concepts/liquid-definitions.md" download>${t('下载完整液体定义（Markdown）', 'Download the full liquid definition (Markdown)')}</a>
          <figure class="concepts-figure">
            <a href="./concepts/liquid-perspective.png" target="_blank" rel="noopener"><img src="./concepts/liquid-perspective.png" width="2400" height="2200" loading="lazy" alt="${t('液体定义图：整砖水池剖切透视、XY水量正视、等比例YZ深度剖面。新版水体深1，预留区不注满；现行程序深度单列。', 'Liquid guide: a cutaway pool, an XY water-amount diagram, and an equal-scale YZ section. The new water depth is one tile with empty reserve zones; current runtime depths are listed separately.')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/liquid-perspective.png" target="_blank" rel="noopener">${t('打开液体定义与透视完整图', 'Open the full liquid perspective guide')} ↗</a></figcaption>
          </figure>
          <h3>${t('1. 占格、水位与深度', '1. Cells, water level and depth')}</h3>
          <p>${t('液体与地形分层存储：每个1×1逻辑格的水量q为整数0～255，0无水、255满格。部分水格自底向上占高q/255，水面Y=j+q/255；q=128约为半格。水面降低不改变Z深度。相邻连通格组成连续水体，内部不画玻璃盒接缝。波纹、平滑和最薄0.04格水膜仅为显示，不增加水量。', 'Liquid is stored separately from terrain. Each 1×1 cell contains an integer amount q from 0 to 255: empty to full. Partial cells fill upward by q/255, with surface Y=j+q/255; q=128 is approximately half full. Lower water levels do not reduce Z depth. Connected cells form one body without internal box seams. Waves, smoothing and the minimum 0.04-tile visual film do not add water mass.')}</p>
          <p>${t('新版沿用建筑深度：水占中间Z=[−0.5,+0.5]，深1；人物平面Z=0。内沿[−1,−0.5]、外延[+0.5,+1]各额外0.5，不默认注满。墙厚0.2在外延区内，图中[+0.5,+0.7]仅为示例。水面是XZ顶面，水下截面是XY面；主图从内沿斜上方观察，水池宽4、水深1.5只是布局示例。', 'The new design follows the building depth contract: water occupies Z=[−0.5,+0.5], one tile deep, with the character plane at Z=0. The inner [−1,−0.5] and outer [+0.5,+1] reserves each add 0.5 and are not filled by default. A 0.2-thick wall sits in the outer reserve; [+0.5,+0.7] is illustrative. The surface lies in XZ and the submerged section in XY. The inspection view looks down from the inner side; the four-tile pool width and 1.5-tile water height are layout examples.')}</p>
          <h3>${t('2. 与地形和构件的关系', '2. Terrain and component interactions')}</h3>
          <div class="concepts-table-scroll"><table><thead><tr><th>${t('对象', 'Object')}</th><th>${t('当前规则与限制', 'Current rules and limits')}</th></tr></thead><tbody>
            <tr><td>${t('整砖池底、岸壁', 'Solid bed and banks')}</td><td>${t('实心格挡水；开口后水可流向新空格。剖切正面不是额外玻璃墙。', 'Solid cells block water; openings let it enter new empty cells. The cutaway front is not a glass wall.')}</td></tr>
            <tr><td>${t('半砖、斜坡', 'Half tiles and slopes')}</td><td>${t('仍按整格挡水，格内空余形状不能储水；视觉补缝不等于容量模拟。', 'Their entire cells block water. Empty portions cannot store water; visual gap filling is not shape-aware capacity.')}</td></tr>
            <tr><td>${t('单向平台', 'One-way platforms')}</td><td>${t('不挡水、可与水共格；可落脚不等于能当池底。', 'Water passes through and may share the cell. A standable platform is not a watertight bed.')}</td></tr>
            <tr><td>${t('背景墙、窗、门', 'Background walls, windows and doors')}</td><td>${t('背景构件不作XY挡水边界；当前门没有闸门联动。', 'Background pieces do not block XY flow. Doors currently have no floodgate integration.')}</td></tr>
            <tr><td>${t('水中放实心格', 'Placing solid terrain in water')}</td><td>${t('清除该格水量并计入lostMass，不自动向邻格排水。', 'Clears the cell water into lostMass; it does not displace water into neighbors.')}</td></tr>
          </tbody></table></div>
          <h3 id="liquid-flow">${t('3. 流动规则（定稿）', '3. Final flow rules')}</h3>
          <p class="concepts-note">${t('采用现有二维格子重力流：先下落，再沿可通行的同行铺开、找平，遇到台边向低处泄流。没有向上水压流，也不计算Z方向流动。以下确定行为与验收结果，本次不重写模拟。', 'Use the existing 2D gravity-driven grid flow: fall first, spread and balance along passable rows, then spill down ledges. There is no upward pressure flow or Z-axis flow. These rules define behavior and acceptance criteria; the simulation is unchanged.')}</p>
          <div class="concepts-table-scroll"><table><thead><tr><th>${t('规则', 'Rule')}</th><th>${t('确定行为', 'Defined behavior')}</th></tr></thead><tbody>
            <tr><td>${t('下落优先', 'Fall first')}</td><td>${t('下格非实心且未满255，先转移min(本格水量, 下格剩余容量)；下格满后，多余水留在上格继续侧流。单向平台不挡水。', 'If the cell below is non-solid and below 255, transfer the smaller of the source amount and remaining capacity first. Any surplus stays above for lateral flow. One-way platforms do not block water.')}</td></tr>
            <tr><td>${t('横向找平', 'Lateral balancing')}</td><td>${t('下方实心、下方满水或地图底行视为有支撑。有支撑的连续水段向相邻干格铺开并均分，稳定后段内最多差1单位；实心格截断水段。悬空水也可向较少水的同高邻格散开后继续下落。', 'Solid ground, a full cell below, or the map bottom provides support. Supported continuous segments spread into adjacent dry supported cells and balance to within one unit. Solids interrupt segments. Suspended water can also spread to less-filled same-height neighbors before falling further.')}</td></tr>
            <tr><td>${t('台边与越岸', 'Ledges and overflow')}</td><td>${t('台边外侧非实心、其下方有容量时向低处泄流；两侧都能泄流。水不爬墙，只有上层已有来水进入岸顶上方空格才可越岸。停水后只流出现有水，不形成无限瀑布。', 'Water spills where the neighboring ledge cell is non-solid and there is capacity below it; both ends may drain. Water does not climb walls. Overflow requires incoming water already in passable cells above the bank. After inflow stops, only existing water can drain; waterfalls are finite.')}</td></tr>
            <tr><td>${t('薄膜与静止', 'Films and rest')}</td><td>${t('沿用侧流阈值4、残余目标3单位/格，台面允许留薄膜。少于4不等于冻结：仍可下落或参与同行均衡。静止后停止搬运，邻水或地形变化后再计算；波纹不搬运水量。', 'Keep the lateral threshold of 4 and residual target of 3 units per cell. Thin films may remain. Amounts below 4 can still fall or participate in row balancing. Stable water stops transferring until neighboring water or terrain changes; ripples transfer no mass.')}</td></tr>
            <tr><td>${t('连通边界', 'Connectivity and boundaries')}</td><td>${t('地图四边封闭，不自动排水；不穿实心格或实心角。找平仅针对可沿同行流通的水段，不保证不同池子同水位，也不提供U形连通管的向上水压回流。', 'All map boundaries are closed. Water cannot pass through solid cells or corners. Balancing applies to passable same-row segments, not separate pools, and provides no upward pressure equalization through U-shaped channels.')}</td></tr>
            <tr><td>${t('地形变化', 'Terrain changes')}</td><td>${t('挖开池底或岸壁仅新增通路、唤醒邻水，不增删水；放实心砖清掉原格水并记lostMass，不自动挤水。半砖和斜坡仍整格挡水，背景墙和当前门不作闸门。', 'Digging opens passages and wakes neighboring water without creating or removing water. Placing solids clears cell water into lostMass without displacement. Half tiles and slopes still block entire cells; background walls and current doors are not floodgates.')}</td></tr>
            <tr><td>${t('水量守恒', 'Mass conservation')}</td><td>${t('普通流动总量不变、每格0～255。加入量只计实际容纳的水；满格拒收的部分不算注入。放砖、主动清水和注水分别记账，不能靠找平复制或删除水。', 'Ordinary flow preserves total mass and keeps cells within 0–255. Only accepted water counts as inflow; rejected excess does not. Solid placement, explicit removal and injection are separate accounting events. Balancing never duplicates or deletes water.')}</td></tr>
            <tr><td>${t('推进节奏', 'Update timing')}</td><td>${t('沿用每2个模拟tick推进一次、每步最多8192个活跃格、支撑水段每侧每步最多扩展8个干格；超预算延后，不丢水。不承诺一帧找平或固定米/秒流速。', 'Keep one update per 2 simulation ticks, up to 8192 active cells per step, and expansion by up to 8 dry cells per side of a supported segment. Deferred work loses no water. There is no one-frame settling or fixed physical-speed guarantee.')}</td></tr>
          </tbody></table></div>
          <p>${t('验收例：单列竖井倒255水，最终井底仍255；封闭两格宽池底共255水，稳定为128与127；台边薄水能泄到低处、允许留薄膜；q=200的水格放砖后水归零、lostMass增加200；q=2下方有空格时仍能下落。相同初态、配置和操作时序产生相同结果，暂停模拟及现有战斗顿帧时停止水量推进。', 'Acceptance examples: 255 units in a sealed shaft end as 255 at the bottom; a sealed two-cell-wide basin holding 255 settles to 128 and 127; ledges drain while allowing thin residue; a solid placed in a q=200 cell clears it and adds 200 to lostMass; q=2 still falls into an empty cell below. Identical states, settings and timed operations yield identical results. Simulation pause and existing combat hitstop suspend water updates.')}</p>
          <p>${t('本版不增加蒸发、渗透、无限水源、雨水补给、虹吸、压力喷射、管道或水流推人。角色和小鱼不挤占液体容量；水花和风致波纹不自动注水。新增此类玩法时另行定义。', 'This version adds no evaporation, seepage, infinite sources, rain replenishment, siphons, pressure jets, pipes or current-driven character movement. Characters and fish displace no liquid capacity; splashes and wind ripples inject no water. Such mechanics require separate definitions.')}</p>
          <p>${t('角色继续按浸没程度游泳，水面不承托脚底，浮力与阻尼沿用现有控制器；人形氧气按鼻尖是否淹没判断。半透明水下截面需保持人物可读，实心岸壁遮住水，内部接缝不画成盒边。任意旋转镜头的透明遮挡仍需实际验收。', 'Characters continue swimming by submersion, with existing buoyancy and damping; the surface is not a floor. Human oxygen depends on nose submersion. Translucent sections must keep characters readable, banks occlude water, and connected water has no internal box edges. Arbitrary viewing angles still need visual acceptance.')}</p>
          <h3>${t('4. 现行尺寸与支持范围', '4. Runtime dimensions and scope')}</h3>
          <p>${t('当前游戏从+Z观察：自然砖Z=[−1,+0.5]、深1.5；水前面+0.42、背板−1，湖中水面后沿可到−1.3，靠岸渐收。池底向下延伸1格仅用于被地形遮住的补缝。这些世界坐标与上方建筑设计方向不同，本次未修改，也不能把视觉延伸算入水量或游泳深度。后续尺寸同步必须继续复用游戏的FluidMap、stepFluid、createWaterView与材质。', 'The current game camera looks from +Z: natural terrain spans Z=[−1,+0.5], depth 1.5. The water front is +0.42, the back is −1, and the central top can extend to −1.3, tapering near banks. A one-tile bed extension only covers terrain gaps. These world coordinates differ from the building design above and remain unchanged. Visual extensions add neither water mass nor swimming depth. Future dimension updates must reuse the game FluidMap, stepFluid, createWaterView and materials.')}</p>
          <p>${t('水色板只变外观。要塞冷却液已有独立危险区域伤害，但格子液体没有冷却液类型；本次不扩展熔岩、毒液、混合反应、压力或管道。完整资料：docs/liquid-definitions.md；实现依据：src/world/fluid-map.ts、fluid-sim.ts，src/physics/fluid-contact.ts，src/sim/player-breath.ts，src/render/water-view.ts。', 'Palettes change appearance only. Fortress coolant has separate hazard-region damage, but the liquid grid has no coolant type. Lava, poison, reactions, pressure and pipes are outside this scope. Full specification: docs/liquid-definitions.md. Implementation references: src/world/fluid-map.ts, fluid-sim.ts, src/physics/fluid-contact.ts, src/sim/player-breath.ts and src/render/water-view.ts.')}</p>
        </section>
        <section id="concept-tiles" class="help-block">
          <p class="home-eyebrow">05 / TERRAIN SHAPES & COMBINATIONS</p><h2>${t('地形瓦片与组合', 'Terrain tiles and combinations')}</h2>
          <p>${t('制作清单分成三层：4 种实心形状、独立的单向平台与背景墙、8 类可复用地形组合。每种材质都需要检查顶面、左右外露侧面、底面、转角和相邻格接缝；材质决定外观，形状决定碰撞轮廓。', 'The kit has three layers: four solid shapes, separate one-way platforms and background walls, and eight reusable terrain combinations. Check top surfaces, exposed left and right sides, undersides, corners and neighboring seams for each material. Materials define appearance; shapes define collision.')}</p>
          <figure class="concepts-figure">
            <a href="./concepts/terrain-tile-basics.png" target="_blank" rel="noopener"><img src="./concepts/terrain-tile-basics.png" width="2200" height="1920" loading="lazy" alt="${t('地形基础与拼接说明：整砖、下半砖、左低右高坡、左高右低坡；单向平台与背景墙；坡接平地、半格台阶和洞口外露边', 'Terrain shape guide: full and lower-half tiles, rising and falling slopes, one-way platforms, background walls, slope joins, half steps and exposed cave edges')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/terrain-tile-basics.png" target="_blank" rel="noopener">${t('打开基础形状与拼接说明图', 'Open the shape and joining guide')} ↗</a></figcaption>
          </figure>
          <h3>${t('基础形状与独立图层', 'Base shapes and separate layers')}</h3>
          <dl class="concepts-definitions">${layers.map(([label, value, description]) => `<div><dt>${label}</dt><dd><strong>${value}</strong><p>${description}</p></dd></div>`).join('')}</dl>
          <p>${t('远景背景位于更远处，负责天空、山体等空间层次。背景墙填充人物身后的房间或洞穴；实体地形构成脚下地面和可碰撞边界。图中的模块色块只说明尺寸，不是游戏材质截图。', 'Distant scenery provides sky, mountains and depth. Background walls fill rooms or caves behind the character; solid terrain forms the ground and collision boundaries. The colored modules illustrate dimensions, not in-game materials.')}</p>
          <h3>${t('需要覆盖的 8 类组合', 'Eight combinations to cover')}</h3>
          <p>${t('下图直接读取游戏的组合关卡格子：统一种子 429、草地材质、地表环境。8 个面板均为 24 × 20 格、每格 32 像素；橙虚线为基准地面，蓝色为液体，紫线为真实单向平台。它展示逻辑轮廓，不代表最终材质效果。', 'The diagram uses cells from the game’s terrain-composition levels: seed 429, grass material and surface environment. Every panel covers 24 × 20 tiles at 32 pixels per tile. Orange marks the ground baseline, blue marks liquid and purple marks actual one-way platforms. These are logical profiles, not final materials.')}</p>
          <figure class="concepts-figure">
            <a href="./concepts/terrain-combinations.png" target="_blank" rel="noopener"><img src="./concepts/terrain-combinations.png" width="2200" height="3530" loading="lazy" alt="${t('8 类实际地形组合的格子图：平缓草地、低矮土丘、下凹草沟、半格台阶、裂口崖台、洞口土台、树根坡地、浅水洼地，使用统一格子标尺', 'Eight actual terrain combinations on a shared grid: meadow, mound, gully, terraces, cleft, cave, roots and pond')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/terrain-combinations.png" target="_blank" rel="noopener">${t('打开 8 类组合完整说明图', 'Open the full eight-combination diagram')} ↗</a></figcaption>
          </figure>
          <dl class="concepts-definitions">${TERRAIN_COMPOSITIONS.map(({ id, label, description }) => `<div><dt>${en ? translateShowcaseText(label) : label}</dt><dd><strong>${id}</strong><p>${en ? translateShowcaseText(description) : description}</p></dd></div>`).join('')}</dl>
          <p class="concepts-note">${t('拼接要求：坡的低端接低地、高端接高地；台阶保留 0.5 格高差；崖台保留侧壁与沟底；洞口保留厚顶、承托壁和通行空间；树冠平台与树轮廓分开；洼地的实体盆底与液体分层。当前不增加上半砖或倒置坡砖。', 'Joining rules: match slope ends to the correct ground height; retain half-tile steps, cliff walls and gully floors; keep cave roofs, supports and clearance; separate tree platforms from tree silhouettes; separate pond terrain from liquid. Upper half tiles and inverted slopes are not added.')}</p>
          <a class="help-text-link" href="./?mode=lab">${t('打开场景功能展示，对照真实组合', 'Compare the actual combinations in the scene lab')} ↗</a>
        </section>
<section id="concept-building" class="help-block">
<h2>${t("建筑与格子定义 · 新规则", "Building and tile definitions · new rules")}</h2>
<p>${t("按2026-10-10讨论整理。已确认：中间实体深1、内外各额外预留0.5、墙在外延区且厚0.2、门组件占高4格（净洞与上框按门型分配）、床3×1与桌3×2为草案。下列六类均可单独复制给LLM。", "Discussion recorded 2026-10-10. Confirmed: central solid depth 1 with additional 0.5 reserves on either side; wall thickness 0.2 inside the outer reserve; door assembly height 4 with opening and frame proportions defined per type; bed 3×1 and table 3×2 are drafts. Each of the six definitions below has its own copy control.")}</p>
<p class="concepts-note">${t("新设计规则优先于旧示意图。现行代码未在本次修改；旧实现与旧图收在末尾折叠区。候选形态、家具草案和未定参数都保留状态标记。", "New design rules supersede older illustrations. Runtime code is unchanged; existing implementation and older diagrams are collapsed at the end. Proposed shapes, draft furniture and unspecified parameters remain labelled.")}</p>
</section>
<section id="building-depth" class="help-block">
<h2>${t("01 深度划分", "01 Depth layers")}</h2>
<p>${t("中间实体格深1，Z=[−0.5,+0.5]；内沿预留区为[−1,−0.5]，外延预留区为[+0.5,+1]，各额外留0.5格给花草和特殊物品。背景墙标准宽1×高1×厚0.2，XY完整覆盖一格、不缩边，位于外延预留区内，不嵌入实体砖，不再额外增加总深度。总空间带宽为2格。墙在外延区内的具体偏移未定，图中贴中间格外侧的放法仅为示意。","The central solid is 1 deep at Z=[\u22120.5,+0.5]. The inner reserve is [\u22121,\u22120.5] and the outer reserve [+0.5,+1], each adding 0.5 for plants and special objects. The standard background wall is 1 wide, 1 high and 0.2 thick, covering the complete XY cell without insets within the outer reserve, outside solid blocks. The complete spatial band is 2 deep. The wall offset inside the outer reserve is unspecified; its illustrated placement is an example.")}</p>
<ul><li>${t("内沿、外延是中间1格之外的额外预留区，不是把中间格分成两个0.5。预留空间不默认填满实体。", "The two reserve zones are additional to the central cell, not two halves of it. Reserve space is not filled solid by default.")}</li><li>${t("墙放外面，厚0.2；放弃0.1厚嵌入砖块的方案。墙与砖体不重叠，墙也不把空间总宽增加到2.2。", "The wall stays outside at thickness 0.2. The recessed 0.1 option is not adopted. Wall and solid do not overlap, and total depth does not become 2.2.")}</li><li>${t("人物平面Z=0只表示2D逻辑位置。背景墙宽高固定为1×1；图中镜头和外延区内偏移仅用于说明；物品尺寸与碰撞另外定义。", "Z=0 indicates the 2D character plane. The background wall has a fixed 1×1 footprint; camera and offset within the reserve are illustrative; object dimensions and collisions are defined separately.")}</li><li>${t("剖面采用YZ等比例方格：中间深1×高1是正方形，小方格0.1×0.1仅为标尺。透视图使用统一投影，整格墙与实体的XY截面尺寸相同，纵深边共用消失点。", "The YZ section uses equal units: depth 1 by height 1 is a square; 0.1 squares are ruler subdivisions only. Perspective uses one projection and shared depth vanishing point; wall and solid XY sections have equal dimensions.")}</li></ul>
<p><a class="help-text-link" href="./concepts/depth-definitions.md" download>${t("下载深度定义说明", "Download depth definitions")}</a></p>
<figure class="concepts-figure"><a href="./concepts/building-depth.png" target="_blank" rel="noopener"><img src="./concepts/building-depth.png" width="2400" height="2500" loading="lazy" alt="${t("深度剖面及线框透视：中间1格，内沿和外延各额外0.5，墙厚0.2在外延区内。", "Depth section and perspective wireframe: central 1, additional inner and outer reserves of 0.5 each, wall 0.2 thick in the outer reserve.")}" /></a><figcaption><a class="help-text-link" href="./concepts/building-depth.png" target="_blank" rel="noopener">${t("打开深度线框完整图", "Open full depth wireframe")} ↗</a></figcaption></figure>
</section>
<section id="building-walls" class="help-block">
<h2>${t("背景墙形态与窗口", "Background wall shapes and windows")}</h2>
<p>${t("基础形态：整墙、镂空、矩形窗（含四块拼窗）、四向45°斜墙和四块斜角窗。半墙、玻璃与窗棂选做；圆窗、拱窗与破损暂不重要。窗框边宽0.1及斜切0.5为草案，墙厚保持0.2。", "Core forms now include four-piece windows, four diagonal wall orientations and chamfered windows. Half walls, glass and bars are optional; curved shapes remain low priority. Frame width 0.1 and corner cut 0.5 are drafts; wall depth stays 0.2.")}</p>
<p><a href="./concepts/wall-window-definitions.md" download class="help-text-link">${t("下载墙体与窗口说明（Markdown）", "Download wall and window definitions (Markdown)")}</a></p>
<h3 id="wall-window-assembly">图1 · 装配演示</h3>
<p>看实际组合与深度：完整墙面、上下左右四向半墙、单格与拼接窗、斜角收边，以及同镜头透视线框。实体地台深1，墙深0.2，内外各预留0.5。</p>
<figure class="concepts-figure"><a href="./concepts/wall-window-assembly.png" target="_blank" rel="noopener"><img src="./concepts/wall-window-assembly.png" width="2600" height="3820" loading="lazy" alt="图1装配演示：紫色四向半墙、矩形窗、斜角窗和斜墙装配；附等比例深度校对及同镜头透视线框。" /></a><figcaption><a href="./concepts/wall-window-assembly.png" target="_blank" rel="noopener" class="help-text-link">打开图1 · 装配演示 ↗</a></figcaption></figure>
<h3 id="wall-window-catalog">图2 · 全形态集合</h3>
<p>查阅全部已定义形态与组合：25张形态、组合和附加外观卡，另有3张低优先级参考。四向半墙用紫色标识；每项标明必做、选做或不重要，列全不代表全部实现。</p>
<figure class="concepts-figure"><a href="./concepts/wall-window-catalog.png" target="_blank" rel="noopener"><img src="./concepts/wall-window-catalog.png" width="2600" height="2650" loading="lazy" alt="图2全形态集合：整墙、镂空、单格窗、拼窗、四向半墙、四向斜墙、斜角窗、玻璃窗棂及低优先级圆窗拱窗破损参考，包含方格正视和透视线框。" /></a><figcaption><a href="./concepts/wall-window-catalog.png" target="_blank" rel="noopener" class="help-text-link">打开图2 · 全形态集合 ↗</a></figcaption></figure>
<details><summary>拆解与制作过程参考</summary>
<h3 id="wall-window-variants">四块拼成大窗 · 斜角变化</h3>
<p>四块1×1窗角拼成一个2×2大窗；内部边敞开，十字窗棂另加。新增四向45°斜墙与四块斜角窗。所有模块深0.2。</p>
<figure class="concepts-figure"><a href="./concepts/wall-window-variants.png" target="_blank" rel="noopener"><img src="./concepts/wall-window-variants.png" width="2400" height="3300" loading="lazy" alt="四个L形窗角组合2×2大窗、可选十字窗棂、四向45度斜墙、四个斜角窗块拆分及组合；均附线框透视，深0.2。" /></a><figcaption><a href="./concepts/wall-window-variants.png" target="_blank" rel="noopener" class="help-text-link">打开四块拼窗与斜角变化图 ↗</a></figcaption></figure>
<h3 id="wall-window-construction">在一大面墙上开窗：制作示例</h3>
<p>8×5格墙面中开一个3×2窗口；34格保留完整墙，另外6格统一归属窗口。先取消选区墙体，再生成外周窗框，洞口贯穿0.2墙深。</p>
<figure class="concepts-figure"><a href="./concepts/wall-window-construction.png" target="_blank" rel="noopener"><img src="./concepts/wall-window-construction.png" width="2400" height="2540" loading="lazy" alt="8×5格大墙中的3×2窗口：完整方格正视、四步制作顺序、真实0.2厚度线框透视。窗框边宽0.1为草案，净洞2.8×1.8。" /></a><figcaption><a href="./concepts/wall-window-construction.png" target="_blank" rel="noopener" class="help-text-link">打开大面墙开窗制作图 ↗</a></figcaption></figure>
<figure class="concepts-figure"><a href="./concepts/wall-window-shapes.png" target="_blank" rel="noopener"><img src="./concepts/wall-window-shapes.png" width="2400" height="5800" loading="lazy" alt="${t("背景墙完整格、镂空与矩形窗的方格正视和线框透视；3×2跨格窗仅保留外围框，四向半墙为选做。墙厚0.2，窗框边宽0.1是草案。", "Grid front views and perspective wireframes for full walls, openings and rectangular windows. The 3×2 window has a perimeter frame only. Four half-wall directions are optional; depth is 0.2 and draft frame width is 0.1.")}" /></a><figcaption><a href="./concepts/wall-window-shapes.png" target="_blank" rel="noopener" class="help-text-link">${t("打开墙体与窗口完整图", "Open full wall and window diagram")} ↗</a></figcaption></figure>
</details>
<h3>背景墙形态与窗口定义</h3>
<p>状态：本轮设计方案，尚未实现。用户已确认的基础规则：标准背景墙模块宽1×高1×厚0.2，在外延预留区内；整墙不能无故缩边。窗口需支持四块组成一个大窗及斜角形态；本资料据此定义具体模块。窗框边宽与斜切尺寸为草案。</p>
<h3>1. 分级与形态</h3>
<div class="concepts-table-scroll"><table><thead><tr><th>编号</th><th>形态</th><th>级别</th><th>几何定义</th></tr></thead><tbody><tr><td>W0</td><td>完整墙格</td><td>1 必须做</td><td>XY完整1×1，Z厚0.2。相邻完整墙格贴合，材质接缝不能改变几何覆盖范围。</td></tr><tr><td>W1</td><td>镂空墙格</td><td>1 必须做</td><td>保留逻辑格位，但该格不生成墙面和墙侧面。它是一处开口状态，不是透明实心砖，也不必作为独立物品。</td></tr><tr><td>W2</td><td>矩形窗区域</td><td>1 必须做</td><td>在一个整数格矩形区域内挖空，外周留窗框。单格窗与跨格窗使用同一规则。</td></tr><tr><td>W2-TL/TR/BL/BR</td><td>矩形窗四角模块</td><td>1 必须做</td><td>每块占1×1，仅外侧两边留框；四块按左上、右上、左下、右下组成一个2×2大窗。</td></tr><tr><td>W7-1～4</td><td>四向45°斜墙</td><td>1 必须做 · 本次补充</td><td>沿1×1格对角线切分，保留左下、右下、左上或右上的半格三角墙；深0.2。</td></tr><tr><td>W8-TL/TR/BL/BR</td><td>四块组合斜角窗</td><td>1 必须做 · 本次补充</td><td>每块1×1，外角保留三角墙片并接斜窗框；四块组成2×2斜角大窗，深0.2。</td></tr><tr><td>W3/W4</td><td>上半墙 / 下半墙</td><td>2 选做</td><td>仍占一个逻辑格，实体宽1、高0.5、厚0.2；分别位于y=[0.5,1]或[0,0.5]。</td></tr><tr><td>W5/W6</td><td>左半墙 / 右半墙</td><td>2 选做</td><td>仍占一个逻辑格，实体宽0.5、高1、厚0.2；分别位于x=[0,0.5]或[0.5,1]。</td></tr><tr><td>—</td><td>玻璃 / 窗棂</td><td>2 选做</td><td>矩形窗的附加表现，不扩展成新的墙体几何类别。</td></tr><tr><td>—</td><td>圆窗 / 拱窗 / 不规则破损</td><td>3 不重要</td><td>只记录可能用途，不扩展全部旋转形态，不纳入当前开发与验收清单。</td></tr></tbody></table></div>
<h3>2. 尺寸与窗口规则</h3>
<p>墙标准模块的1×1表示格位与外轮廓。W0完整填满这个范围；W1/W2属于明确的开口形态，W3～W6是主动选择的半墙，不能把这些例外变成所有墙默认缩边。</p>
<p>矩形窗按宽W×高H个逻辑墙格定义，W、H为正整数，锚点设在区域左下角。图中1×1与3×2只是两个示例，不限制窗口只能有这两种尺寸。当前基础形态包括矩形完整区域和第7节的对称45°斜角窗，不自动支持任意洞形合并。</p>
<p>窗框在XY正面的边宽记为b，本轮草案b=0.1格。外轮廓仍为W×H，净洞为(W−2b)×(H−2b)。因此单格示例净洞0.8×0.8，3×2示例净洞2.8×1.8。b是可调设计参数，不能与已确认的Z厚度0.2混用。</p>
<p>窗洞必须贯穿墙的整个0.2深度，不能在完整墙上贴一张深色或透明图片假装开窗。窗框用上、下、左、右四条不重叠边带组成，内洞侧面随0.2墙深生成。</p>
<h3>3. 跨格结合</h3>
<p>一个跨格窗口视作一个整体：只在区域外周留框，内部相邻格不生成窗框和封闭侧面。四边与四角由区域边界推导。四个1×1窗角的模块形态必须明确支持，2×2组合见第7节；是否由工具自动选朝向或由玩家旋转放置，交互另定。图上的内部虚线只表示逻辑格，不是窗棂。</p>
<p>两个独立窗口相邻时，不默认合并；只有明确作为同一个矩形窗区域创建，才共享外框。3×2大窗不能用六个各带完整外框的小窗代替。</p>
<p>同一墙层同一格只归属一种墙形态或一个窗口区域，不能让W0和W2同时生成，造成洞后仍有完整墙。现有地形格与墙格是不同层，背景墙开洞不会自动删除中间的实体地形。</p>
<p>本轮放置草案：窗口区域必须完整位于同一墙面、同一Z位置，并避开其他窗口区域；不支持局部重叠。外框与周围墙相接，是否要求建筑支撑、材料成本及拆除后的填补方式另行定义。</p>
<h3>4. 深度、玻璃与碰撞</h3>
<p>中央实体Z=[−0.5,+0.5]，内沿预留[−1,−0.5]，外延预留[+0.5,+1]。墙厚固定0.2，在外延区内；图中Z=[+0.5,+0.7]仅为示意，墙在预留区内的固定偏移尚未定死。所有相接墙块和同一窗框必须使用同一偏移。</p>
<p>玻璃作为可选薄层放入窗框的0.2包络内，不增加整体墙厚；具体厚度和前后偏移待定。玻璃存在时属于有玻璃的窗口，不能标成完全空洞。窗棂是可选内部分隔，不能由格线默认生成。</p>
<p>背景窗是视觉开口，不是供角色左右穿过的门。是否阻挡投射物、能否打碎、是否参与房间封闭判定，都需要另立玩法规则，不能从窗的外观自动推断。</p>
<h3>5. 绘图与验收</h3>
<p>正视图采用等比例XY方格。线框图统一使用同一透视方法，前后截面相同、厚度为0.2；远近投影大小变化不改变实际尺寸。W1没有墙几何，因此只画空格参考框。</p>
<p>验收重点：W0不缩边；墙深不变；W2贯穿挖空；跨格窗内部无多余框；同层无重复墙面；玻璃与窗洞状态能区分；选做和低优先级项目不自动升级为必做。本次完成资料定义，不代表游戏中已支持这些墙形态。</p>

<h3>6. 在一大面墙上制作窗口</h3>
<p><strong>示例布局：</strong>先铺一面宽8×高5格的背景墙，共40格。以整面墙左下角为原点，窗口区域为X=[2,5]、Y=[2,4]，占3×2共6格；左边保留2格墙、右边3格、下面2格、上面1格。8×5是墙面示例，不是房间固定尺寸。</p>
<p><strong>制作顺序：</strong>①完整铺墙；②按左下角(2,2)及宽3、高2选择窗口区域；③将这6格统一归属窗口，不再生成原来的完整墙体；④只在整个3×2区域的外围生成窗框；⑤按需添加玻璃或窗棂。完成后是34个完整墙格，加一个占6格的窗口区域。</p>
<p><strong>几何制作：</strong>逻辑上是一面连续的墙，但渲染不要求先造一整块实体再做布尔切割：直接跳过窗口占据的6格墙网格，再生成四条窗框边带及洞口侧面即可。窗框上、下边带各3×0.1，左、右边带各0.1×1.8，四条互不重叠；一起沿Z挤出0.2，净洞2.8×1.8。所有相接墙块和窗框的前后平面保持齐平，不保留内部封闭接缝面。</p>
<p><strong>真实开口：</strong>洞口贯穿墙的整个0.2深度。去掉玻璃时可以通过窗口看到后方内容；不得保留洞后的完整墙。原来的整墙与窗口不能同时占用同一墙层格位。图中没有玻璃，虚线只作方格标尺。</p>
<p><strong>范围与状态：</strong>本图补充设计与制作方法，未实现游戏建造功能；没有定义实际编辑器按钮或操作手势。窗框正面边宽0.1仍是草案。背景墙开窗不自动改变实体地形、角色通行或房间封闭判定。</p>
<h3>7. 四块拼窗与斜角变化</h3>
<p><strong>四块组成一个矩形大窗：</strong>W2-TL左上、W2-TR右上、W2-BL左下、W2-BR右下，各占完整1×1逻辑格，深0.2。每块的外侧两边是L形窗框，朝窗口内部的两边敞开。按2×2贴齐后成为一个连通大窗；b=0.1草案下净洞1.8×1.8。不能用四个四边封闭的小窗代替。单格独立小窗仍用原来的W2整框形式。</p>
<p><strong>内部接缝：</strong>四块共享一个窗口区域与Z偏移。逻辑格线保留，但不能沿内部格界生成挡住洞口的框、墙面或封闭侧面。窗框条相接处去掉重合端面，不留缝；大于2×2的矩形窗沿用区域边界推导边段，不能重复四角模块去填满整个区域。</p>
<p><strong>参考图的十字窗棂：</strong>四块拼成大窗后，可以额外增加一根横窗棂和一根竖窗棂，得到参考图中的四格分隔效果。十字窗棂和玻璃仍为2选做。图中窗棂宽0.08仅用于示意，不是已确认规格；不能把模块格界当成必须出现的窗棂。</p>
<p><strong>四向45°斜墙：</strong>W7-1左下实心：x+y≤1；W7-2右下实心：y≤x；W7-3左上实心：y≥x；W7-4右上实心：x+y≥1。坐标均在单格[0,1]×[0,1]内，各自实心面积0.5，沿Z挤出0.2。用于背景墙斜边、屋顶下收口，不能直接继承实体地形斜坡的碰撞规则。</p>
<p><strong>四块组成斜角大窗：</strong>W8四个窗角每块占1×1：外角保留一片三角墙，斜边接窗框，内部两边敞开。2×2拼合后形成对称八边形窗口。示例每角沿两条外边各量c=0.5再连出45°斜边，c为草案。斜框沿法线方向保持b=0.1草案边宽，全部沿Z挤出0.2。W7整格对角切出的半格三角墙与W8局部斜切窗角尺寸不同，不能直接互换。</p>
<p><strong>范围与状态：</strong>四角拼窗、四向45°斜墙和这一种对称斜角窗纳入1必须做的定义范围，但尚未实现游戏建造。半墙、玻璃、窗棂维持2选做；圆窗、曲线、破损及任意角度组合仍不扩展为必做。墙在外延预留区，整格墙不缩边，墙厚0.2不变。</p>
<h3>8. 完整装配与深度透视</h3>
<p><strong>装配内容：</strong>用一面8×5包围尺寸的墙展示组合：左窗占X=[1,3]、Y=[2,4]，四块L形窗角组成2×2矩形窗；右窗占X=[5,7]、Y=[2,4]，四块斜角窗块组成2×2斜角窗。墙的四个外角各用一个方向的W7斜墙；中央加入四向半墙W3～W6，左边缘格(0,2)为镂空W1，右边缘格(7,2)为单格窗，其余位置完整铺墙。下方地台宽8、高1、深1。此为形态装配样例，不替换此前房间尺寸规则。</p>
<p><strong>观察与深度：</strong>从内沿一侧看向外延墙面，所有对象使用同一个三维透视相机。实体地台Z=[−0.5,+0.5]；墙与窗框Z=[+0.5,+0.7]只是本图示例偏移，实际固定偏移仍未定。预留空间为内沿[−1,−0.5]、外延[+0.5,+1]，墙厚占外延的一部分，不增加总空间到2.2。</p>
<p><strong>窗口对比：</strong>左窗展示可选玻璃与十字窗棂，右窗保持没有玻璃的真实开口。玻璃在厚度包络内，背后没有完整墙面。两窗都保持内部格界敞开；窗框边宽b=0.1、角部斜切c=0.5与窗棂示例宽0.08均为草案。</p>
<p><strong>线框读法：</strong>图1内附同镜头透视线框：浅灰穿透显示各模块面边，绿色标示墙前沿与窗框，蓝色标示地台。线框不做遮挡消隐，显示接缝不代表运行时应保留重合内部面。地台两侧彩色线框只标预留空间，不是实体地板。</p>
<p><strong>尺寸核对：</strong>实体深1，墙深0.2，内外预留各0.5均按同一世界单位投影，不为看清薄墙而夸大Z。等比例YZ校对图中，实体深1×高1为正方形，墙厚为两个0.1标尺小格，整格墙高1。外角斜切只用于展示四向形态，不是所有建筑必须采用的结构。</p>
<h3>9. 演示图、全形态集合与半格补全</h3>
<p><strong>两张图的分工：</strong>图1 wall-window-assembly.png展示实际装配、深度校对与同镜头透视线框；图2 wall-window-catalog.png集中列出25张形态/组合/附加外观卡及3张低优先级参考。看效果用图1，查形态用图2；这些数量包含组合示例，不表示新增28种独立墙体。</p>
<p><strong>半格补全：</strong>W3上半墙放在格(3,3)，局部y=[0.5,1]；W4下半墙放在格(3,1)，局部y=[0,0.5]；W5左半墙放在格(4,3)，局部x=[0,0.5]；W6右半墙放在格(4,1)，局部x=[0.5,1]。每块仍占一个1×1逻辑格，实心面积0.5，另一半明确留空；沿Z均深0.2。两张图均用紫色标识，仍属2选做。</p>
<p><strong>清单内容：</strong>完整墙、镂空、单格窗、2×2四块大窗、3×2跨格窗、四个矩形窗角、四个斜角窗角及组合、四向45°斜墙、上下左右半墙、可选玻璃和十字窗棂；圆窗、拱窗及不规则破损只画参考轮廓并列为3不重要。</p>
<p><strong>支持边界：</strong>全部指目前资料库已定义的方向、组合规则与参考项。矩形窗按W×H扩展，图中的2×2和3×2是示例；任意窗宽高、曲线及破损组合不能有限穷举。列在图上不代表全部必须支持，也不代表运行时已实现。</p>
</section>
<section id="building-shapes" class="help-block">
<h2>${t("02 格子形态与支持范围", "02 Tile shapes and support scope")}</h2>
<p><strong>${t("图谱列全不是全量开发清单。", "A complete atlas is not a requirement to implement every shape.")}</strong> ${t("按优先级分为：1必须做14种、2选做4种、3不重要15种。总图按1/2/3分区展示；第3级也可从左侧目录直接打开，但不进入当前开发与验收范围。实现状态另行标注，必须做不代表已经实现。", "Priority 1: 14 required profiles; priority 2: 4 optional profiles; priority 3: 15 low-priority references. The atlas shows all three levels in separate sections. Level 3 also has a direct sidebar entry and remains outside current development and acceptance scope. Implementation status is separate.")}</p>
<p><a class="help-text-link" href="#building-shape-spec">${t("阅读完整定义与支持清单", "Read the full definitions and support list")} ↓</a> · <a class="help-text-link" href="./concepts/tile-shape-definitions.md" download>${t("下载说明文档（Markdown）", "Download the definition document (Markdown)")}</a></p>
<figure class="concepts-figure"><a href="./concepts/building-shapes.png" target="_blank" rel="noopener"><img src="./concepts/building-shapes.png" width="2400" height="5275" loading="lazy" alt="${t("第1级必须做14种、第2级选做4种，每种标注优先级、实现状态、正视轮廓、深度线框与尺寸。第3级15种在总图第三区及独立参考区展示。", "14 required and 4 optional profiles, with priority, implementation status, front outlines, depth wireframes and dimensions. The 15 low-priority variants appear in the third section and a separate reference section.")}" /></a><figcaption><a class="help-text-link" href="./concepts/building-shapes.png" target="_blank" rel="noopener">${t("打开形态总图", "Open full atlas")} ↗</a></figcaption></figure>
<details><summary>${t("按形态查看分组参考图", "Family reference sheets")}</summary><p><a href="./concepts/building-shapes-appendix.png" target="_blank" rel="noopener">${t("3 不重要 · 15种附图", "3 Low priority · 15 profiles")}</a></p><p>${t("分组大图：", "Family sheets:")} <a href="./concepts/building-shapes-family-1.png" target="_blank" rel="noopener">${t("整砖与四向半砖", "Full and half blocks")}</a> · <a href="./concepts/building-shapes-family-2.png" target="_blank" rel="noopener">${t("整格三角坡", "Full-cell triangles")}</a> · <a href="./concepts/building-shapes-family-3.png" target="_blank" rel="noopener">${t("半尺寸单斜块", "Half-size ramps")}</a> · <a href="./concepts/building-shapes-family-4.png" target="_blank" rel="noopener">${t("双斜尖顶", "Peaks")}</a> · <a href="./concepts/building-shapes-family-5.png" target="_blank" rel="noopener">${t("缓坡高段（可选）", "High ramp segments (optional)")}</a> · <a href="./concepts/building-shapes-family-6.png" target="_blank" rel="noopener">${t("四角四分之一砖（0.5×0.5×1）", "Quarter blocks at four corners (0.5×0.5×1)")}</a></p></details>
</section>
<section id="building-shapes-low" class="help-block">
<h2>${t("3 不重要 · 参考形态", "3 Low priority · reference profiles")}</h2>
<p>${t("共15种旋转变体：半尺寸单斜块6种、双斜尖顶3种、缓坡高段6种。保留为几何参考，不进入当前开发与验收清单；以后有明确用途再调整级别。", "15 rotated variants: 6 half-size ramps, 3 peaks and 6 high ramp segments. Geometric references only, excluded from current development and acceptance scope; reprioritize only for a concrete need.")}</p>
<figure class="concepts-figure"><a href="./concepts/building-shapes-appendix.png" target="_blank" rel="noopener"><img src="./concepts/building-shapes-appendix.png" width="2400" height="2545" loading="lazy" alt="${t("第3级不重要形态15种，每种标注尺寸、正视轮廓、线框与可选参考状态。", "15 level-3 reference profiles with dimensions, front outlines, wireframes and optional status.")}" /></a><figcaption><a class="help-text-link" href="./concepts/building-shapes-appendix.png" target="_blank" rel="noopener">${t("打开第3级完整图片", "Open full level-3 sheet")} ↗</a></figcaption></figure>
</section>
<section id="building-shape-spec" class="help-block">
<h2>${t("格子形态 · 完整定义文档", "Tile shapes · complete definition document")}</h2>
<p>${t("以下为中文设定原文，包含全部33种轮廓及实现范围；本节可一键复制全文给LLM。", "The Chinese source below defines all 33 profiles and their implementation scope; copy this section to include the complete document.")} <a class="help-text-link" href="./concepts/tile-shape-definitions.md" download>${t("下载 Markdown", "Download Markdown")}</a></p>
${TILE_SHAPE_DOCUMENT}
</section>
<section id="building-joins" class="help-block">
<h2>${t("03 格子互相结合方式", "03 Tile connections")}</h2>
<p>${t("先按整数格点对齐，所有实体共享Z=[−0.5,+0.5]；再比较相邻格边界的实际顶高。端点相等形成连续表面，端点不等就是台阶。", "Align integer cell positions and the shared Z interval [−0.5,+0.5], then compare actual top heights at adjacent edges. Equal endpoint heights form a continuous surface; unequal heights form steps.")}</p>
<ul><li>${t("整砖A+A平接；下半砖B接整砖A形成0.5格台阶，不能称为连续坡。", "A+A is level; B to A is a 0.5 step, not a continuous slope.")}</li><li>${t("右升缓坡F+G在接缝处都是0.5，两格宽合计升高1格；下降镜像为H+I。不能重复两个F来代替F+G。", "F+G meet at height 0.5 and rise 1 across two cells; H+I are the descending mirror. Repeating F cannot replace F+G.")}</li><li>${t("全坡D高端接整砖A；整砖A接E高端。D+E构成坡顶，E+D构成坡谷，几何连续不代表角色控制已经验证。", "D meets A at its high end; A meets the high end of E. D+E form a crest and E+D a valley. Geometric continuity does not establish tested character traversal.")}</li><li>${t("上半砖C目前只定义几何轮廓，不自动允许上下半砖同时占用同一个逻辑格。若要支持同格组合，必须另定存储、放置和碰撞规则。", "The C profile does not authorize stacking upper and lower halves in a single logical cell. Such composition needs separate storage, placement and collision rules.")}</li><li>${t("拼接时前沿、后沿分别齐平，不靠错开Z来掩盖接缝，也不把半格留空区域填实。", "Align both Z edges; do not offset depth to conceal joints or fill intentional empty half-cell regions.")}</li><li>${t("半高平台F+B+I占三个格，两处接缝均高0.5；单格双斜J在中心达0.5，J+J的接缝为0，形成坡谷。J直接接B会出现0.5高差，不能标成连续平接。", "F+B+I forms a three-cell half-height platform with both seams at 0.5. A single J peaks at 0.5 in its center; J+J meet at zero and form a valley. J next to B has a 0.5 height difference, not a level continuous seam.")}</li></ul>
<figure class="concepts-figure"><a href="./concepts/building-joins.png" target="_blank" rel="noopener"><img src="./concepts/building-joins.png" width="2400" height="2910" loading="lazy" alt="${t("先按整数格点对齐，所有实体共享Z=[−0.5,+0.5]；再比较相邻格边界的实际顶高。端点相等形成连续表面，端点不等就是台阶。", "Align integer cell positions and the shared Z interval [−0.5,+0.5], then compare actual top heights at adjacent edges. Equal endpoint heights form a continuous surface; unequal heights form steps.")}" /></a><figcaption><a class="help-text-link" href="./concepts/building-joins.png" target="_blank" rel="noopener">${t("打开格子互相结合方式完整图", "Open full tile connections diagram")} ↗</a></figcaption></figure>
</section>
<section id="building-platforms" class="help-block">
<h2>${t("跳跃平台 · 单向承托定义", "Jump-through platforms · one-way support")}</h2>
<p>${t("尺寸以最新“平台高度与深度”为准：深度仅0.75/0.5。下方原基础图用于解释单向通过行为，旧深1与厚0.08不作为新尺寸定稿。", "Use the latest platform alignment section for dimensions: depths 0.75/0.5 only. The earlier diagram explains one-way behavior; its depth 1 and thickness 0.08 are not current design dimensions.")} <a href="#platform-mounts">${t("查看最新形态", "Latest variants")} →</a></p>
<p>${t("平台只在顶面承托脚底：上升时头部和身体可穿过，下降时脚底从上方跨过顶面才落脚。侧边与底面不阻挡，不能用实心半砖代替。现有游戏已支持基本单向碰撞及S/↓主动下穿；新尺寸和房屋装配仍为设计资料。", "Platforms support feet only at their top surface. Bodies pass through while rising; descending feet land when crossing the surface from above. Sides and undersides do not block. Solid half bricks are different. Basic one-way collision and S/down drop-through already exist; new dimensions and room assembly remain design references.")}</p>
<ul><li>${t("单件占1×1逻辑格，宽1、深1；落脚面在格子上边界Y=j+1。外观向下延伸厚度t，格内其余空间留空。图示t=0.08是草案；当前渲染薄板高0.25，未在本次同步。", "One piece occupies a 1×1 logical cell, width 1 and depth 1. Its landing surface is at Y=j+1; visual thickness t extends downward. Illustrated t=0.08 is provisional; current rendering uses 0.25 and is unchanged.")}</li><li>${t("落脚需要水平重叠、下降时脚底从顶面上方跨越，且未处于下穿状态。只有头部高过平台不能落脚。主动下穿沿用现有计时规则，不承诺一次只穿一层。", "Landing requires horizontal overlap and descending feet crossing from above while drop-through is inactive. A head above the surface is insufficient. Existing timed drop-through does not promise exactly one platform per action.")}</li><li>${t("两件平台拼成2格宽，同高接缝连续；接楼板时顶面齐平，通口不能叠实心砖。背景墙独立连续铺在外延区。", "Two pieces form width 2 with a continuous level seam. Match slab top height and remove solids from the opening. Background walls remain independent in the outer reserve.")}</li><li>${t("房屋平台顶高2、4、6格。人物碰撞高2.8大于间距2，头部穿过上层平台是预期行为；主角外观仍高3.1，不能为平台缩小人物。2格高差尚未验证跳跃手感。", "Room platforms are at heights 2, 4 and 6. Collision height 2.8 exceeds spacing 2, so head overlap with the next platform is expected; retain visual height 3.1. Jump feel at spacing 2 remains unvalidated.")}</li><li>${t("1必须做：水平单格、连续拼接、上穿落脚、主动下穿、通口连接。2选做：端帽、支架与材质外观。3不重要：斜、移动、翻转及破碎平台。安装支撑、成本与拆除规则待定。", "Required: level single cells, joining, jump-through landing, drop-through and slab connections. Optional: caps, brackets and materials. Low priority: slopes, moving, flipping and breakable platforms. Placement support, cost and removal rules remain open.")}</li></ul>
<p><a href="./concepts/platform-definitions.md" download>${t("下载平台完整定义（Markdown）", "Download platform definitions (Markdown)")}</a></p>
<figure class="concepts-figure"><a href="./concepts/platform-definition.png" target="_blank" rel="noopener"><img src="./concepts/platform-definition.png" width="2400" height="2400" loading="lazy" alt="${t("单向平台定义图：1格宽、1格深，外观厚0.08草案；正视方格与真实透视线框；上穿、落脚、下穿三种行为；2格宽通口与高2、4、6的落脚平台；支持分级。", "One-way platform: width and depth 1, provisional thickness 0.08; front grid, perspective wireframe, rising/landing/drop-through behavior, a width-2 shaft with surfaces at 2/4/6, and priorities.")}" /></a><figcaption>${t("上方绿色线为落脚面，橙色薄板为外观；逻辑格、碰撞和外观分别定义。", "Green marks the support surface; orange is visual geometry. Logical cells, collision and appearance are distinct.")}</figcaption></figure>
</section>
<section id="platform-mounts" class="help-block">
<h2>${t("平台形态 · 高度对齐 × 两种深度", "Platform geometry · vertical alignment × two depths")}</h2>
<p><strong>${t("1 必须做：中间2/4格平台必须支持，不能用3/4格替代。", "Required: centered 2/4-depth platforms must be supported; 3/4 depth is not a substitute.")}</strong> ${t("深度0.5，Z=[−0.25,+0.25]，固定以人物平面Z=0居中。这项要求不代表左右半宽组合都必须实现。", "Depth 0.5 spans Z=[−0.25,+0.25], centered on character plane Z=0. This does not require every half-width combination.")}</p>
<p>${t("最新确认：平台深度只分3/4格（0.75）与2/4格（0.5），不再用深1作为形态选项。宽度有整格1、左半格0.5、右半格0.5；板厚仍待定，本图暂按0.2。X半宽、Z半深、半格高度分别定义。", "Confirmed depths are only 3/4 (0.75) and 2/4 (0.5); depth 1 is no longer a proposed variant. Width is full 1, left half 0.5 or right half 0.5. Thickness remains open, illustrated as 0.2. X half-width, Z half-depth and half-cell elevation are separate.")}</p>
<table><thead><tr><th>${t("高度对齐", "Vertical alignment")}</th><th>${t("顶面Y", "Top Y")}</th><th>${t("底面Y（厚0.2示例）", "Bottom Y (thickness 0.2)")}</th><th>${t("状态", "Status")}</th></tr></thead><tbody><tr><td>${t("整砖顶面对齐", "Full-block top")}</td><td>j+1</td><td>j+0.8</td><td>${t("对齐需求", "Requested alignment")}</td></tr><tr><td>${t("半砖顶面对齐", "Lower half-block top")}</td><td>j+0.5</td><td>j+0.3</td><td>${t("对齐需求", "Requested alignment")}</td></tr><tr><td>${t("墙格底边对齐", "Wall-cell bottom")}</td><td>j+t</td><td>j</td><td>${t("候选：平台底面齐墙底", "Candidate: slab bottom flush with wall bottom")}</td></tr></tbody></table>
<p>${t("平台只允许以人物平面Z=0居中。深0.75占[−0.375,+0.375]；深0.5占[−0.25,+0.25]。取消贴墙和任意前后偏移，避免人物站在平台深度边缘造成脚部穿帮。", "Platforms must be centered on character plane Z=0. Depth 0.75 spans [−0.375,+0.375]; depth 0.5 spans [−0.25,+0.25]. Wall attachment and arbitrary Z offsets are prohibited to avoid placing the feet at a depth edge.")}</p>
<p>${t("半砖顶齐表示落脚顶面在半格高，不表示板厚0.5。上半砖顶面与整砖顶面同高。碰撞线必须跟随实际顶面；现有代码只固定承托于j+1，半格顶齐和底边对齐尚未实现。底边对齐候选和板厚0.2仍待确认，六个例子不等于全部必须支持。", "Half-block alignment places the landing surface at half-cell height; it does not imply thickness 0.5. An upper half-block shares the full-block top. Collision must follow the actual surface; current code supports only j+1, so other alignments are unimplemented. Bottom alignment and thickness 0.2 remain provisional; six examples are not an all-required implementation list.")}</p>
<p><a href="./concepts/platform-definitions.md" download>${t("下载平台完整定义", "Download full platform definitions")}</a></p>
<figure class="concepts-figure"><a href="./concepts/platform-mount-perspective.png" target="_blank" rel="noopener"><img src="./concepts/platform-mount-perspective.png" width="2500" height="4840" loading="lazy" alt="${t("平台高度对齐透视：整砖顶齐、半砖顶齐、墙格底边齐候选，每种配深0.75和0.5；附实体透视、线框、侧剖方格、顶面与底面高度，并补充左右半宽平台与XZ水平俯视。", "Platform alignment: full-block top, lower half-block top and candidate wall-cell bottom, each at depth 0.75 and 0.5; solid perspective, wireframes, YZ grids and surface heights.")}" /></a><figcaption>${t("深度两种已确认；板厚0.2与底边对齐为示例。前后位置固定居中，高度对齐和板厚分别定义。", "Two depths are confirmed; thickness 0.2 and bottom alignment are examples. Z placement is fixed at the center; height alignment and thickness are separate.")}</figcaption></figure>
<h3>${t("左右半格 · 水平俯视", "Left/right halves · top view")}</h3>
<p>${t("左半平台X=[i,i+0.5]，右半X=[i+0.5,i+1]，各宽0.5，另一半留空；各配深0.75或0.5。俯视XZ中，上方是外延墙，左右与游戏正面一致。半宽平台需相应的半格承托范围，不能套用整格碰撞；同格左右共存与合并规则尚未定义。", "Left halves cover X=[i,i+0.5], right halves [i+0.5,i+1], leaving the other half empty; each uses depth 0.75 or 0.5. In the XZ top view the wall is above and left/right match the game front. Half-width support needs matching collision extents; same-cell coexistence and merging remain undefined.")}</p>
<p><a href="./concepts/platform-half-plan.png" target="_blank" rel="noopener">${t("单独打开左右半格与水平俯视图", "Open half-width and top-view detail")} ↗</a></p>
<h3>${t("只许居中 · 六种宽度与深度组合", "Centered only · six width/depth combinations")}</h3>
<p>${t("整宽、左半、右半均固定Z居中，各配深0.75或0.5，共6种组合，不再是12种。以墙面Z=+0.5为例，间隙分别为0.125和0.25，这是居中的计算结果，不是可调位置。中间2/4深度必须支持；左右半宽组合建议选做。高度对齐另计，不要求全部组合都实现。", "Full, left-half and right-half widths each use centered depth 0.75 or 0.5: six combinations, not twelve. With wall face Z=+0.5, gaps are 0.125 and 0.25, derived from centering rather than adjustable placement. Centered 2/4 depth is required; half-width combinations are suggested as optional. Height alignment is separate.")}</p>
<figure class="concepts-figure"><a href="./concepts/platform-position-plan.png" target="_blank" rel="noopener"><img src="./concepts/platform-position-plan.png" width="2500" height="2430" loading="lazy" alt="${t("只允许Z居中的六种平台：整宽、左半、右半，各配0.75和0.5深度，附透视与水平俯视。", "Six centered-only platforms: full, left-half and right-half widths at depths 0.75 and 0.5, with perspective and top views.")}" /></a><figcaption>${t("蓝线穿过平台深度中间；贴墙和任意前后偏移已取消。板厚0.2仍为示例，支撑方式未定。", "The blue line crosses the depth center. Wall attachment and arbitrary Z offsets are removed. Thickness 0.2 is illustrative; support remains undefined.")}</figcaption></figure>
</section>
<section id="building-house" class="help-block">
<h2>${t("04 房子", "04 Room definition")}</h2>
<p>${t("本轮只定义单个房间：沿用示例外轮廓总高7格，即底板1、室内净高5、顶板1；本次横向加宽3格，室内净宽由6变9。实体深1，正面敞开观察，墙位于额外的外延预留区，厚0.2；位置以最新深度图为准。", "This defines one room. The current illustrative exterior height is seven: floor 1, clear interior 5, roof 1, with clear interior width expanded from 6 to 9. Solids have depth 1, the viewing side stays open and walls occupy the additional outer reserve at thickness 0.2; use the latest depth diagram for placement.")}</p>
<ul><li>${t("房子由实体边界、背景墙、入口、家具与设施分别组成；背景墙不能替代阻挡角色的侧墙。", "A room separates solid boundaries, rear walls, entrances and furnishings. Rear walls do not replace collision walls.")}</li><li>${t("本图门为3＋1示例；统一的是整套门占高4格，净洞和上框允许按门型分配，详见下方门定义。", "This drawing uses a 3+1 example. The shared envelope is four tiles high; opening and frame proportions vary by door type.")}</li><li>${t("主角保持3.3头身参照、外观高3.1格、碰撞0.8×2.8格。旧3格净洞会少0.1格外观余量；允许改用3.5格高门，不更改人物比例来凑。", "Keep the 3.3-head reference, visual height 3.1 and collision size 0.8×2.8. The old 3-tile opening is 0.1 shorter than the visual height; a 3.5-tile opening is allowed without changing the character proportions.")}</li><li>${t("床3×1、桌3×2在示例房间中可不重叠摆下；家具是否阻挡、门口通道是否可走还需要独立规则和验证。", "Draft bed 3×1 and table 3×2 fit without overlapping in the example. Furniture collision and usable entry routes remain separate rules and checks.")}</li><li>${t("新增吊灯与墙窗：吊灯整体占1×1格（含吊杆），从屋顶向下1格，最低点离地4格；右侧窗洞暂按2×2格，替换4块背景墙板，窗框、玻璃与窗洞玩法另定。床与桌移开窗洞和门口。", "A central pendant hangs from the ceiling, occupying a 1×1 cell including suspension, with lower clearance of 4. A 2×2 window opening on the right replaces four background panels. Frame, glass and gameplay behavior remain separate decisions. Bed and table placement respects the doorway and window opening.")}</li><li>${t("本图3＋1门型的上沿占Y=3至4；其他门可重新分配这4格，顶部可以只做门框。镜头从内沿侧看向外延墙面。", "This 3+1 example has its header at y=3 to 4. Other doors may redistribute the four-tile envelope and use only an upper frame. The camera looks toward the outer wall.")}</li></ul><p><a href="./concepts/room-layout-definitions.md" download>${t("下载房间布置说明", "Download room layout notes")}</a></p>
<figure class="concepts-figure"><a href="./concepts/room-reference-perspective.png" target="_blank" rel="noopener"><img src="./concepts/room-reference-perspective.png" width="2400" height="2050" loading="lazy" alt="${t("本轮只定义单个房间：沿用示例外轮廓总高7格，即底板1、室内净高5、顶板1；本次横向加宽3格，室内净宽由6变9。实体深1，正面敞开观察，墙位于额外的外延预留区，厚0.2；位置以最新深度图为准。", "This defines one room. The current illustrative exterior height is seven: floor 1, clear interior 5, roof 1, with clear interior width expanded from 6 to 9. Solids have depth 1, the viewing side stays open and walls occupy the additional outer reserve at thickness 0.2; use the latest depth diagram for placement.")}" /></a><figcaption><a class="help-text-link" href="./concepts/room-reference-perspective.png" target="_blank" rel="noopener">${t("打开房子完整图", "Open full room definition diagram")} ↗</a></figcaption></figure>
</section>
<section id="building-house-half" class="help-block">
<h2>${t("房子 · 半砖对照版", "Room · half-brick comparison")}</h2>
<p>${t("地板与屋顶采用宽1×高0.5×深1的半砖，侧墙保留整砖。室内净宽9、净高5，实体外轮廓总高6＝底板0.5＋净高5＋顶板0.5。原来的7格高整砖版保留作为对照。", "Floor and roof use half bricks measuring width 1 × height 0.5 × depth 1; side walls retain full bricks. Clear interior is 9 × 5, with physical exterior height 6 = floor 0.5 + clearance 5 + roof 0.5. The original seven-unit full-brick version remains for comparison.")}</p>
<p>${t("地板占所在逻辑格的上半格，屋顶占下半格，空出的半格不填充。背景墙仍为完整1×1格、厚0.2，位于外延预留区；门洞净高3，窗户、吊灯和家具沿用整砖版示例。下方正视方格与上方透视一一对应。", "The floor fills the upper half of its logical cell and the roof fills the lower half, leaving the remaining halves empty. Background panels remain full 1 × 1 cells at thickness 0.2 in the outer reserve. Door clearance remains 3; window, pendant and furniture follow the full-brick example. The frontal grid corresponds to the perspective above.")}</p>
<figure class="concepts-figure"><a href="./concepts/room-half-brick-perspective.png" target="_blank" rel="noopener"><img src="./concepts/room-half-brick-perspective.png" width="2400" height="2050" loading="lazy" alt="${t("半砖房间透视与方格：地板和屋顶各高0.5、深1，室内9×5，总高6；背景墙保持完整格子，含门、墙窗和吊灯。", "Half-brick room perspective and grid: floor and roof each height 0.5 and depth 1, clear interior 9 × 5, total height 6; full-cell background panels, door, wall window and pendant.")}" /></a><figcaption><a class="help-text-link" href="./concepts/room-half-brick-perspective.png" target="_blank" rel="noopener">${t("打开半砖房子完整图", "Open full half-brick room diagram")} ↗</a></figcaption></figure>
</section>
<section id="building-house-two-storey" class="help-block">
<h2>${t("房子 · 两层透视", "Room · two-storey perspective")}</h2>
<p>${t("整砖两层示例：每层净宽9、净高5；中间共用1格楼板，总高13＝底板1＋一层5＋楼板1＋二层5＋顶板1。门洞净高3，门洞上方这一格是与门框一体的门上沿，用木色标明；高1格，占外侧半格，内侧半格留空。", "Full-brick two-storey example: each interior is 9 wide and 5 high; one shared slab separates them. Total height 13 = base 1 + lower room 5 + shared slab 1 + upper room 5 + roof 1. Door clearance is 3; the cell above is the integrated header, shown in wood color.")}</p>
<p>${t("实体深1，内沿、外延各额外预留0.5；背景墙完整1×1、厚0.2。楼板留2格宽通口，单向落脚平台顶面距一层地面2、4、6格，最上平台齐二层地面；从下跳穿、从上落脚。床与吊灯移出通道。主角原图等比缩放至3.1格，并用同平面刻度和0.8×2.8碰撞框核对；跳跃参数尚未做玩法验证。", "Solids have depth 1 plus inner and outer reserves of 0.5 each. Background panels remain 1×1×0.2. A two-cell-wide opening contains one-way landing platforms at heights 2, 4 and 6 above the lower floor. The upper platform is flush with the upper floor. Jump through from below and land from above; furniture and pendants stay clear. Original character art is uniformly scaled to height 3.1 with a coplanar ruler and 0.8×2.8 collision outline. Jump parameters are not gameplay-validated.")}</p>
<figure class="concepts-figure"><a href="./concepts/room-two-storey-perspective.png" target="_blank" rel="noopener"><img src="./concepts/room-two-storey-perspective.png" width="2600" height="2400" loading="lazy" alt="${t("两层房屋透视与方格：每层9×5，总高13，楼板留2格宽通口，单向落脚平台顶高2、4、6；主角外观3.1格，附同平面标尺与0.8×2.8碰撞框。", "Two-storey perspective and frontal grid: each interior 9×5, shared slab 1, total height 13; integrated header in the cell above each doorway, full-cell background panels, windows and pendants.")}" /></a><figcaption>${t("本图仅示意3＋1门型的组件归属；最新允许厚重门、能量门与3.5格高门。", "This shows ownership for the 3+1 example only; heavy, energy and 3.5-tile doors are also allowed.")}</figcaption></figure>
</section>
<section id="building-house-half-two-storey" class="help-block">
<h2>${t("旧草案 · 两层半砖（未定稿）", "Earlier draft · two-storey half bricks")}</h2>
<p><strong>${t("此图二层采用了半格偏移的墙格原点，尚不符合统一世界方格。请以下方层间组合图比较方案，不作为建造定稿。", "This draft offsets the upper wall grid by half a cell. It is not a final construction specification; compare the globally aligned alternatives below.")}</strong></p>
<p>${t("左右侧墙宽0.5格，底板、楼板、顶板各高0.5格，实体深度均为1格。每层净空9×5，总高11.5格。水平板在左右墙外各挑出0.5格；二层地面为Y=5.5，背景墙按本层地面逐格排列，仍为完整1×1、厚0.2。", "Side walls are 0.5 wide; base, shared slab and roof are 0.5 high, all at depth 1. Each clear interior is 9×5; total height is 11.5. Horizontal slabs overhang walls by 0.5 at each end. The upper floor is at y=5.5, with full 1×1×0.2 wall panels aligned to its local floor.")}</p>
<p>${t("吊灯整体宽1×高1格，包含底座、吊杆和灯罩，灯底离本层地面4格；深度另定。门洞3格加一体上沿1格。保留宽2格通口，单向平台顶高2、4、5.5，层间通行尚未作游戏验证。", "Each pendant occupies 1×1 including canopy, suspension and shade, with its bottom 4 above the local floor; depth remains unspecified. Door clearance 3 plus integrated header 1. A two-wide opening connects platforms at heights 2, 4 and 5.5; gameplay traversal is unverified.")}</p>
<figure class="concepts-figure"><a href="./concepts/room-half-brick-two-storey.png" target="_blank" rel="noopener"><img src="./concepts/room-half-brick-two-storey.png" width="2600" height="2400" loading="lazy" alt="${t("两层半砖透视及方格：左右半宽墙、三道半高板、实体深1、总高11.5，每层吊灯整体1×1。", "Two-storey half-brick perspective and grid: half-width side walls, three half-height slabs, depth 1, total height 11.5 and one-cell pendants.")}" /></a><figcaption>${t("上层墙格按本层地面计；图中尺寸是概念定义，未实现游戏建造。", "Upper wall cells use the local floor origin; this is a concept definition, not implemented construction.")}</figcaption></figure>
<p><a href="./concepts/room-layout-definitions.md" download>${t("下载房间布置说明", "Download room layout notes")}</a></p>
</section>
<section id="building-floor-combinations" class="help-block">
<h2>${t("层间组合透视 · 上半砖与整砖优先", "Floor assemblies · upper-half and full slabs preferred")}</h2>
<p><strong>${t("常规方案：上半砖C、整砖A。两者落脚顶面同为整数格Y=6，门口直接齐平；上半砖更薄，一层多0.5格净高。下半砖B＋缓坡H保留为特殊组合，不作为常规层间做法。", "Regular floors use upper-half C or full A slabs. Both land at integer y=6, level with the door; C gives the lower room 0.5 more clearance. Lower-half B plus ramp H remains a special assembly.")}</strong></p>
<p>${t("按最新确认，整砖、上半砖、下半砖都支持设计组合。核对形态库后，本图使用A整砖、B下半砖、C上半砖、K/L左右半砖，以及H缓坡高段；不新增四分之一砖，不需要同格叠放。三种完整房间共用世界方格和透视镜头。", "All three slab types are supported design combinations. These rooms use catalog shapes A full, B lower half, C upper half, K/L side halves and H upper ramp segment. No quarter bricks or same-cell stacking are introduced. All share a world grid and camera.")}</p>
<p>${t("①整砖楼板：上下净高5/5。②上半砖：净高5.5/5，完整背景墙仅被遮住半格，吊灯贴实际底面。③下半砖：主区净高5/5.5，靠门一格换成H缓坡，高端Y=6接门口、低端Y=5.5接B地板；门不用下移或悬空。H包含下半格实体，不能用低段坡F/I直接代替。", "① Full slab: clear heights 5/5. ② Upper half: 5.5/5; full rear panels are partly occluded and the pendant attaches to the actual underside. ③ Lower half: 5/5.5 in the main area; one H ramp joins the door landing at y=6 to B flooring at y=5.5. H contains the lower half volume and cannot be replaced directly with a low ramp F/I.")}</p>
<p>${t("背景墙完整1×1、厚0.2；实体深1；吊灯整体1×1；门洞3格加一体上沿1格。这里确认组合设计；运行时代码仍仅有四种基础轮廓。H原为选做，本例采用它不改变其他形态的优先级。", "Background panels remain 1×1×0.2, solids depth 1, pendants 1×1, and doors clearance 3 plus header 1. This confirms design assemblies; runtime still has four basic shapes. Using optional H here does not reprioritize other shapes.")}</p>
<figure class="concepts-figure"><a href="./concepts/floor-half-brick-combinations.png" target="_blank" rel="noopener"><img src="./concepts/floor-half-brick-combinations.png" width="3000" height="2220" loading="lazy" alt="${t("三种完整两层房间透视：整砖A楼板、上半砖C楼板、下半砖B与缓坡H接门口；含墙窗、一格吊灯、家具，以及同尺寸的局部线框透视。", "Three full two-storey perspectives: A full slabs, C upper halves, and B lower halves joined to door landings with H ramps; windows, one-cell pendants, furniture and local perspective wireframes.")}" /></a><figcaption>${t("橙色H缓坡：一格内完成门口到半砖地板的0.5高差；所有格子共用世界坐标。", "Orange H ramp bridges the 0.5 height change within one cell, using shared world coordinates.")}</figcaption></figure>
<p><a href="./concepts/room-layout-definitions.md" download>${t("下载组合说明与形态依据", "Download assembly notes and shape references")}</a></p>
</section>
<section id="building-door" class="help-block">
<h2>${t("05 门 · 4格设计范围", "05 Doors · four-tile design envelope")}</h2>
<p><strong>${t("最新定义：门竖向占4格，是留给整套门发挥的设计空间。净洞、门扇、门框与机构可按门型分配，不固定为3格门洞＋1格实体门楣。", "Latest definition: four vertical tiles reserve space for the complete door assembly. Opening, leaf, frame and mechanisms vary by door type; a 3+1 split is not mandatory.")}</strong></p>
<table><tr><th>${t("类型", "Type")}</th><th>${t("空间与外观", "Space and appearance")}</th></tr>
<tr><td>${t("厚重门", "Heavy door")}</td><td>${t("允许厚门扇、宽门柱、厚上框或机构；具体厚度与开门方式另定。", "A substantial leaf, posts, upper frame and mechanisms; exact thickness and opening mechanism remain unspecified.")}</td></tr>
<tr><td>${t("能量门", "Energy door")}</td><td>${t("门框、发射器与能量屏障组成入口；不要求有实体门扇。", "A frame, emitters and energy barrier; a solid leaf is not required.")}</td></tr>
<tr><td>${t("3.5格高门", "3.5-tile tall door")}</td><td>${t("可按净洞3.5＋顶部0.5范围做门框；顶部仍属于门，0.5不要求全部填实。", "One option is a 3.5-tile clear opening with up to 0.5 for the upper frame; the entire upper region need not be solid.")}</td></tr></table>
<ul><li>${t("4格是安装和设计范围；实际外观、开启净空与关闭阻挡分别定义。顶部可以只做门框，不必补一块普通砖。", "Four tiles define the installation and design envelope. Appearance, open clearance and closed blocking are separate; the top may contain only a frame.")}</li><li>${t("左右镜像与侧边半格安装范围沿用；厚重不表示可以随意超出X/Z边界。门沿X通行，不改装成背景墙入口。", "Keep mirrored side mounting and half-cell installation bounds. A heavy appearance does not imply extra X/Z space; traversal remains along X.")}</li><li>${t("人物仍高3.1格、3.3头身；净高3.5示例留下0.4格站立外观余量，动画与碰撞仍需核对。三类门尚未在本次实现。", "The player remains 3.1 tiles tall at 3.3 heads. A 3.5-tile opening leaves 0.4 standing visual clearance; animation and collision still need verification. These variants are not implemented by this documentation change.")}</li></ul>
<p><a href="./concepts/room-layout-definitions.md" download>${t("下载房间与门的最新定义", "Download current room and door definitions")}</a></p>
<details><summary>${t("旧3＋1门图：仅作一种外观示例", "Previous 3+1 door: one appearance example")}</summary><figure class="concepts-figure"><a href="./concepts/building-door.png" target="_blank" rel="noopener"><img src="./concepts/building-door.png" width="2400" height="1500" loading="lazy" alt="${t("旧3＋1门型示例，不再规定所有门的净高与上框厚度。", "Previous 3+1 example, no longer a mandatory clearance and header split.")}" /></a></figure></details>
</section>
<section id="building-furniture" class="help-block">
<h2>${t("06 建筑物与家具定义", "06 Buildings and furniture")}</h2>
<p>${t("已确认先作为尺寸草案：床宽3×高1，共占3个XY格；桌宽3×高2，共占6个XY格。桌子“6格”不再解释成宽6格。", "Confirmed as draft dimensions: bed width 3 × height 1 occupies three XY cells; table width 3 × height 2 occupies six XY cells. Six cells does not mean a table six tiles wide.")}</p>
<ul><li>${t("家具定义至少包含：宽W×高H、锚点、允许朝向、外观深度、支撑要求、碰撞类型、交互范围。", "Record width×height, anchor, allowed orientation, visual depth, support requirements, collision category and interaction range.")}</li><li>${t("放置占格、外观轮廓、碰撞范围和交互范围分开；床桌不是把整个占格区域填满的实体砖。家具深度统一1格已确认，站立与穿行方式仍需分别定义。", "Placement occupancy, silhouette, collision and interaction are distinct. Furniture does not fill its entire placement region as a solid block, and its depth is confirmed as 1 tile; standing and pass-through behavior remain separate decisions.")}</li><li>${t("床3×1与桌3×2是可调整草案。床要结合躺卧姿态、桌子要结合坐姿或操作姿态检查；是否可穿过、是否可站在上面尚未定稿。", "Bed 3×1 and table 3×2 remain adjustable drafts. Check lying and sitting/operating poses; pass-through and stand-on-top behavior are not finalized.")}</li></ul>
<figure class="concepts-figure"><a href="./concepts/building-furniture.png" target="_blank" rel="noopener"><img src="./concepts/building-furniture.png" width="2400" height="1500" loading="lazy" alt="${t("已确认先作为尺寸草案：床宽3×高1，共占3个XY格；桌宽3×高2，共占6个XY格。桌子“6格”不再解释成宽6格。", "Confirmed as draft dimensions: bed width 3 × height 1 occupies three XY cells; table width 3 × height 2 occupies six XY cells. Six cells does not mean a table six tiles wide.")}" /></a><figcaption><a class="help-text-link" href="./concepts/building-furniture.png" target="_blank" rel="noopener">${t("打开建筑物与家具定义完整图", "Open full buildings and furniture diagram")} ↗</a></figcaption></figure>
</section>
<section id="furniture-spatial-cases" class="help-block">
<h2>${t("家具与人物 · 六种空间对照", "Furniture and player · six spatial cases")}</h2>
<p>${t("最新追加：床靠后占半格，与满深家具的几种站位一起比较。原深1图谱保留作基线，这六种摆法都为候选，尚未定稿。", "New: compare a rear half-depth bed with full-depth furniture. The depth-1 catalog remains the baseline; all six layouts are candidates.")}</p>
<p><a class="help-text-link" href="./?mode=resources&amp;scene=room#furniture-half">${t("打开可旋转透视场景 · 六种都看", "Open all six cases in the perspective scene")} ↗</a></p>
<table><tr><th>案例</th><th>观察重点</th></tr>
<tr><td>A 后半格床</td><td>床深0.5靠墙，人物在前半0.5；实际模型包络是否超界。</td></tr>
<tr><td>B 满深床旁</td><td>床深1，站侧边交互，保留左右操作空间。</td></tr>
<tr><td>C 站床上</td><td>站在共享床模型毯子表面0.85，人物仍高3.1。</td></tr>
<tr><td>D 直接穿模</td><td>满深床不阻挡，保留人物穿入家具的真实遮挡。</td></tr>
<tr><td>E 左右设施阻挡</td><td>左储物仓、右工作站，人站中间；家具用途和碰撞类型分开。</td></tr>
<tr><td>F 穿过时淡化</td><td>床与人物横向包围重叠时淡化到20%，离开恢复；仍非真实通道。</td></tr></table>
<p>${t("可以切正面/透视/俯视，打开方格与线框，拖动人物左右位置。人物保持3.1格且不压薄；界面显示可见网格的待机包络。滑杆是站位演示，不是正式碰撞或行走。", "Switch views, grid and wireframes, and move the player with the position slider. The player stays at 3.1 tiles without depth compression. Bounds are sampled from visible idle geometry; placement is not gameplay collision or walking.")}</p>
<p><a href="./concepts/furniture-definitions.md" download>下载完整家具与站位定义</a></p>
</section>
<section id="furniture-catalog" class="help-block">
<h2>${t("当前家具清单 · 透视与线框", "Current furniture · perspective and wireframes")}</h2>
<p>${t("以下为原深1家具图谱与清单；新增半深床及六种空间候选见上方对照，新增宽高仍为草案，可一键复制本节给LLM。", "The Chinese specification below proposes the current production list and draft dimensions; copy this section for an LLM.")} <a href="./concepts/furniture-definitions.md" download>${t("下载家具定义文档", "Download furniture specification")}</a></p>
<p>状态：依据当前经济与生存系统“阶段1”、已讨论的房屋与深度规则整理。分级是本次制作建议；家具深度统一1格已确认，新增宽高仍是概念提案，也未修改游戏模型、放置或碰撞。这里同时列出生活家具与功能设施，避免只画桌椅却遗漏支撑玩法的物件。</p>
<h3>1. 为什么需要这些物件</h3>
<p>当前循环是探索采集、机器人搬运与建造、电力供应、算力生产、闲置算力换Token、购买升级、夜间休息。因此第一批应覆盖休息、照明、算力、材料、电力、机器人停靠和交易。</p>
<p>建议第一批8类造型：床、吊灯、工作站、储物仓、机器人坞、蓄电池柜、交易终端、太阳能板。其中交易终端共用造型，但分别保留算力组件商和机器人技师两种标识及交互；太阳能板属于屋顶或室外设施。8类不等于开局只摆8件：开局太阳能板4块、交易终端两种，照明数量随房间布置而定。</p>
<p>普通桌椅不应成为工作站运行的额外前置条件；不照搬其他游戏的“桌+椅才能入住”判定。门、窗、背景墙、楼板与单向平台仍归建筑构件，不计入家具种类；机器人是活动角色，机器人坞才是设施。</p>
<h3>2. 1 必须做：第一批建议</h3>
<p>所有尺寸按宽X×高Y×深Z，单位为格；表中为放置包围，不代表整个体积填满或整块阻挡。数量和尺寸状态分别说明。</p>
<table>
<tr><th>编号</th><th>物件</th><th>当前用途</th><th>图示宽×高×深</th><th>尺寸状态</th><th>放置方式</th></tr>
<tr><td>01</td><td>床</td><td>夜里睡到天亮、回血</td><td>3×1×1</td><td>3×1为已有草案；深1已确认</td><td>贴实际地板顶面；躺卧姿态另定</td></tr>
<tr><td>02</td><td>吊灯</td><td>已要求的房间照明</td><td>1×1×1</td><td>宽1高1沿用最新房屋定义；深1已确认</td><td>顶部贴实际天花板底面，避开跳跃通口</td></tr>
<tr><td>03</td><td>算力工作站</td><td>通电产出算力、安装算力组件</td><td>2×2×1</td><td>宽高为新提案；深1已确认</td><td>主机、屏幕、操作台为一件；落地</td></tr>
<tr><td>04</td><td>储物仓 / 材料柜</td><td>木材石料存放、机器人卸货、仓库扩容</td><td>2×2×1</td><td>宽高为新提案；深1已确认</td><td>落地；沿用仓库职责，不另造个人箱子系统</td></tr>
<tr><td>05</td><td>机器人坞</td><td>停靠、充电、机器人管理</td><td>3×2×1</td><td>宽高为新提案；深1已确认</td><td>一件展示2机位；保留进出空间，升级入口交互另定</td></tr>
<tr><td>06</td><td>蓄电池柜</td><td>储能、夜间供电、并排扩容</td><td>1×2×1</td><td>宽高为新提案；深1已确认</td><td>落地；状态条表现电量，数值见经济系统</td></tr>
<tr><td>07</td><td>交易终端</td><td>算力组件商、机器人技师购买入口</td><td>1×2×1</td><td>宽高为新提案；深1已确认</td><td>同一造型两种配色和标识，两种职责不合并</td></tr>
<tr><td>08</td><td>太阳能板</td><td>初始发电与后续建造</td><td>1×0.5×1</td><td>整件占半格高，已确认；含底座与倾转范围</td><td>实心地面或屋顶支撑；踩踏倾转，离开后恢复追光；开局4块</td></tr>
</table>
<p>吊灯列入第一批是因为用户已要求房屋灯具，不意味着本次新增灯具耗电、开关或光照玩法。机器人坞不是一块填满3×2的实体砖；两个机位是功能容量与停靠展示，不自动等于两个不可穿过的碰撞盒。</p>
<figure class="concepts-figure"><a href="./concepts/furniture-essential-home.png" target="_blank" rel="noopener"><img src="./concepts/furniture-essential-home.png" width="2500" height="2100" loading="lazy" alt="第一批家具透视与线框：床3×1、吊灯1×1、工作站2×2、储物仓2×2；家具深1已确认，新增宽高为提案。" /></a><figcaption><a href="./concepts/furniture-essential-home.png" target="_blank" rel="noopener">打开完整透视与线框图 ↗</a></figcaption></figure>
<figure class="concepts-figure"><a href="./concepts/furniture-essential-systems.png" target="_blank" rel="noopener"><img src="./concepts/furniture-essential-systems.png" width="2500" height="2100" loading="lazy" alt="功能设施透视与线框：机器人坞3×2、蓄电池柜1×2、交易终端1×2、太阳能板1×0.5；家具深1已确认，新增宽高为提案。" /></a><figcaption><a href="./concepts/furniture-essential-systems.png" target="_blank" rel="noopener">打开完整透视与线框图 ↗</a></figcaption></figure>
<h3>3. 2 选做：先有用途，再制作</h3>
<table>
<tr><th>编号</th><th>物件</th><th>图示宽×高×深</th><th>说明</th></tr>
<tr><td>09</td><td>普通桌</td><td>3×2×1</td><td>3×2沿用已有放置草案，深1已确认；台面高1.2仅示例，上方为空，不等于2格高实心桌</td></tr>
<tr><td>10</td><td>椅子</td><td>1×2×1</td><td>宽高为新提案；深1已确认；座面高0.7仅示例，坐姿、动画与交互未定</td></tr>
<tr><td>11</td><td>置物架</td><td>2×2×1</td><td>宽高为新提案；深1已确认；先作装饰，不与功能储物仓重复增加库存系统</td></tr>
<tr><td>12</td><td>盆栽</td><td>1×2×1</td><td>此为原静态陈设方案；活植物生长见<a href="#natural-bonsai">植物类 · 盆景与盆栽</a>。宽高为新提案；深1已确认；纯装饰，不引入种植、浇水和收获玩法</td></tr>
</table>
<figure class="concepts-figure"><a href="./concepts/furniture-optional.png" target="_blank" rel="noopener"><img src="./concepts/furniture-optional.png" width="2500" height="2100" loading="lazy" alt="选做家具透视与线框：普通桌3×2、椅子1×2、置物架2×2、盆栽1×2；图示放置范围不等于实心碰撞。" /></a><figcaption><a href="./concepts/furniture-optional.png" target="_blank" rel="noopener">打开完整透视与线框图 ↗</a></figcaption></figure>
<h3>4. 3 当前不重要：暂不制作</h3>
<ul><li>厨房、灶台、冰箱：阶段1不包含食物系统；后续若启用料理，再结合厨师职责决定是否要独立家具。</li><li>衣柜、梳妆台、浴室与卫生设施：当前没有需要它们的家居玩法，不建立新的生存指标。</li><li>地毯、挂画、成套沙发及大量花色：先保留可能用途，不画全套、不要求全部支持。</li><li>独立制造工坊、机柜、集群、核电等属于后续功能设施，后续系统启用时重新分级，不能把“当前不做”理解为永久无用。阶段1由机器人承担建造，不为每个制造动作新增一件桌台。</li></ul>
<h3>5. 格子、深度与支撑</h3>
<ul><li>游戏逻辑仍为XY二维，家具用三维几何表现；X左右、Y上下、Z前后。</li><li>中间实体空间深1：Z=[−0.5,+0.5]；内沿与外延各额外预留0.5；墙厚0.2，在外延区。背景墙仍宽1高1，不随家具尺寸缩边。</li><li><strong>家具深度统一1格，已确认</strong>。图中深度包围为Z=[−0.5,+0.5]，占中间1格；前后不再另留人物通道。家具的深度包围不表示腿、吊杆等每个部件都填满1格。平台仍按自身0.75/0.5深度选型，不能套用到家具。</li><li>家具实际轮廓不能穿入背景墙。预留区可给花草及特殊物品，但本批落地设施不默认挤占预留区。</li><li>床、桌和设备底面贴所放楼板的实际顶面；整砖或半砖都按实际支撑高度摆放，不强迫家具回到整数Y。</li><li>吊灯宽高1×1包含底座、吊杆、灯罩；安装在天花板实际底面，不把灯具自身高度和屋顶格子合并。</li><li>2格宽层间通口及平台上方通行空间保持可用，家具不摆进通口。人物外观高3.1，碰撞宽0.8高2.8；3.3头身不是占高3.3格。</li><li>床3格长接近人物外观高3.1：床长含床头，真正可躺面更短，因此床3×1继续标草案，不能声称已经通过躺卧姿态验收。后续用原图躺姿核对后再定床垫长度。</li></ul>
<h3>6. 放置范围、外观、碰撞、交互分别定义</h3>
<p>每件需记录：ID、用途、放置宽高、外观深度、锚点、实际支撑面、朝向、碰撞类型、交互范围、资源状态。包围盒只用于尺寸与摆放讨论，不自动生成实心碰撞。</p>
<p>家具深1不自动决定碰撞规则。阻挡、站立、穿行和状态变化尚未定稿；必须结合下面的站位方案决定。床不自动是跳跃平台，桌下空隙不表示角色能钻过去。关闭碰撞也不会消除三维模型的穿插。</p>
<p>最少表现建议：工作站开机/断电；蓄电池电量条；机器人坞空闲/停靠/充电；交易终端两种身份；太阳能板昼夜状态。复用同一基础造型的状态变化，不为每个状态制作新家具类别。床的睡眠交互与人物躺姿另行验证。</p>
<h3>7. 满深家具与人物站位（方案待确认）</h3>
<p>已确认：家具深1、人物外观高3.1格、3.3头身比例不变。若床垫等不透明部件占满中间深度，人物在相同X、Y处便没有真实的前后绕行通道；这是空间冲突，不能只靠关闭碰撞解决。</p>
<table>
<tr><th>站位方式</th><th>空间含义</th><th>当前建议与限制</th></tr>
<tr><td>站在家具左边或右边</td><td>人物与家具分处不同X位置，共用同一地板</td><td>优先方案：在侧边留操作位置，站在旁边交互；碰撞宽0.8，可先用约1格侧边空间示意，仍需核对外观与交互范围</td></tr>
<tr><td>站在家具上面</td><td>人物脚底落在实际可支撑表面</td><td>可针对床、桌单独讨论；本图床垫约高0.78、床头高1，桌面高1.2，并非按放置盒顶面站立；需检查头顶净空与跳跃路线</td></tr>
<tr><td>穿过家具的二维占格</td><td>XY不阻挡，但人物与三维家具可能占同一空间</td><td>必须另外设计前后显示层、局部遮挡或淡化等表现；这属于视觉处理，不是真实的一条通道，当前不作为已确认规则</td></tr>
</table>
<p>建议先采用“侧边站立交互”，仅对选定的低矮家具开放顶部站立。净高5的房间里，床垫示例高0.78加人物3.1可以容纳；若站在2格高柜顶，外观总高5.1会碰到天花板，不能把所有家具都设为可站立平台。</p>
<p>内沿、外延各0.5仍用于花草和特殊物品，不自动改成人物走道。若想要“人自由从满深床前走过，同时画面没有穿插”，需要重新定义显示层或增加空间规则，不能同时保持所有几何体在原位置又要求它们互不相交。坐卧时可以进入独立交互姿态，但这不等于普通站立通行。</p>
<h3>8. 资料依据与实现边界</h3>
<ul><li><code>docs/economy.md</code>：阶段1的开局、包含系统、美术需求；完整经济设定是设计资料，不把其中所有后期物件纳入本轮。</li><li><code>docs/room-layout-definitions.md</code>：床3×1、桌3×2草案，最新吊灯1×1，人物尺寸、通口避让与实际支撑面。</li><li><code>docs/depth-definitions.md</code>、<code>docs/platform-definitions.md</code>：实体、墙和预留区；家具深度与平台规则分别处理。</li><li><code>src/render/homestead-view.ts</code>已有工作站、仓库、机器人坞、蓄电池、交易终端等简化表现；<code>src/config/homestead.ts</code>及<code>src/sim/homestead.ts</code>已有相关配置和设施。现有设施尺寸不等于本批提案尺寸，本次不覆盖运行时模型。</li></ul>
<p>三张图由本地Python绘制，每件附实体透视与同镜头线框，所有对象共享相机和单位尺度。已做构件包络与相机正交基校验；尚未做角色坐卧动画、实际放置、碰撞和交互验收。图谱有12类不等于12类全部必须支持。</p>
</section>
<section id="solar-grid-and-load" class="help-block">
<h2>${t("半格太阳能板 · 占格、踩踏与追光", "Half-height solar panel · Grid, load and tracking")}</h2>
<p>${t("已确认：整件宽1、高0.5、深1格，含底座、转轴与整块面板的倾转范围；支撑砖独立。半格指物件高度，面板表面的小格是电池分格。", "Approved: the whole object occupies 1 × 0.5 × 1 tiles, including its base, pivot and tilting panel envelope. The support tile is separate; the small cells on the panel are surface subdivisions.")}</p>
<p>${t("放在整砖上，占上方格子的下半格；放在下半砖上，补齐同一格的上半格。玩家踩左侧时左端下沉，踩右侧时右端下沉；离开后逐渐恢复朝向当前太阳。", "On a full tile it occupies the lower half of the tile above; on a lower half tile it fills the upper half. The left or right edge lowers under the player's weight, and the panel gradually returns toward the current sun after they leave.")}</p>
<p>${t("居中板面Z=[−0.5,+0.5]；内沿与外延将板面偏移0.5格，分别Z=[−1,0]和Z=[0,+1]，板深始终1。底座留在中央实体上，由斜支架承接悬挑板面；安装需避开墙体。图中角度与恢复速度不是最终调参。", "The centered panel spans Z=[−0.5,+0.5]. Inner and outer mounts shift the panel by 0.5 tile to Z=[−1,0] or Z=[0,+1], retaining depth 1. The base remains on the central solid tile, with an angled bracket supporting the overhang; installation must clear walls. Illustrated angles and recovery speed are not final tuning.")}</p>
<p><a class="help-text-link" href="./?mode=resources&amp;scene=room#solar">${t("进入透视场景 · 太阳能板踩踏与追光", "Open perspective scene · Solar load and tracking")} →</a></p>
<figure class="concepts-figure"><a href="./concepts/solar-grid-and-load-perspective.png" target="_blank" rel="noopener"><img src="./concepts/solar-grid-and-load-perspective.png" width="3400" height="2720" loading="lazy" alt="${t("Python线框透视：太阳能板宽1高0.5深1、整砖和半砖支撑、内沿外延摆放候选，以及踩踏倾转后恢复追光。", "Python perspective wireframe: 1 × 0.5 × 1 solar panel, full and half tile supports, depth-offset candidates, player load and recovery toward the sun.")}" /></a><figcaption><a class="help-text-link" href="./concepts/solar-grid-and-load-perspective.png" target="_blank" rel="noopener">${t("打开已确认线框原图", "Open approved wireframe")} ↗</a></figcaption></figure>
</section>
<section id="natural-space" class="help-block">${NATURAL_SPATIAL_DOCUMENT}</section>
<section id="natural-resources" class="help-block">
<p><a href="#natural-space">先看：青苔、前延半格、树木占格与矿脉岩层透视 →</a></p>
<h2>${t("植物、生长物与矿脉定义", "Plants, growth and ore veins")}</h2>
<p>${t("补齐花草、灌木、盆景、树木与矿脉的透视、占位和生命周期。图示尺寸为草案；树木自然再生与矿点有限分别处理。", "Perspective, occupancy and lifecycle definitions for grass, flowers, shrubs, potted plants, trees and ore veins. Dimensions are proposals; tree regrowth and finite mineral deposits are separate rules.")}</p>
<p>六类植物基础图共33个状态，下垂变体另21个状态，矿脉另3个状态；青苔四形、藤蔓十二形、下垂植物六形及正背面透视，可独立复制给LLM。</p>
<p><a href="#natural-grass">地被与草丛</a> · <a href="#natural-flower">花卉与草本</a> · <a href="#natural-shrub">灌木与野果丛</a> · <a href="#natural-bonsai">盆景与盆栽</a> · <a href="#natural-tree">树木</a> · <a href="#natural-vine">藤蔓与贴面植物</a> · <a href="#natural-drooping">下垂植物</a> · <a href="#natural-rock">岩土地形组合</a> · <a href="#natural-ore">矿脉</a></p>
<details><summary>展开早期形体总览与共同定义（草花位置以新空间图为准）</summary>
<figure class="concepts-figure"><a href="./concepts/natural-resources-perspective.png" target="_blank" rel="noopener"><img src="./concepts/natural-resources-perspective.png" width="2400" height="2700" loading="lazy" alt="六类自然资源的实体透视与同镜头线框：草丛、花卉、灌木、盆景、树木和矿脉，附宽高深、Z范围与各卡1格标尺；小物按卡片放大，尺寸为草案。" /></a><figcaption>早期形体参考 · 草花旧Z位置已修订，矿脉省略围岩；空间摆放请看上方新图。包围盒不等于实心碰撞。</figcaption></figure>
<figure class="concepts-figure"><a href="./concepts/natural-resources-depth.png" target="_blank" rel="noopener"><img src="./concepts/natural-resources-depth.png" width="2400" height="1430" loading="lazy" alt="植物根部、中央实体及内外预留区的等比例YZ剖面；墙厚0.2，枝叶可伸出但根部必须承托。右侧区分植物生长状态与有限矿脉开采状态。" /></a><figcaption>图2 · 深度、支撑与生长/采集状态；新增状态规则为草案，尚未实现。</figcaption></figure>
<p><a class="help-text-link" href="./concepts/natural-resource-definitions.md" target="_blank" rel="noopener">打开完整定义文档 ↗</a></p>
${NATURAL_RESOURCE_DOCUMENT}
</details>
</section>
${NATURAL_RESOURCE_STATES}
<section id="liquid-display" class="help-block">
<h2>${t("液体 · 水位与透明度", "Liquids · level and transparency")}</h2>
<p>${t("单独场景和大场景都已加入三个剖面水池。从左到右净宽各4格、水深约0.5／2／3格，使用清澈、翡翠、深蓝色板。这是同一种水的三种外观，不是三类液体。", "Both scenes include three cutaway pools, each four tiles wide and approximately 0.5, 2 and 3 tiles deep, using clear, emerald and deep-blue palettes of the same water.")}</p>
<p><a href="./?mode=resources&amp;scene=room#liquids">${t("打开单独液体展示", "Open isolated liquid display")} ↗</a> · <a href="./?mode=resources&amp;scene=settlement#liquids">${t("打开大场景水池", "Open settlement pools")} ↗</a></p>
<ul><li>${t("水体复用游戏FluidMap与水材质，有动态波动、透明度和深浅着色；半格液位由128/255≈0.502表示。", "Water reuses the game FluidMap and materials, including waves, transparency and depth shading. The half level is represented by 128/255, approximately 0.502.")}</li><li>${t("每池外宽6，三池共18格；实体深1，完整水体Z包围装配在这1格内，背景墙完整1×1×0.2。Y水深与Z表现深度分开。", "Each container is six tiles wide, for 18 total. Solids and the assembled water envelope have Z depth 1; rear panels remain 1×1×0.2. Y water depth and Z visual depth are separate.")}</li><li>${t("可以切正面、斜视、俯视和线框。当前有池壁碰撞，水只作展示，未接游泳、浮力、溢流、流动或入水水花；未新增熔岩等液体玩法。", "Inspect front, oblique, top and wireframe views. Pool walls collide, but these display pools do not yet provide swimming, buoyancy, overflow, flow or entry splashes; no new lava gameplay is added.")}</li></ul>
<p><a href="./concepts/liquid-display-definitions.md" download>${t("下载液体展示定义", "Download liquid display definitions")}</a></p>
</section>
<section id="building-legacy" class="help-block"><h2>${t("旧实现与历史图对照", "Legacy implementation and diagram reference")}</h2><details><summary>${t("展开旧资料（1.5 / 0.9 等旧深度不作为新规范）", "Expand legacy materials (old depths 1.5 / 0.9 are not new design rules)")}</summary><p class="concepts-note">${t("以下保留已有实现和早期讨论的原始记录，若与上方六类新定义冲突，以上方新定义为准。", "These are original records of prior implementation and discussions. When they conflict with the six new definitions above, use the new definitions.")}</p>
          <a class="help-text-link" href="./?mode=resources&amp;scene=room">${t('透视 · 单独场景', 'Perspective · Individual scenes')} ↗</a>
          <a class="help-text-link" href="./?mode=resources&amp;scene=settlement">${t('透视 · 大场景', 'Perspective · Complete scene')} ↗</a>
          <p>${t('当前房间试摆采用齐地形变体：地板、侧墙、屋顶及一体门的前后沿统一为Z=−1至+0.5，正面敞开。门外侧齐房屋右边界，门上方一格属于薄门楣，不再单独堆一块厚砖。下方较早的尺寸图仍用于说明基础门与标准建筑格。', 'The current room preview uses terrain-aligned variants: floor, side wall, roof and integrated door share Z=−1 to +0.5, with an open front. The door aligns with the right outer boundary; its upper tile is an integrated thin lintel. Earlier diagrams below still document the basic door and standard building block.')}</p>
          <p>${t('以下记录当前构件库的实现尺寸，不代表前后沿与安装位置已经统一。先写宽 × 高，厚度独立列出，单位均为世界格；建筑构件的局部 Z 范围不能直接当作最终世界位置。', 'These are current component dimensions, not finalized alignment or installation rules. Width × height and depth are listed separately in world units; a component’s local Z range is not its final world placement.')}</p>
          <p><a class="help-text-link" href="#building-house">${t("查看最新房间透视：净宽9格、吊灯与墙窗", "View the latest room: width 9, pendant and window")} →</a></p>
          <p>${t('本次按单个横版房间绘制，取消二层和楼层平台。主图安装左门、右侧封墙；右门是镜像安装选项，不是第二个房间。借鉴泰拉瑞亚房间中实体边界、背景墙和入口分开的组织方式，不套用其NPC住房面积判定。本次将“7格高”按房间外轮廓总高处理：底板1格、室内净高5格、顶板1格。室内示例净宽6格，人物外观仍高3.1格。', 'This revision shows one side-view room, without a second storey or upper platform. The main view has a left door and solid right wall; the right-door variant is a mirrored option, not another room. It borrows the separation of solid boundaries, rear walls and entrances from Terraria-style rooms, without applying NPC housing-area rules. Seven tiles high is interpreted as total exterior height: floor 1, clear interior 5 and roof 1. Illustrative interior width stays 6 and character visual height remains 3.1.')}</p>
          <ul>
            <li>${t('前沿与封闭边界：地板、封闭侧墙和屋顶按格铺满，它们与前门柱的结构前沿统一到Z=+0.5。面向镜头的一面敞开以显示室内，背景墙铺在后侧，不把房间正面封死。', 'Front alignment and enclosure: floor, closed side wall and roof use full cells, aligned with the front portal post at Z=+0.5. The camera-facing side stays open to show the interior, while the rear wall covers the back.')}</li>
            <li>${t('半格解释：本图将“留半个”按X左右方向处理。侧边一格分成外侧0.5格安装区和内侧0.5格留空区；左门靠左外沿、右半格留空，右门靠右外沿、左半格留空。门框仍厚0.14格，半格不是实心门厚度。', 'Half-cell interpretation: half a tile is measured along X. A side column has an outer 0.5 mounting region and an inner 0.5 empty region. The left portal hugs the left exterior edge and leaves the right half empty; the right portal mirrors this. Frame thickness remains 0.14, not a solid half-cell thickness.')}</li>
            <li>${t('一体模块：门洞独立净高3格，上方1×1门楣与门框连为一个构件，模块宽1格、总高4格；门洞y=0至3，一体门楣y=3至4。再往上y=4至5补普通墙格，y=5至6是屋顶；底板y=−1至0，房间总高仍为7格。门无凸起门槛，左右版本同尺寸镜像，门高不随房间净高拉伸。', 'Integrated module: a three-high clear opening and its 1×1 lintel form a one-wide, four-high assembly. The opening spans y=0 to 3 and lintel y=3 to 4. An ordinary wall tile fills y=4 to 5 below the roof at y=5 to 6. The floor at y=−1 to 0 keeps total room height at seven. There is no raised threshold. Both variants are mirrored; door height does not stretch with room height.')}</li>
            <li>${t('空间与状态：房体深1.5格、门沿Z跨度1.4格、背景墙厚0.14格，属于沿用的空间示意。门沿X穿过，不装在后墙上。家具按后侧装饰示意。此次只更新概念图与文档，本图三格净洞与一体模块属于修正方案，本次未修改游戏模型。人物碰撞高2.8格，外观3.1格的发梢余量还需协调；下方旧图记录原构件尺寸。', 'Space and status: the illustration retains room depth 1.5, portal Z span 1.4 and rear-wall thickness 0.14. Traversal follows X; the doorway is not on the rear wall. Furniture remains rear decoration. Only the concept image and documentation change; the three-high clear opening and integrated assembly remain a corrective proposal, with no game model changes in this revision. Collision height is 2.8; the 3.1-high visual silhouette still needs hair clearance coordination. Older diagrams below document the existing component dimensions.')}</li>
          </ul>
          <h3>${t('房间空间线框图', 'Room wireframe perspective')}</h3>
          <figure class="concepts-figure">
            <a href="./concepts/room-space-wireframe.png" target="_blank" rel="noopener"><img src="./concepts/room-space-wireframe.png" width="2400" height="1700" loading="lazy" alt="${t('房间线框透视及XZ俯视图：示例内宽6格、高4格；地板深1.5格为当前实现、待设计确认。后侧背景墙厚0.14格，安装位置为示例；右侧薄门框沿X厚0.14格，外高3格、Z前后跨度1.4格；沿X通行，跨度不是门厚。屋顶和近侧敞开观察，斜上方镜头不是游戏镜头。', 'Room wireframe and XZ plan: illustrative 6-tile interior width and 4-tile height; current 1.5-tile floor depth remains unconfirmed design. Rear wall is 0.14 thick with illustrative placement; the current right-side thin frame is 0.14 thick along X, 3 high and spans 1.4 along Z; travel is along X, and the Z span is not door thickness. Roof and front are cut away; the inspection camera differs from gameplay.')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/room-space-wireframe.png" target="_blank" rel="noopener">${t('打开房间空间线框图', 'Open room wireframe perspective')} ↗</a></figcaption>
          </figure>
          <p>${t('本图单独展示房间的地板、侧墙、背景墙和门框。6×4 是示例房间大小，背景墙安装位置也为说明方案；1.5 格是当前地形深度，尚未作为最终设计确认。门沿 X 通行，背景墙在后侧。共享门构件已改薄，X 厚度为 0.14 格，Z 前后跨度仍为 1.4 格；两者不能混叫门深。图与共享门模型尺寸已同步；原门净高不足和通行未接入的问题仍保留。', 'This diagram shows the floor, side wall, rear wall and door frame together. The 6×4 interior and wall placement are illustrative; the current 1.5-tile terrain depth is not a finalized design choice. The shared door model now uses a thin frame with X thickness 0.14 and Z span 1.4. Travel is along X with the background wall behind; Z span is not door thickness. Diagram and runtime dimensions agree; insufficient clearance and missing traversal integration remain noted.')}</p>
          <h3>${t('现行构件尺寸：门已改为薄框', 'Current component dimensions: thin door frame')}</h3>
          <figure class="concepts-figure">
            <a href="./concepts/tile-wall-door-depth.png" target="_blank" rel="noopener"><img src="./concepts/tile-wall-door-depth.png" width="2400" height="1900" loading="lazy" alt="${t('横版空间校准图：真实正面镜头下的瓦片与主角侧面原图；自然砖1.5、建筑格0.9、墙板0.14、门1.4的同尺厚度比较，分别标注世界与局部坐标；门的XZ俯视与YZ剖面，净高约2.64小于碰撞高2.8', 'Calibrated side-scroller space: actual frontal tile projection with original protagonist side art; shared-scale depth comparison separates world and local coordinates; XZ door plan and YZ section show approximately 2.64 clearance versus 2.8 collision height')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/tile-wall-door-depth.png" target="_blank" rel="noopener">${t('打开格子、墙体与门概念图', 'Open the tile, wall and door guide')} ↗</a></figcaption>
          </figure>
          <p>${t('正面都是 1×1 格，不代表厚度相同：自然地形从 Z=−1 到 +0.5，纵深 1.5；建筑实心格深 0.9；建筑背景墙板厚 0.14。洞穴背景墙则是 Z=−1.01 的独立平面，不等同于建筑墙板。建筑墙板的最终世界 Z 位置待统一；自然地形、建筑格与门的前后沿也不能假定已经对齐。墙层与实心碰撞层分开。', 'Matching 1×1 front faces do not imply matching depth: natural terrain spans Z=−1 to +0.5 (depth 1.5), building blocks are 0.9 deep, and wall panels are 0.14 thick. Cave backwalls instead use a separate plane at Z=−1.01. The building wall’s final world Z is not yet unified, and natural terrain, building blocks and doors must not be assumed to share aligned faces. Background walls and solid collision layers are separate.')}</p>
          <h3>${t('房间空间透视：门与背景墙', 'Room perspective: door and back wall')}</h3>
          <figure class="concepts-figure">
            <a href="./concepts/room-space-perspective.png" target="_blank" rel="noopener"><img src="./concepts/room-space-perspective.png" width="2400" height="1700" loading="lazy" alt="${t('房间剖开透视与XZ俯视图：示例内宽6格、高4格，地板深1.5格；背景墙在后侧、厚0.14格；右侧门X厚0.14格、外高3格、Z跨度1.4格，沿X穿过；屋顶与前侧敞开以展示空间', 'Cutaway room perspective and XZ plan: illustrative interior width 6 and height 4, floor depth 1.5, rear wall thickness 0.14, and a right-side door 0.14 thick along X, 3 high and spanning 1.4 along Z for travel along X; roof and front are exposed for inspection')}" /></a>
            <figcaption><a class="help-text-link" href="./concepts/room-space-perspective.png" target="_blank" rel="noopener">${t('打开薄门框房间透视图', 'Open the thin-frame room perspective diagram')} ↗</a></figcaption>
          </figure>
          <p>${t('这是一张独立空间说明图，采用斜上方观察角度以看清内部，不代表正常游戏镜头。6×4 是示例房间；背景墙内表面临时放在 Z=−1、墙厚0.14，地板沿用当前深度1.5。门位于右侧，玩家沿X通行，不能把门画成走向背景墙的入口。房间布局、墙的安装位置与最终深度尚未定稿；门的净空问题仍需调整。', 'This standalone spatial diagram uses an elevated inspection angle, not the gameplay camera. The 6×4 room is illustrative; the rear wall inner face is provisionally at Z=−1 with thickness 0.14, and the floor uses the current depth of 1.5. The right-side door is traversed along X, not toward the back wall. Room layout, wall installation and final depth remain provisional; door clearance still requires adjustment.')}</p>
          <dl class="concepts-definitions">${buildings.map(([label, value, description]) => `<div><dt>${label}</dt><dd><strong>${value}</strong><p>${description}</p></dd></div>`).join('')}</dl>
          <p class="concepts-note">${t('门的 0.14×3×1.4 是整体包络，不能当作净通行空间。门洞与能量屏障位于 YZ 平面，角色沿 X 左右穿过；开启只移除能量膜。现有模型主框的竖向净空约 2.64 格，内槽还略占空间，小于人形碰撞高度 2.8 格；目前属于构件预览，通行逻辑尚未接入，接入前需统一门净空与碰撞。主角仍按 3.3 头身参照、3.1 格外观高度和 0.8×2.8 格碰撞范围分别说明。', 'The door’s 0.14×3×1.4 dimensions are its outer envelope, not clear passage dimensions. Its opening and energy screen lie in YZ, with travel along X; opening removes only the screen. The current main frame has approximately 2.64 tiles of vertical clearance, with additional inner trim, less than the human collision height of 2.8. This is a component preview; traversal is not integrated and clearance must be reconciled before integration. The protagonist retains separate references of 3.3 heads, 3.1 tiles visual height and 0.8×2.8 collision bounds.')}</p>
          <p class="concepts-note">${t('构件预览不等于全部已接入玩家建造。当前家园概念版的建造指令范围是太阳能板和仓库扩容。', 'Component previews do not imply that every component is player-buildable. Current homestead construction commands cover solar panels and storage expansion.')}</p>
          <a class="help-text-link" href="./?mode=resources">${t('查看场景资源与建筑构件', 'View scene resources and components')} ↗</a>
        </details></section>
        <section id="concept-regions" class="help-block">
          <p class="home-eyebrow">07 / WORLD REGIONS</p><h2>${t('自然区域与算力设施', 'Natural regions and compute facilities')}</h2>
          <p>${t('自然世界包含草地、林地、湖泊与岸边、沙漠、洞穴和浮岛。资源展示按生长环境、植被分层和种子变化组织；平地、土丘、沟壑、台阶、裂隙与洞口共同构成行走和探索路线。', 'The natural world includes grasslands, woods, lakes and shores, deserts, caves and floating islands. Resources are organized by habitat, vegetation layer and seed variation. Flats, hills, gullies, steps, fissures and cave mouths shape exploration routes.')}</p>
          <dl class="concepts-definitions">
            <div><dt>${t('山体算力堡垒', 'Mountain fortress')}</dt><dd><strong>${t('黑洞前哨 · 三层机房 · 屋顶冷却阵列', 'Black-hole outpost · server floors · rooftop cooling')}</strong><p>${t('自然石墙、苔藓与工业结构逐步过渡，第一章采用远城、河面与近处屋顶的分层背景。主线试玩从这里展开。', 'Stone walls and moss transition into industrial structures. The first chapter layers a distant city, river and nearby roofs; the playable story begins here.')}</p><a class="help-text-link" href="./?mode=game&amp;level=facility&amp;scene=fortress">${t('自由探索堡垒', 'Explore the fortress')} ↗</a></dd></div>
            <div><dt>${t('算力大教堂', 'Compute cathedral')}</dt><dd><strong>${t('五组算力塔 · 中央大厅 · 侧翼楼台', 'Five compute towers · central hall · side platforms')}</strong><p>${t('围绕中央场地组织巨型计算设施，当前提供场景自由探索。', 'Large compute structures surround a central arena. Currently available as a freely explorable scene.')}</p><a class="help-text-link" href="./?mode=game&amp;level=facility&amp;scene=cathedral">${t('自由探索大教堂', 'Explore the cathedral')} ↗</a></dd></div>
            <div><dt>${t('光纤深渊', 'Fiber abyss')}</dt><dd><strong>${t('悬空主桥 · 冷却深井 · 网络核心', 'Suspended bridge · cooling shafts · network core')}</strong><p>${t('以跨井桥面、断桥和深井设施组织纵向空间，当前提供场景自由探索。', 'Bridges, gaps and deep-shaft facilities organize vertical space. Currently available as a freely explorable scene.')}</p><a class="help-text-link" href="./?mode=game&amp;level=facility&amp;scene=abyss">${t('自由探索深渊', 'Explore the abyss')} ↗</a></dd></div>
          </dl>
          <div class="help-about-links"><a href="./?mode=game">${t('自然自由世界', 'Natural free world')} ↗</a><a href="./?mode=lab">${t('场景组合与形态对照', 'Scene and shape comparisons')} ↗</a><a href="./?mode=story">${t('主线试玩', 'Playable story')} ↗</a></div>
        </section>
        <section id="concept-sources" class="help-block">
          <p class="home-eyebrow">08 / ARTWORK & SOURCES</p><h2>${t('原图与设定资料来源', 'Original artwork and design sources')}</h2>
          <p>${t('使用 D1 无装备概念原图。下面保留原图完整画幅，点击可查看原尺寸；此处不作为标尺对齐图。', 'D1 artwork without equipment. The complete original canvases are shown below; open either image at full size. These previews are not ruler-aligned comparisons.')}</p>
          <div class="concepts-originals">
            <figure class="concepts-figure"><a href="./concepts/protagonist-front.png" target="_blank" rel="noopener"><img src="./concepts/protagonist-front.png" loading="lazy" alt="${t('主角 D1 无装备正面原图', 'Original front view of the D1 protagonist without equipment')}" /></a><figcaption><a class="help-text-link" href="./concepts/protagonist-front.png" target="_blank" rel="noopener">${t('正面原图', 'Front artwork')} ↗</a></figcaption></figure>
            <figure class="concepts-figure"><a href="./concepts/protagonist-right.png" target="_blank" rel="noopener"><img src="./concepts/protagonist-right.png" loading="lazy" alt="${t('主角 D1 无装备右侧原图', 'Original right-side view of the D1 protagonist without equipment')}" /></a><figcaption><a class="help-text-link" href="./concepts/protagonist-right.png" target="_blank" rel="noopener">${t('右侧原图', 'Right-side artwork')} ↗</a></figcaption></figure>
          </div>
          <div class="help-faq"><details><summary>${t('查看本页资料依据', 'View the sources behind this page')}</summary><p>${t('世界与试玩范围：', 'World and playable scope: ')}<code>README.md</code><br />${t('经济与生存草案：', 'Economy and survival draft: ')}<code>docs/economy.md</code><br />${t('构件尺寸与形态：', 'Component dimensions and variants: ')}<code>src/config/building-kit.ts</code> · <code>src/render/building-kit.ts</code><br />${t('当前家园数值与行为：', 'Current homestead values and behavior: ')}<code>src/config/homestead.ts</code> · <code>src/sim/homestead.ts</code> · <code>src/sim/homestead-economy.ts</code><br />${t('场景与地形：', 'Scenes and terrain: ')}<code>src/config/scene-demos.ts</code> · <code>src/config/facility-scenes.ts</code> · <code>src/world/tile-shapes.ts</code><br />${t('原图：', 'Original artwork: ')}<code>assets/characters/grassy/customization/female/concepts/d1-no-gear/individual/</code><br />${t('制图与比例记录：', 'Scale artwork and records: ')}<code>assets/concepts/character-tile-scale/local-drawing/</code></p></details></div>
        </section>
        <article id="concept-economy" class="concepts-system-document">
          <header class="help-block">
            <p class="home-eyebrow">SYSTEMS / ECONOMY & SURVIVAL</p><h2>${t('经济与生存系统', 'Economy & survival')}</h2>
            <p>${t('下面收录经济与生存设计文档的完整 20 章，适用于家园方向。左侧目录可直接进入电力、算力、机器人、战斗装备、NPC 与城镇等系统。原文保留草案状态与待选项，以便继续讨论。', 'The complete 20-chapter economy and survival design follows, covering the homestead direction. Navigate directly to power, compute, robots, combat, equipment or NPCs. The source is preserved in Chinese, including its draft status and open decisions.')}</p>
            <p>${t('本页收录快照：2026-10-09；源文档后续变更需同步整理。', 'Document snapshot: 2026-10-09. Future source changes require updating this page.')} <a class="help-text-link" href="./concepts/economy.md" target="_blank" rel="noopener">${t('查看原始 Markdown', 'View source Markdown')} ↗</a></p>
            <div class="concepts-note"><p><strong>${t('当前概念版与原草案的差异', 'Current concept version versus the draft')}</strong></p><p>${t('现行配置：大招从空充满耗 1 电·时，新增蓄电池价格 80M。原文的 30M 电池价格、首日收益估算和文末待选项保留为讨论记录，不代表当前价格或最终平衡。', 'Current configuration: one full ultimate charge costs 1 energy-hour; an additional battery costs 80M. The source’s 30M battery price, first-day projections and open decisions are retained as discussion records, not current pricing or final balance.')}</p><p>${t('当前基础算力 2P，通电工作站另供 4P；开局 4 块太阳能板，每块白天功率 1，一组电池容量 10 电·时、最大输出 1。1P 闲置 1 游戏小时 = 1M，1 现实分钟 = 1 游戏小时，一天 24 分钟。生产优先为机器人追加算力，收益优先保留更多闲置算力。', 'Base compute is 2P, plus 4P from a powered workstation. Start with four solar panels providing one power unit each by day, and a battery with 10 energy-hours of capacity and one unit of output. One idle P for one game hour yields 1M. One real minute equals one game hour; a day lasts 24 minutes. Production priority allocates extra compute to robots; revenue priority keeps more compute idle.')}</p><p>${t('Lv1 分配 1–2P、地形落差上限 2 格、载重 5；Lv2 为 2–4P、5 格、载重 15。机器人负责采集、搬运和施工，遇怪撤回，玩家清场。当前建造仅太阳能和仓库扩容；季节生产联动、更多电站、食物装备和完整 NPC 城镇是后续方向。', 'Lv1 robots use 1–2P, handle terrain steps up to two tiles and carry five units; Lv2 uses 2–4P, five tiles and 15 units. Robots collect, transport and construct, retreating from enemies for the player to clear. Current construction covers solar panels and storage expansion; seasonal production, additional power stations, food, equipment and full NPC towns remain future directions.')}</p></div>
          </header>
          ${ECONOMY_DOCUMENT}
        </article>
      </div>
    </div>`;
}

function aboutPage(en: boolean): string {
  const t = (zh: string, english: string): string => en ? english : zh;
  const controls = [
    ['A / D · ← / →', t('左右奔跑；按住 Shift 慢走', 'Run left / right; hold Shift to walk')],
    ['Space / W / ↑', t('跳跃；按住跳得更高', 'Jump; hold to jump higher')],
    ['S / ↓', t('穿过悬浮平台；空中俯冲；水中下潜', 'Drop through platforms; dive in air or water')],
    [t('左键 / J / K', 'Left click / J / K'), t('普攻：鹈鹕吐水，Grassy 砸键盘', 'Attack: water spray as Pelican, keyboard strike as Grassy')],
    ['F', t('切换鹈鹕与 Grassy（主线随剧情解锁）', 'Switch between Pelican and Grassy (unlocked in the story)')],
    ['R', t('上车 / 下车；骑行腾空后按空格弃车起飞', 'Mount / dismount; press Space while riding in air to launch')],
    [t('右键', 'Right click'), t('副攻：鹈鹕释放鱼群轰炸', 'Secondary attack: fish barrage as Pelican')],
    ['1 · 2 · 3 / E', t('释放技能；鹈鹕对应突进、反击、光子爆裂', 'Use skills: wing dash, counter and Photon Burst as Pelican')],
    ['M', t('打开地图；滚轮或 + / − 缩放', 'Open map; use the wheel or + / − to zoom')],
    ['Esc / O · H', t('打开设置并暂停 · 显示 / 隐藏操作提示', 'Open settings and pause · show / hide control hints')],
  ];
  const questions = [
    [t('进度保存在哪里？换设备能继续吗？', 'Where is my progress saved? Can I switch devices?'), t('主线会自动保存在当前浏览器中，包括阶段推进和离开页面时的进度。请使用同一设备、同一浏览器和同一网址继续；目前没有账号或云端同步，清除网站数据会丢失存档。', 'Story progress saves automatically in this browser, including phase changes and when leaving the page. Continue on the same device, browser and site address. There are no accounts or cloud saves; clearing site data removes your save.')],
    [t('如何继续，或重新开始？', 'How do I continue or start over?'), t('顶部“继续游戏”会读取已有主线进度。点它右侧的下拉箭头，选择“重新开始”，确认后才会清除主线存档；取消会保留原进度。', 'Use Continue game in the top navigation to resume. Its adjacent arrow offers Start over, which asks for confirmation before clearing story progress. Cancelling keeps your save.')],
    [t('为什么飞不起来，或在水里掉血？', 'Why can’t I fly, or why am I losing health underwater?'), t('鹈鹕在空中按住空格飞行，松开滑翔，飞行受能量限制。水中按住空格 / W 上浮，到水面后再按一次跃出；氧气耗尽会持续扣血。留意游戏里的能量与氧气提示。', 'As Pelican, hold Space in air to fly and release to glide; flight uses energy. Hold Space / W underwater to rise, then press again at the surface to jump out. Running out of oxygen drains health. Watch the energy and oxygen indicators.')],
    [t('画面卡顿或没有声音怎么办？', 'What if the game is slow or silent?'), t('打开设置 → 画面，尝试低画质，并开启 FPS 查看帧率变化。没有声音时，先点击游戏画面，再检查设备音量和浏览器标签页是否静音。', 'Open Settings → Graphics, try low quality and enable FPS to check performance. For silent audio, first click the game, then check your device volume and whether the browser tab is muted.')],
    [t('手机如何全屏或添加到主屏幕？', 'How do I use fullscreen or install on mobile?'), t('使用游戏画面上方的“全屏”和“添加到主屏幕”入口；安装指引会按当前浏览器显示。横屏游玩能留出更多操作空间，也可在游戏菜单中切换“电脑 · 键鼠”和“手机 · 横屏”布局。', 'Use Fullscreen and Add to Home Screen above the game; the installation guide adapts to your browser. Landscape gives the controls more room. The game menu also lets you switch between Desktop and Mobile layouts.')],
  ];
  return `
    <header class="help-hero">
      <div><p class="home-eyebrow">PELICAN 429 / FIELD GUIDE</p>
        <h1>${t('冒险，从这里上手。', 'Your adventure starts here.')}</h1>
        <p>${t('怎么移动、如何战斗、进度存在哪——出发前需要知道的，都在这里。', 'Movement, combat and saved progress. Everything you need before heading out.')}</p>
        <a class="help-primary" href="./?mode=story">${t('进入主线', 'Enter the story')} <span aria-hidden="true">→</span></a>
        <a class="help-text-link" href="./?mode=game">${t('去自由世界练习', 'Practice in free world')} <span aria-hidden="true">↗</span></a>
      </div>
      <figure><img src="./resourcesprivate-source/fortress-overview.webp" alt="${t('山体堡垒与海边都市的游戏实景', 'In-game view of the mountain fortress and coastal city')}" /><figcaption>01 / ${t('山体堡垒 · 开发中试玩', 'MOUNTAIN FORTRESS · IN DEVELOPMENT')}</figcaption></figure>
    </header>
    <div class="help-layout">
      <nav class="help-index" aria-label="${t('帮助页目录', 'Help contents')}">
        <p>${t('帮助与关于', 'Help & about')}</p>
        <a href="#help-start">01 <span>${t('快速开始', 'Quick start')}</span></a>
        <a href="#help-controls">02 <span>${t('操作指南', 'Controls')}</span></a>
        <a href="#help-faq">03 <span>${t('常见问题', 'Common questions')}</span></a>
        <a href="#help-about">04 <span>${t('关于这个世界', 'About this world')}</span></a>
      </nav>
      <div class="help-content">
        <section id="help-start" class="help-block">
          <p class="home-eyebrow">01 / GET STARTED</p><h2>${t('选一条出发的路', 'Choose where to begin')}</h2>
          <div class="help-start-grid">
            <a href="./?mode=story"><span class="help-tag">${t('首次游玩', 'FIRST TIME')}</span><h3>${t('跟随主线', 'Follow the story')} <span aria-hidden="true">↗</span></h3><p>${t('从序章进入山体堡垒，跟随剧情熟悉探索与战斗。已有存档会继续进度。', 'Begin with the prelude and explore the fortress. An existing save resumes your progress.')}</p></a>
            <a href="./?mode=game"><span class="help-tag">${t('自由练习', 'EXPLORE')}</span><h3>${t('自由世界', 'Free world')} <span aria-hidden="true">↗</span></h3><p>${t('试试移动、飞行、变身和技能，按自己的节奏探索。', 'Try movement, flight, transformations and skills at your own pace.')}</p></a>
            <a href="./?mode=intro&amp;opening=finale"><span class="help-tag">${t('了解故事', 'THE PRELUDE')}</span><h3>${t('观看序章', 'Watch the prelude')} <span aria-hidden="true">↗</span></h3><p>${t('一场 AGI 降智风暴，一个被 429 截断的未来。看看一切如何开始。', 'An AGI storm. A future interrupted by 429. See how it all began.')}</p></a>
          </div>
        </section>
        <section id="help-controls" class="help-block">
          <p class="home-eyebrow">02 / CONTROLS</p><h2>${t('先学会走，再试着飞', 'Walk first. Then take flight.')}</h2>
          <p>${t('以下为默认键位。技能随形态变化，当前技能与冷却以游戏内技能栏为准。', 'Default controls are listed below. Skills change with your form; check the in-game skill bar for abilities and cooldowns.')}</p>
          <div class="help-controls-grid"><div class="help-keyboard"><h3>${t('键盘与鼠标', 'Keyboard & mouse')}</h3><dl>${controls.map(([key, description]) => `<div><dt><kbd>${key}</kbd></dt><dd>${description}</dd></div>`).join('')}</dl></div>
            <aside class="help-touch"><span class="help-tag">${t('触屏游玩', 'TOUCH CONTROLS')}</span><h3>${t('左手移动，右手行动', 'Move left. Act right.')}</h3>
              <p>${t('左侧摇杆轻推慢走、推远奔跑，上推跳跃或飞行，下推下平台或下潜。右侧按钮负责跳跃、普攻、变身和骑乘；按住普攻会自动瞄准屏内最近的敌人。', 'Push the left stick gently to walk, farther to run, up to jump or fly, and down to drop or dive. Use the right buttons to jump, attack, transform and ride. Hold attack to target the nearest enemy on screen.')}</p>
              <p>${t('轻点技能键快速释放；支持瞄准的技能可按住拖动方向，松手释放。', 'Tap a skill for a quick cast. For aimable skills, hold and drag to choose a direction, then release to cast.')}</p>
              <a class="help-text-link" href="./?mode=controls&amp;level=test">${t('试用触屏操作', 'Try touch controls')} <span aria-hidden="true">→</span></a>
              <div class="help-tip"><strong>${t('随时暂停', 'Take a break')}</strong><p>${t('键盘按 Esc / O，或打开游戏菜单 → 设置。H 可随时重新显示操作提示。', 'Press Esc / O, or open the game menu → Settings. Press H whenever you need control hints.')}</p></div>
            </aside>
          </div>
        </section>
        <section id="help-faq" class="help-block">
          <p class="home-eyebrow">03 / GOOD TO KNOW</p><h2>${t('遇到问题，先看这里', 'A few useful answers')}</h2>
          <div class="help-faq">${questions.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </section>
        <section id="help-about" class="help-block help-about">
          <img src="./resourcesprivate-source/pelican.webp" alt="${t('戴绿帽、系红围巾的鹈鹕', 'Pelican in a green hat and red scarf')}" loading="lazy" />
          <div><p class="home-eyebrow">04 / BEYOND THE 429</p><h2>${t('一只鹈鹕，一个不愿放弃的世界。', 'A pelican. A world that won’t give up.')}</h2>
            <p>${t('《鹈鹕 429》是小草正在制作的横版动作冒险游戏。跟随 Grassy 与鹈鹕，穿过自然遗迹与巨大机房，在算力与废墟之间寻找下一条路。', 'Pelican 429 is a side-scrolling action adventure in development by Grassy. Follow Grassy and Pelican through natural ruins and vast server halls, searching for a way forward.')}</p>
            <p>${t('当前提供序章和主线试玩，剧情与关卡仍在完善。发现问题时，请附上所在场景、设备与浏览器、复现步骤和截图。', 'The prelude and a playable story are available, with more work underway. When reporting an issue, include the scene, device, browser, reproduction steps and a screenshot.')}</p>
            <div class="help-about-links"><a href="https://github.com/PomoAi-ai/pelican-429" target="_blank" rel="noopener">GitHub ↗</a><a href="https://github.com/PomoAi-ai/pelican-429/issues" target="_blank" rel="noopener">${t('反馈问题', 'Report an issue')} ↗</a><a href="https://x.com/grassy429" target="_blank" rel="noopener">${t('关注作者', 'Follow the creator')} ↗</a><button type="button" popovertarget="home-wechat-pop">${t('微信交流群', 'WeChat community')}</button></div>
          </div>
        </section>
        <footer class="help-footer">PELICAN 429 <span>${t('准备好了，就出发。', 'Ready when you are.')} <a href="./?mode=story">${t('进入游戏', 'Play now')} →</a></span></footer>
      </div>
    </div>`;
}
