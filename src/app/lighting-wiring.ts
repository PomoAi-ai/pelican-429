/**
 * 光照接线（从 main.ts 拆出，任务 019 收尾）：体积光束 + 画质切换、瓦片光照图（洞内发光源/浮空岛天空光）、
 * 鹈鹕微光（暗处淡入，每帧按光照图采样）。
 */
import { DEFAULT_AURA } from '../config/aura-rules.ts';
import { ISLAND_LIGHT } from '../config/cave-island-rules.ts';
import type { LightingQuality, LightingTuning } from '../config/lighting-rules.ts';
import { TUNING } from '../config/tuning.ts';
import { waterPalette } from '../config/water-palettes.ts';
import type { WaterPaletteName } from '../config/water-palettes.ts';
import { lerp } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';
import { createLightShafts } from '../render/light-shafts.ts';
import type { LightShafts } from '../render/light-shafts.ts';
import { createWorldLight } from '../render/light-texture.ts';
import type { WorldLight } from '../render/light-texture.ts';
import { createPelicanAura, sampleLight } from '../render/pelican-aura.ts';
import { planPasses } from '../render/post-fx.ts';
import type { Stage } from '../render/stage.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import { caveLightSources } from '../world/cave-features.ts';
import type { LevelData } from '../world/level.ts';
import { islandSkyPass } from '../world/sky-islands.ts';

export interface ShaftsWiring {
  readonly shafts: LightShafts;
  /** 切换画质：后期 pass + 光束开关（low 关闭光束）。 */
  readonly setQuality: (quality: LightingQuality) => void;
}

/** 体积光束（树冠下/天空斜射）加入场景，并按舞台当前画质设置一次；画质 low 时关闭。 */
export function installLightShafts(stage: Stage, level: LevelData, ground: Int16Array, disposers: Array<() => void>): ShaftsWiring {
  const shafts = createLightShafts({ trees: level.trees, ground, lighting: TUNING.render.lighting });
  stage.scene.add(shafts.root);
  disposers.push(() => shafts.dispose());
  const setQuality = (q: LightingQuality): void => {
    stage.setQuality(q);
    shafts.setEnabled(planPasses(q).shafts);
  };
  setQuality(stage.quality);
  return { shafts, setQuality };
}

export interface WorldLighting {
  readonly worldLight: WorldLight;
  /** 每帧：按玩家插值位置采样光照图，更新鹈鹕微光并写入光照图（暗处淡入，水下略弱偏青）。 */
  readonly updateAura: (player: Entity, alpha: number, frameDt: number) => void;
}

/**
 * 泰拉瑞亚式瓦片光照：地下逐格变暗，树冠下/屋内/水下变暗，光球照亮周围（挂接到场景全部网格材质）。
 * 021：洞内发光源（蘑菇/晶簇/萤火虫）为静态光源；大浮空岛列的天空光穿过岛体（岛下淡投影而不是全黑）。
 */
export function createWorldLighting(level: LevelData, world: SimWorld, waterPaletteName: WaterPaletteName, disposers: Array<() => void>, lighting: LightingTuning = TUNING.render.lighting): WorldLighting {
  const worldLight = createWorldLight({
    map: level.map,
    fluid: world.fluid,
    trees: level.trees,
    lighting,
    waterPalette: waterPalette(waterPaletteName),
    emitters: caveLightSources(level.caves.glows),
    skyPass: islandSkyPass(level.islands, level.map.width, level.map.height),
    skyShade: ISLAND_LIGHT.SKY_SHADE,
    skyPassDecay: ISLAND_LIGHT.SKY_PASS_DECAY,
  });
  // 鹈鹕自带微光（021）：暗处（光照图亮度 < aura.darkStart）淡入，水下略弱偏青。
  const aura = createPelicanAura(DEFAULT_AURA);
  disposers.push(() => worldLight.dispose());
  const updateAura = (pl: Entity, alpha: number, frameDt: number): void => {
    const ax = lerp(pl.body.prevX, pl.body.x, alpha);
    const ay = lerp(pl.body.prevY, pl.body.y, alpha) + DEFAULT_AURA.offsetY;
    const lm = worldLight.lightMap;
    const st = aura.update(frameDt, sampleLight(lm.light, lm.width, lm.height, ax, ay), pl.pelican?.inWater === true);
    worldLight.setAura(ax, ay, DEFAULT_AURA.radius, st.strength, st.color);
  };
  return { worldLight, updateAura };
}
