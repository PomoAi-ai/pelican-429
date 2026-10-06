import * as THREE from 'three';
import type { ShowcaseEnvironment } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import { DEFAULT_WATER_PALETTE } from '../../config/water-palettes.ts';
import type { Rect } from '../../core/math.ts';
import { mulberry32 } from '../../core/rng.ts';
import { sharedPrecipUniforms } from '../../render/precip-surface.ts';
import type { createStageView } from '../../render/stage.ts';
import { createWorldViews } from '../../render/world-views.ts';
import { createSimWorld } from '../../sim/sim-world.ts';
import { createTerrainCompositionLevel } from '../../world/terrain-compositions.ts';
import { planTree } from '../../world/trees.ts';
import { createWorldLighting } from '../lighting-wiring.ts';

/** 演示只摆放角色，地形、植被和洞穴由正式可玩关卡及世界视图提供。 */
export function createNpcWorld(stage: ReturnType<typeof createStageView>, environment: ShowcaseEnvironment, caveBackground: THREE.Texture) {
  const disposers: Array<() => void> = [];
  const dispose = (): void => { for (const release of disposers.splice(0).reverse()) release(); };
  try {
    const { level: base, groundY, ground, frame } = createTerrainCompositionLevel('meadow', 429, 'grass', environment);
    disposers.push(() => base.fluid.dispose());
    const rng = mulberry32(429);
    const level = environment === 'surface' ? {
      ...base,
      trees: [
        planTree('pine', Math.floor(frame.x - 7.5), groundY, rng, 1),
        planTree('sakura', Math.floor(frame.x + 7.5), groundY, rng, 2),
      ],
    } : base;
    const world = createSimWorld({ level, tuning: TUNING, precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
    const root = new THREE.Group();
    root.name = 'npc-world';
    stage.scene.add(root);
    disposers.push(() => root.removeFromParent());
    const views = createWorldViews({ caveBackground, scene: root, level, fish: world.fish, ground, windMode: 'calm', waterPalette: DEFAULT_WATER_PALETTE });
    disposers.push(() => views.dispose());
    views.weather.setEnabled(false);
    const lighting = createWorldLighting(level, world, DEFAULT_WATER_PALETTE, disposers);
    if (environment === 'underground') lighting.worldLight.setAura(frame.x, groundY + 1.5, 7, .65, [.8, .88, 1]);
    let frameIndex = 0;
    return {
      x: frame.x,
      groundY,
      backdrop: { width: level.map.width, height: level.map.height, surface: ground },
      update(view: Readonly<Rect>, time: number, dt: number): void {
        // 多卡片共享天气 uniform，必须在本卡渲染前恢复无降水状态。
        const precip = sharedPrecipUniforms();
        precip.uPrWet.value = 0;
        precip.uPrSnow.value = 0;
        precip.uPrRipple.value = 0;
        views.update(view, time, dt, 0);
        // 模型缓存材质与技能光环由角色管理，避免跨卡片重复注入光照图。
        lighting.worldLight.update(root, frameIndex++);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
