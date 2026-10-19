import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TUNING } from '../../config/tuning.ts';
import { DEFINITION_DEPTH } from '../../config/definition-kit.ts';
import { DEPTH_LAYERS, type DepthLayerId } from '../../config/depth-layers.ts';
import { createDefinitionKit, type DefinitionKit } from '../../render/building/definition-kit.ts';
import { createDefinitionInspection } from '../../render/building/definition-inspection.ts';
import { applyDepthHaze, DEPTH_HAZE_HALF_DISTANCE } from '../../render/sky/depth-haze.ts';
import { createBackdrop, createSkyTexture, type Stage } from '../../render/stage/stage.ts';
import { createCelestialSky, type SkyPhase } from '../../render/sky/celestial-sky.ts';
import { createWeatherFx } from '../../render/sky/weather-fx.ts';
import { createTreeView, type TreeView } from '../../render/tree/tree-view.ts';
import type { TreeKind } from '../../world/level.ts';
import { planTree } from '../../world/trees.ts';
import { mulberry32 } from '../../core/rng.ts';
import { buildDepthScenery, terrainTextures, type DepthTheme } from './depth-scenery.ts';
import { createDepthLandscapeDetails } from './depth-landscape-details.ts';
import { createDepthSkyline } from './depth-skyline.ts';
import { createWindController } from '../../world/wind.ts';
import type { SceneSection } from './definition-scene-layout.ts';
import { t } from '../../config/i18n.ts';

/** 景深 = 规则层距（视差约 0.81/0.65/0.46/0.30/0.18）、距离雾、前景下沉一格并模糊；原层次只为对比保留旧层距。 */
export type DepthLayering = 'flat' | 'deep';
// 旧层距，也是远景山林的建模距离。
const FLAT_DISTANCE: Partial<Record<DepthLayerId, number>> = { 'background-near': -4, 'background-far': -10, 'distance-near': -20, 'distance-mid': -43, 'distance-far': -76 };
// 远景是构图用的山林，推远后按透视比例放大，从镜头看大小不变、只是移动变慢；背景格子保持真实格子尺寸。
const SCENERY_LAYERS: readonly DepthLayerId[] = ['distance-near', 'distance-mid', 'distance-far'];
const SCENERY_PIVOT = { x: 24, y: 4 };
// 层 1 已被训练假人血条占用。
const FOREGROUND_BLUR_LAYER = 2;
const BLUR_VERTEX = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tMap;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec4 sum = vec4(0.0);
    float total = 0.0;
    for (int i = -7; i <= 7; i++) {
      float x = float(i) / 3.0;
      float w = exp(-0.5 * x * x);
      sum += texture2D(tMap, vUv + uStep * x) * w;
      total += w;
    }
    gl_FragColor = sum / total;
  }`;
// 模糊在预乘透明度上进行；输出前还原颜色做色调映射与 sRGB，再预乘叠到画面上。
const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tMap;
  uniform float uShade;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tMap, vUv);
    if (c.a < 0.002) discard;
    gl_FragColor = vec4(c.rgb / c.a * uShade, c.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }`;
const themes: readonly DepthTheme[] = ['valley', 'lake', 'coast', 'buildings', 'ruins', 'cave', 'skyline'];
const SCENES: Record<DepthTheme, { title: string; description: string; palette: readonly number[]; sky: readonly [string, string] }> = {
  valley: { title: '花园山谷', description: '花带绕过岩桥，樱树与白桦在两岸成荫，三重青山从中央谷口退向天空。', palette: [0x76866b,0xc9b995,0xa9b496,0x759a89,0x92b4ad,0xb4cdc6], sky: ['#72baca','#e4eed2'] },
  lake: { title: '湖畔松林', description: '松林石岸围出开阔碧水，芦苇、栈桥、小屋和远处岛屿组成湖畔风景。', palette: [0x748f83,0xadbcb0,0x99b5ae,0x749c9a,0x94b7ba,0xb4d1d0], sky: ['#71b5ca','#d8f0dc'] },
  coast: { title: '海岸小镇', description: '浅色岸崖承托陶瓦小屋，棕榈迎着海风，灯塔隔着海湾与远岛相望。', palette: [0xb4a286,0xd8be9b,0xc8c5ad,0x8baeb5,0xa7c4cb,0xc4dbe0], sky: ['#77b5ce','#f5ddae'] },
  buildings: { title: '层叠城镇', description: '花坛与庭院树夹住街巷，完整屋顶、高塔和后方街区一层层升起。', palette: [0x998b74,0xc7ac83,0x9faea8,0x839fa7,0x9fbbc3,0xc4d3d1], sky: ['#9ac4ce','#f3e0be'] },
  ruins: { title: '月夜遗迹', description: '月光穿过残殿缺口，苔石、幽蓝晶光和远山围出安静的遗迹花园。', palette: [0x667887,0x99a8b0,0x8397a5,0x70879a,0x8c9eb2,0xb4c0d3], sky: ['#9ba9cd','#e1d9e7'] },
  cave: { title: '晶石洞厅', description: '厚岩肩与钟乳石围住清水，青紫晶簇照亮近岸，洞桥后还有更深的洞厅。', palette: [0x405a69,0x6c8792,0x789da8,0x67939d,0x82aeb5,0xa4c7cd], sky: ['#101b2d','#35576a'] },
  skyline: { title: 'AI 天际线', description: '滨水步道面向开阔水面，磁悬浮列车驶过高架桥，逐栋绘制的未来楼群与光环尖塔在黄昏中分三层退远。', palette: [0x8a8fa6,0x8d8fb4,0x9a9cc4,0x9aa3c4,0xb0b6d2,0xc8cbe0], sky: ['#6a7fd6','#e9a9b8'] },
};
export const DEPTH_STOPS = {
  valley: [{name:'樱树花坡',x:8,y:1,description:'花丛、岩岸与完整樱树树冠围住步道。'}, {name:'花谷岩桥',x:24,y:1,description:'岩桥低低跨过花谷，后方树林与三层山脊从桥边显露。'}, {name:'白桦远眺',x:40,y:1,description:'从近处花坡越过树冠，看向更淡的青山。'}],
  lake: [{name:'林间小屋',x:8,y:1,description:'松林围住岸边小屋，水从树影后显露。'}, {name:'碧湖栈桥',x:24,y:1,description:'芦苇、栈桥与碧水给远处岛屿留出开阔视窗。'}, {name:'石岸松影',x:40,y:1,description:'低石岸衬出远岛，前后松林沿湖层叠。'}],
  coast: [{name:'陶瓦海村',x:8,y:1,description:'完整的小屋依岸而建，花草与棕榈组成近处街景。'}, {name:'开阔海湾',x:24,y:1,description:'岸崖两侧展开，越过海水看灯塔与远岛。'}, {name:'灯塔远眺',x:40,y:1,description:'灯塔站在岸岩上，后方海色和岛影逐层变淡。'}],
  buildings: [{name:'花园庭院',x:8,y:1,description:'花坛、门窗与庭院树围住第一段街巷。'}, {name:'屋顶与钟楼',x:24,y:1,description:'错落的完整屋顶和钟楼之间露出后方城镇。'}, {name:'街巷眺远城',x:40,y:1,description:'穿过两排建筑的间隙，查看远处街区与山脊。'}],
  ruins: [{name:'苔石入口',x:8,y:1,description:'蕨草和苔石围住遗迹入口。'}, {name:'月下残殿',x:24,y:1,description:'残殿向天空敞开，月亮和青色晶光形成安静的中心景观。'}, {name:'幽光远山',x:40,y:1,description:'近柱、残墙和淡紫远山之间留出月色。'}],
  cave: [{name:'晶石入口',x:8,y:1,description:'厚岩壁旁的青色晶簇标出洞厅入口。'}, {name:'晶湖大厅',x:24,y:1,description:'水池、青紫晶簇和钟乳石围出通向后方洞桥的缺口。'}, {name:'深厅微光',x:40,y:1,description:'前景晶石与远处微光洞拱层层退去。'}],
  skyline: [{name:'滨水步道',x:8,y:1,description:'步道栏杆外是开阔水面，双塔与刀锋塔在近处排开。'}, {name:'光环尖塔',x:24,y:1,description:'正对城市地标，磁悬浮列车从高架桥上驶过。'}, {name:'楼群远眺',x:40,y:1,description:'飞行器穿过近处楼群，远处天际线与粉色晚霞相接。'}],
} satisfies Record<DepthTheme, Array<{ name: string; x: number; y: number; description: string }>>;

/** 六种环境共用同一条可行走路线；背景不能改变玩家的碰撞或世界边界。 */
export function createDefinitionDepthLayout() {
  const kit = createDefinitionKit();
  for (let x = 0; x < 48; x++) kit.solid('A', x, 0);
  // 景深方案给玩法地面换上与近景同一种贴图；只换外观，碰撞仍来自上面的实心格。
  const skins = Object.fromEntries((['dirt', 'stone'] as const).map(material => {
    const skin = createDefinitionKit();
    skin.terrain(Array.from({ length: 48 }, (_, x) => ({ x, y: 0, shape: 'A', layers: [{ shape: 'A', material, ore: false }] })), terrainTextures);
    skin.root.visible = false; kit.root.add(skin.root);
    return [material, skin];
  })) as Record<'dirt' | 'stone', DefinitionKit>;
  const plainGround = kit.root.children.filter(object => object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'definition-solid');
  for (const [left, top] of [[15, 3], [23, 5], [31, 3]] as const) {
    for (let x = left; x < left + 4; x++) kit.platform('full', top, x);
  }
  const sections: SceneSection[] = themes.map(id => ({
    id, title: t(SCENES[id].title), description: t(SCENES[id].description), x: 0, y: 0, width: 48, height: 16, playerX: 24, playerY: 1,
    items: ['共用48格可行走地面', '两层背景格子 · 距玩法平面7 / 16',
      id === 'cave' ? '三层远处洞柱与洞拱' : id === 'skyline' ? '三层逐栋楼群贴图 · 磁悬浮列车 · 飞行器' : '三层远山 · 远近云 · 白天太阳 / 夜晚月亮与星星', '三组可跳跃平台'].map(item => t(item)),
  }));
  return { root: kit.root, sections, collision: { solids: kit.solids, platforms: kit.platforms },
    bounds: new THREE.Box3(new THREE.Vector3(0, 0, -DEFINITION_DEPTH.tile / 2), new THREE.Vector3(48, 16, DEFINITION_DEPTH.tile / 2)),
    /** null = 原来的定义色地面。 */
    setGroundSkin(material: 'dirt' | 'stone' | null): void {
      for (const [name, skin] of Object.entries(skins)) skin.root.visible = name === material;
      for (const object of plainGround) object.visible = material === null;
    },
    dispose: () => { skins.dirt.dispose(); skins.stone.dispose(); kit.dispose(); } };
}

function colorKit(kit: DefinitionKit, color: number): void {
  const materials = new Set<THREE.MeshStandardMaterial>();
  kit.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    }
  });
  for (const material of materials) {
    if (material.name === 'definition-solid') material.color.set(color);
    else if (material.name === 'definition-wall') material.color.set(color).lerp(new THREE.Color('#f5efdc'), .55);
  }
}

/** 只装配共享构件、山脊、天气云和天体，环境不提供玩法碰撞。 */
export function createDepthEnvironment(stage: Stage, selectedTheme: DepthTheme) {
  const root = new THREE.Group();
  root.name = 'depth-environment'; stage.scene.add(root);
  const kits: DefinitionKit[] = [];
  const groves: TreeView[] = [];
  const backdrops: ReturnType<typeof createBackdrop>[] = [];
  const details: Array<{ theme: DepthTheme; view: ReturnType<typeof createDepthLandscapeDetails> }> = [];
  let skyline: ReturnType<typeof createDepthSkyline> | null = null;
  const daylight = new Map<DepthTheme, THREE.Texture>([[selectedTheme, createSkyTexture(...SCENES[selectedTheme].sky)]]);
  const groups = new Map<string, Map<DepthLayerId, THREE.Group>>();
  const enabled = new Map<DepthLayerId, boolean>(DEPTH_LAYERS.map(layer => [layer.id, true]));
  const terrainLayers = DEPTH_LAYERS.slice(0, 6);
  const grove = (parent: THREE.Group, positions: readonly (readonly [number, number, TreeKind])[]): void => {
    const offsetX = Math.min(0, ...positions.map(([x]) => x));
    const trees = positions.map(([x, baseY, kind], index) =>
      planTree(kind, x - offsetX, baseY, mulberry32(429 + index * 73), index));
    const view = createTreeView(trees);
    view.root.position.x = offsetX;
    view.update({ x: -32, y: -5, w: 128, h: 40 }); parent.add(view.root); groves.push(view);
  };
  for (const theme of [selectedTheme]) {
    const layers = new Map<DepthLayerId, THREE.Group>(); groups.set(theme, layers);
    for (const layer of terrainLayers) {
      const group = new THREE.Group(); group.name = `${theme}-${layer.id}`; group.position.z = layer.distance;
      root.add(group); layers.set(layer.id, group);
      const kit = createDefinitionKit(); kit.root.scale.z = -1;
      group.add(kit.root); kits.push(kit);
      buildDepthScenery(kit, theme, layer.id);
      colorKit(kit, SCENES[theme].palette[terrainLayers.indexOf(layer)]!);
    }
    if (theme === 'valley') {
      grove(layers.get('foreground')!, [[3, 1, 'sakura'], [44, 1, 'birch']]);
      grove(layers.get('background-near')!, [[6, 2, 'sakura'], [38, 3, 'birch'], [44, 2, 'birch']]);
      grove(layers.get('background-far')!, [[6, 2, 'oak'], [40, 3, 'birch']]);
    } else if (theme === 'lake') {
      grove(layers.get('foreground')!, [[3, 1, 'pine'], [44, 1, 'pine']]);
      grove(layers.get('background-near')!, [[6, 2, 'pine'], [40, 2, 'willow']]);
      grove(layers.get('background-far')!, [[6, 1, 'pine'], [42, 2, 'pine']]);
    } else if (theme === 'coast') {
      grove(layers.get('background-near')!, [[4, 2, 'palm'], [44, 3, 'palm']]);
      grove(layers.get('background-far')!, [[6, 1, 'palm'], [46, 2, 'palm']]);
    } else if (theme === 'buildings') {
      grove(layers.get('background-near')!, [[12, 1, 'sakura']]);
      grove(layers.get('background-far')!, [[6, 1, 'oak'], [42, 2, 'sakura']]);
    } else if (theme === 'ruins') {
      grove(layers.get('background-far')!, [[4, 1, 'willow'], [42, 2, 'pine']]);
    }
    details.push({ theme, view: createDepthLandscapeDetails(theme, layers) });
    if (theme === 'skyline') { skyline = createDepthSkyline(layers); daylight.get(theme)!.dispose(); daylight.set(theme, skyline.sky); }
    else if (theme !== 'cave') {
      const backdrop = createBackdrop({ width: 48, height: 24, surface: new Int16Array(48).fill(1) }); backdrops.push(backdrop);
      for (const [name, layer] of [['near', 'distance-near'], ['middle', 'distance-mid'], ['far', 'distance-far']] as const) {
        const mountain = backdrop.layers[name]; mountain.position.set(0, -9, 0); mountain.updateMatrix(); layers.get(layer)!.add(mountain);
      }
    }
  }
  // 环境里的材质改用共享指数雾；玩家与玩法地面不在这里，仍走 three 默认雾，在玩法平面上为零。
  // 检查视图的线框、半透明材质克隆自原材质并沿用它的 onBeforeCompile，所以要在创建检查视图之前注入。
  const hazed = new Set<THREE.Material>();
  const haze = (): void => root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!('fog' in material) || !material.fog || hazed.has(material)) continue;
      hazed.add(material);
      applyDepthHaze(material);
    }
  });
  haze();
  const inspection = createDefinitionInspection(root); inspection.setTranslucent(false); inspection.setLines(false);
  const sky = createCelestialSky(); root.add(sky.root);
  const weather = { ...TUNING.render.weather,
    particles: { ...TUNING.render.weather.particles, lineMax: 0, lineRate: 0, debrisMax: 0, debrisRate: 0 } };
  const wind = createWindController(weather, 'breeze');
  const clouds = createWeatherFx({ scene: root, weather, wind, cameraDistance: TUNING.camera.distance });
  haze();
  const initialBackground = stage.scene.background;
  const lights = [stage.keyLight, stage.rimLight, stage.hemiLight];
  const lightDefaults = lights.map(light => ({ color: light.color.clone(), intensity: light.intensity }));
  const groundColor = stage.hemiLight.groundColor.clone();
  const background = new THREE.Color('#16222f'); const forward = new THREE.Vector3();
  const cloudView = { x: 0, y: 0, w: 48, h: 26 }; let theme: DepthTheme = selectedTheme; let time = 0;
  const visibility = (): void => {
    for (const [name, layers] of groups) for (const [id, group] of layers) group.visible = name === theme && enabled.get(id)!;
    // 天际线的云和晚霞画在天空底图里，不叠共享卡通云；白天也不显示日轮，夜晚仍显示共享月亮与星空。
    const painted = theme === 'skyline';
    sky.root.visible = theme !== 'cave' && !(painted && fogPhase === 'day') && enabled.get('sky')!;
    clouds.setEnabled(theme !== 'cave' && !painted && enabled.get('clouds')!);
  };
  let layering: DepthLayering = 'flat'; let fogPhase: SkyPhase = 'day';
  visibility();
  const fog = new THREE.Fog(0xffffff, 0, 1);
  const fogColor = (): void => {
    if (theme === 'cave') fog.color.set('#16222f');
    else if (fogPhase === 'night') fog.color.set('#3a4a66');
    else fog.color.set(SCENES[theme].sky[0]).lerp(new THREE.Color(SCENES[theme].sky[1]), .6);
  };
  // 前景同时在层 0 和层 2：主渲染里它照常生成阴影，但不写颜色和深度；颜色由层 2 的单独通道画到半分辨率缓冲，
  // 两遍高斯模糊后叠回画面。单独通道没有主场景深度，只在近正面镜头使用，其余视角前景回到普通渲染。
  for (const light of lights) light.layers.enable(FOREGROUND_BLUR_LAYER);
  let separate = false; let foregroundPass = false;
  const masked = new Map<THREE.Material, readonly [boolean, boolean]>();
  for (const layers of groups.values()) layers.get('foreground')!.traverse(object => {
    object.layers.enable(FOREGROUND_BLUR_LAYER);
    const before = object.onBeforeRender, after = object.onAfterRender;
    object.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      before.call(object, renderer, scene, camera, geometry, material, group);
      if (!separate || foregroundPass) return;
      masked.set(material, [material.colorWrite, material.depthWrite]);
      material.colorWrite = false; material.depthWrite = false;
    };
    object.onAfterRender = (renderer, scene, camera, geometry, material, group) => {
      after.call(object, renderer, scene, camera, geometry, material, group);
      const saved = masked.get(material);
      if (!saved) return;
      masked.delete(material); [material.colorWrite, material.depthWrite] = saved;
    };
  });
  const sharp = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const soft = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const blur = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uStep: { value: new THREE.Vector2() } }, vertexShader: BLUR_VERTEX, fragmentShader: BLUR_FRAGMENT, depthTest: false, depthWrite: false });
  const composite = new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uShade: { value: .82 } }, vertexShader: BLUR_VERTEX, fragmentShader: COMPOSITE_FRAGMENT,
    transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(blur);
  const bufferSize = new THREE.Vector2(); const clearColor = new THREE.Color();
  return {
    setLayering(mode: DepthLayering): void {
      layering = mode; const deep = mode === 'deep';
      for (const layers of groups.values()) {
        for (const layer of terrainLayers) {
          const group = layers.get(layer.id)!;
          const modeled = FLAT_DISTANCE[layer.id] ?? layer.distance;
          group.position.z = deep ? layer.distance : modeled;
          if (!SCENERY_LAYERS.includes(layer.id)) continue;
          const scale = (TUNING.camera.distance - group.position.z) / (TUNING.camera.distance - modeled);
          group.scale.set(scale, scale, 1);
          group.position.x = SCENERY_PIVOT.x * (1 - scale); group.position.y = SCENERY_PIVOT.y * (1 - scale);
        }
        const foreground = layers.get('foreground')!;
        foreground.position.y = deep ? -1 : 0;
      }
    },
    /** 在 stage.render() 之后调用：把模糊、压暗的前景叠到已输出的画面上。 */
    renderForeground(): void {
      if (!separate) return;
      const { renderer, camera, scene } = stage;
      renderer.getDrawingBufferSize(bufferSize);
      const width = Math.max(1, Math.round(bufferSize.x / 2)), height = Math.max(1, Math.round(bufferSize.y / 2));
      if (sharp.width !== width || sharp.height !== height) { sharp.setSize(width, height); soft.setSize(width, height); }
      const mask = camera.layers.mask, background = scene.background, shadows = renderer.shadowMap.autoUpdate;
      const clearAlpha = renderer.getClearAlpha(); renderer.getClearColor(clearColor);
      camera.layers.set(FOREGROUND_BLUR_LAYER); scene.background = null; renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(sharp);
      foregroundPass = true; renderer.render(scene, camera); foregroundPass = false;
      camera.layers.mask = mask; scene.background = background; renderer.shadowMap.autoUpdate = shadows; renderer.setClearColor(clearColor, clearAlpha);
      // 模糊半径按画面高度取，换屏幕像素比时虚化程度不变。
      const sigma = .0024 * height;
      quad.material = blur;
      blur.uniforms.tMap!.value = sharp.texture; blur.uniforms.uStep!.value.set(sigma / width, 0);
      renderer.setRenderTarget(soft); quad.render(renderer);
      blur.uniforms.tMap!.value = soft.texture; blur.uniforms.uStep!.value.set(0, sigma / height);
      renderer.setRenderTarget(sharp); quad.render(renderer);
      quad.material = composite; composite.uniforms.tMap!.value = sharp.texture;
      const autoClear = renderer.autoClear; renderer.autoClear = false;
      renderer.setRenderTarget(null); quad.render(renderer); renderer.autoClear = autoClear;
    },
    setWireframe: inspection.setWireframe,
    setLines: inspection.setLines,
    setTranslucent: inspection.setTranslucent,
    setLayerVisible(id: DepthLayerId, visible: boolean): void { enabled.set(id, visible); visibility(); },
    select(id: string, phase: SkyPhase): void {
      theme = id as DepthTheme; const underground = id === 'cave'; sky.setPhase(phase);
      fogPhase = phase; visibility(); fogColor();
      stage.scene.background = underground ? background : phase === 'night' ? sky.background : daylight.get(theme)!; clouds.setOvercast(0, phase === 'night' ? .85 : 0);
      const dark = underground || phase === 'night';
      skyline?.setDark(dark);
      for (const backdrop of backdrops) for (const mountain of Object.values(backdrop.layers)) {
        (mountain.material as THREE.MeshBasicMaterial).color.set(dark ? 0x485775 : 0xffffff);
      }
      for (const [index, light] of lights.entries()) {
        const original = lightDefaults[index]!; light.color.copy(original.color);
        if (dark) light.color.lerp(new THREE.Color('#9ab8e0'), .65);
        light.intensity = original.intensity * (dark ? .52 : 1);
      }
      stage.hemiLight.groundColor.copy(groundColor);
      if (dark) stage.hemiLight.groundColor.lerp(new THREE.Color('#283a55'), .7);
    },
    update(camera: THREE.PerspectiveCamera, dt: number): void {
      time += dt; wind.update(time); sky.update(camera);
      // 背景格子一约一成八、背景格子二约三成六、近林约六成，再远封顶；远山自带颜色不受雾影响。
      // 侧看、俯视时视线不再垂直各层，按视深算雾会把整个场景罩住；雾与前景单独模糊都只在近正面镜头启用。
      camera.getWorldDirection(forward);
      separate = layering === 'deep' && forward.z < -.95;
      stage.scene.fog = separate ? fog : null;
      fog.near = camera.position.z - .3; fog.far = fog.near + DEPTH_HAZE_HALF_DISTANCE;
      for (const item of details) if (item.theme === theme) item.view.update(time);
      skyline?.update(time);
      for (const trees of groves) if (trees.root.parent!.visible) trees.update({ x: -32, y: -5, w: 128, h: 40 }, time);
      // 云沿游戏XY平面漂移；绕到侧后方观察时保留最后的云区域，不把云拉成相机贴片。
      if (forward.z < -.8 && camera.position.z > 0) {
        const distance = -camera.position.z / forward.z;
        const height = 2 * TUNING.camera.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        cloudView.w = height * camera.aspect; cloudView.h = height;
        cloudView.x = camera.position.x + forward.x * distance - cloudView.w / 2;
        cloudView.y = camera.position.y + forward.y * distance - height / 2;
      }
      clouds.update(cloudView, dt, () => 1);
    },
    dispose(): void {
      stage.scene.background = initialBackground; stage.scene.fog = null;
      for (const light of lights) light.layers.disable(FOREGROUND_BLUR_LAYER);
      sharp.dispose(); soft.dispose(); blur.dispose(); composite.dispose(); quad.dispose();
      for (const [index, light] of lights.entries()) {
        light.color.copy(lightDefaults[index]!.color); light.intensity = lightDefaults[index]!.intensity;
      }
      stage.hemiLight.groundColor.copy(groundColor); clouds.dispose(); sky.dispose(); inspection.dispose();
      for (const item of details) item.view.dispose();
      skyline?.dispose();
      for (const texture of daylight.values()) texture.dispose();
      for (const backdrop of backdrops) backdrop.dispose();
      for (const trees of groves) trees.dispose();
      for (const kit of kits) kit.dispose();
      root.removeFromParent(); root.clear();
    },
  };
}
