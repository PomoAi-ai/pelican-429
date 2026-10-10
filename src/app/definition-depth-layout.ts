import * as THREE from 'three';
import { TUNING } from '../config/tuning.ts';
import { createDefinitionKit, type DefinitionKit } from '../render/definition-kit.ts';
import { createDefinitionInspection } from '../render/definition-inspection.ts';
import { createBackdrop, createSkyTexture, type Stage } from '../render/stage.ts';
import { createCelestialSky, type SkyPhase } from '../render/celestial-sky.ts';
import { createWeatherFx } from '../render/weather-fx.ts';
import { createTreeView, type TreeView } from '../render/tree-view.ts';
import type { TreeKind } from '../world/level.ts';
import { planTree } from '../world/trees.ts';
import { mulberry32 } from '../core/rng.ts';
import { buildDepthScenery, type DepthTheme } from './depth-scenery.ts';
import { createDepthLandscapeDetails } from './depth-landscape-details.ts';
import { createWindController } from '../world/wind.ts';
import type { SceneSection } from './definition-scene-layout.ts';

export const DEPTH_LAYERS = [
  { id: 'foreground', label: '近景遮挡', distance: 3, description: '镜头一侧的矮石、断墙和洞缘；只局部遮挡。' },
  { id: 'background-near', label: '背景格子一', distance: -4, description: '离角色较近的阶地、门墙或洞壁，保留真实开口。' },
  { id: 'background-far', label: '背景格子二', distance: -10, description: '错位的岩桥、建筑和洞壁，可从前层缺口看见。' },
  { id: 'distance-near', label: '远景一', distance: -20, description: '近林、远处街区或洞柱群。' },
  { id: 'distance-mid', label: '远景二', distance: -43, description: '山坡、城镇塔楼或悬空岩桥。' },
  { id: 'distance-far', label: '远景三', distance: -76, description: '远山、天际线或深处洞厅。' },
  { id: 'clouds', label: '远近云', distance: -24, description: '共享天气系统的多深度云，遮住部分日月星光。' },
  { id: 'sky', label: '太阳 / 月亮 / 星星', distance: -700, description: '按画面大小显示天体；关闭后仍保留天空底色。' },
] as const;
export type DepthLayerId = typeof DEPTH_LAYERS[number]['id'];
const themes: readonly DepthTheme[] = ['valley', 'lake', 'coast', 'buildings', 'ruins', 'cave'];
const SCENES: Record<DepthTheme, { title: string; description: string; palette: readonly number[]; sky: readonly [string, string] }> = {
  valley: { title: '花园山谷', description: '花带绕过岩桥，樱树与白桦在两岸成荫，三重青山从中央谷口退向天空。', palette: [0x76866b,0xc9b995,0xa9b496,0x759a89,0x92b4ad,0xb4cdc6], sky: ['#72baca','#e4eed2'] },
  lake: { title: '湖畔松林', description: '松林石岸围出开阔碧水，芦苇、栈桥、小屋和远处岛屿组成湖畔风景。', palette: [0x748f83,0xadbcb0,0x99b5ae,0x749c9a,0x94b7ba,0xb4d1d0], sky: ['#71b5ca','#d8f0dc'] },
  coast: { title: '海岸小镇', description: '浅色岸崖承托陶瓦小屋，棕榈迎着海风，灯塔隔着海湾与远岛相望。', palette: [0xb4a286,0xd8be9b,0xc8c5ad,0x8baeb5,0xa7c4cb,0xc4dbe0], sky: ['#77b5ce','#f5ddae'] },
  buildings: { title: '层叠城镇', description: '花坛与庭院树夹住街巷，完整屋顶、高塔和后方街区一层层升起。', palette: [0x998b74,0xc7ac83,0x9faea8,0x839fa7,0x9fbbc3,0xc4d3d1], sky: ['#9ac4ce','#f3e0be'] },
  ruins: { title: '月夜遗迹', description: '月光穿过残殿缺口，苔石、幽蓝晶光和远山围出安静的遗迹花园。', palette: [0x667887,0x99a8b0,0x8397a5,0x70879a,0x8c9eb2,0xb4c0d3], sky: ['#9ba9cd','#e1d9e7'] },
  cave: { title: '晶石洞厅', description: '厚岩肩与钟乳石围住清水，青紫晶簇照亮近岸，洞桥后还有更深的洞厅。', palette: [0x405a69,0x6c8792,0x789da8,0x67939d,0x82aeb5,0xa4c7cd], sky: ['#101b2d','#35576a'] },
};
export const DEPTH_STOPS = {
  valley: [{name:'樱树花坡',x:8,y:1,description:'花丛、岩岸与完整樱树树冠围住步道。'}, {name:'花谷岩桥',x:24,y:1,description:'岩桥低低跨过花谷，后方树林与三层山脊从桥边显露。'}, {name:'白桦远眺',x:40,y:1,description:'从近处花坡越过树冠，看向更淡的青山。'}],
  lake: [{name:'林间小屋',x:8,y:1,description:'松林围住岸边小屋，水从树影后显露。'}, {name:'碧湖栈桥',x:24,y:1,description:'芦苇、栈桥与碧水给远处岛屿留出开阔视窗。'}, {name:'石岸松影',x:40,y:1,description:'低石岸衬出远岛，前后松林沿湖层叠。'}],
  coast: [{name:'陶瓦海村',x:8,y:1,description:'完整的小屋依岸而建，花草与棕榈组成近处街景。'}, {name:'开阔海湾',x:24,y:1,description:'岸崖两侧展开，越过海水看灯塔与远岛。'}, {name:'灯塔远眺',x:40,y:1,description:'灯塔站在岸岩上，后方海色和岛影逐层变淡。'}],
  buildings: [{name:'花园庭院',x:8,y:1,description:'花坛、门窗与庭院树围住第一段街巷。'}, {name:'屋顶与钟楼',x:24,y:1,description:'错落的完整屋顶和钟楼之间露出后方城镇。'}, {name:'街巷眺远城',x:40,y:1,description:'穿过两排建筑的间隙，查看远处街区与山脊。'}],
  ruins: [{name:'苔石入口',x:8,y:1,description:'蕨草和苔石围住遗迹入口。'}, {name:'月下残殿',x:24,y:1,description:'残殿向天空敞开，月亮和青色晶光形成安静的中心景观。'}, {name:'幽光远山',x:40,y:1,description:'近柱、残墙和淡紫远山之间留出月色。'}],
  cave: [{name:'晶石入口',x:8,y:1,description:'厚岩壁旁的青色晶簇标出洞厅入口。'}, {name:'晶湖大厅',x:24,y:1,description:'水池、青紫晶簇和钟乳石围出通向后方洞桥的缺口。'}, {name:'深厅微光',x:40,y:1,description:'前景晶石与远处微光洞拱层层退去。'}],
} satisfies Record<DepthTheme, Array<{ name: string; x: number; y: number; description: string }>>;

/** 六种环境共用同一条可行走路线；背景不能改变玩家的碰撞或世界边界。 */
export function createDefinitionDepthLayout() {
  const kit = createDefinitionKit();
  for (let x = 0; x < 48; x++) kit.solid('A', x, 0);
  for (const [left, top] of [[15, 3], [23, 5], [31, 3]] as const) {
    for (let x = left; x < left + 4; x++) kit.platform('full', .75, top, x);
  }
  const sections: SceneSection[] = themes.map(id => ({
    id, title: SCENES[id].title, description: SCENES[id].description, x: 0, y: 0, width: 48, height: 16, playerX: 24, playerY: 1,
    items: ['共用48格可行走地面', '两层背景格子 · 距玩法平面4 / 10',
      id === 'cave' ? '三层远处洞柱与洞拱' : '三层远山 · 远近云 · 白天太阳 / 夜晚月亮与星星', '三组可跳跃平台'],
  }));
  return { root: kit.root, sections, collision: { solids: kit.solids, platforms: kit.platforms },
    bounds: new THREE.Box3(new THREE.Vector3(0, 0, -.5), new THREE.Vector3(48, 16, .5)),
    dispose: () => kit.dispose() };
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
export function createDepthEnvironment(stage: Stage) {
  const root = new THREE.Group();
  root.name = 'depth-environment'; stage.scene.add(root);
  const kits: DefinitionKit[] = [];
  const groves: TreeView[] = [];
  const backdrops: ReturnType<typeof createBackdrop>[] = [];
  const details: Array<{ theme: DepthTheme; view: ReturnType<typeof createDepthLandscapeDetails> }> = [];
  const daylight = new Map(themes.map(theme => [theme, createSkyTexture(...SCENES[theme].sky)]));
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
  for (const theme of themes) {
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
    if (theme !== 'cave') {
      const backdrop = createBackdrop({ width: 48, height: 24, surface: new Int16Array(48).fill(1) }); backdrops.push(backdrop);
      for (const [name, layer] of [['near', 'distance-near'], ['middle', 'distance-mid'], ['far', 'distance-far']] as const) {
        const mountain = backdrop.layers[name]; mountain.position.set(0, -9, 0); mountain.updateMatrix(); layers.get(layer)!.add(mountain);
      }
    }
  }
  const inspection = createDefinitionInspection(root); inspection.setTranslucent(false); inspection.setLines(false);
  const sky = createCelestialSky(); root.add(sky.root);
  const weather = { ...TUNING.render.weather,
    particles: { ...TUNING.render.weather.particles, lineMax: 0, lineRate: 0, debrisMax: 0, debrisRate: 0 } };
  const wind = createWindController(weather, 'breeze');
  const clouds = createWeatherFx({ scene: root, weather, wind, cameraDistance: TUNING.camera.distance });
  const initialBackground = stage.scene.background;
  const lights = [stage.keyLight, stage.rimLight, stage.hemiLight];
  const lightDefaults = lights.map(light => ({ color: light.color.clone(), intensity: light.intensity }));
  const groundColor = stage.hemiLight.groundColor.clone();
  const background = new THREE.Color('#16222f'); const forward = new THREE.Vector3();
  const cloudView = { x: 0, y: 0, w: 48, h: 26 }; let theme: DepthTheme = 'valley'; let time = 0;
  const visibility = (): void => {
    for (const [name, layers] of groups) for (const [id, group] of layers) group.visible = name === theme && enabled.get(id)!;
    sky.root.visible = theme !== 'cave' && enabled.get('sky')!; clouds.setEnabled(theme !== 'cave' && enabled.get('clouds')!);
  };
  visibility();
  return {
    setWireframe: inspection.setWireframe,
    setLines: inspection.setLines,
    setTranslucent: inspection.setTranslucent,
    setLayerVisible(id: DepthLayerId, visible: boolean): void { enabled.set(id, visible); visibility(); },
    select(id: string, phase: SkyPhase): void {
      theme = id as DepthTheme; const underground = id === 'cave'; visibility(); sky.setPhase(phase);
      stage.scene.background = underground ? background : phase === 'night' ? sky.background : daylight.get(theme)!; clouds.setOvercast(0, phase === 'night' ? .85 : 0);
      const dark = underground || phase === 'night';
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
      for (const item of details) if (item.theme === theme) item.view.update(time);
      for (const trees of groves) if (trees.root.parent!.visible) trees.update({ x: -32, y: -5, w: 128, h: 40 }, time);
      camera.getWorldDirection(forward);
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
      stage.scene.background = initialBackground;
      for (const [index, light] of lights.entries()) {
        light.color.copy(lightDefaults[index]!.color); light.intensity = lightDefaults[index]!.intensity;
      }
      stage.hemiLight.groundColor.copy(groundColor); clouds.dispose(); sky.dispose(); inspection.dispose();
      for (const item of details) item.view.dispose();
      for (const texture of daylight.values()) texture.dispose();
      for (const backdrop of backdrops) backdrop.dispose();
      for (const trees of groves) trees.dispose();
      for (const kit of kits) kit.dispose();
      root.removeFromParent(); root.clear();
    },
  };
}
