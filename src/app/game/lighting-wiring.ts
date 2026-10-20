/**
 * 光照接线：体积光束 + 画质切换、1/4 光场（洞内发光源/浮空岛天空光）、鹈鹕微光（暗处淡入，每帧按光场采样）。
 */
import { DEFAULT_AURA } from '../../config/aura-rules.ts';
import type { LightingQuality, LightingTuning } from '../../config/lighting-rules.ts';
import { TUNING } from '../../config/tuning.ts';
import { waterPalette } from '../../config/water-palettes.ts';
import type { WaterPaletteName } from '../../config/water-palettes.ts';
import { lerp } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import { createLightShafts } from '../../render/sky/light-shafts.ts';
import type { LightShafts } from '../../render/sky/light-shafts.ts';
import { createWorldLight } from '../../render/stage/light-field-material.ts';
import type { WorldLight } from '../../render/stage/light-field-material.ts';
import { createPelicanAura } from '../../render/pelican/pelican-aura.ts';
import { planPasses } from '../../render/stage/post-fx.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import type { SimWorld } from '../../sim/sim-world.ts';
import { caveLightSources } from '../../world/cave-features.ts';
import type { LevelData } from '../../world/level.ts';
import { islandSkyPass } from '../../world/sky-islands.ts';
import { cityLightRules } from '../../world/light-field-tiles.ts';
import { SUBCELLS } from '../../world/tile-shapes.ts';

interface ShaftsWiring {
  readonly shafts: LightShafts;
  /** 切换画质：后期 pass + 光束开关（low 关闭光束）。 */
  readonly setQuality: (quality: LightingQuality) => void;
}

/** 体积光束（树冠下/天空斜射）加入场景，并按舞台当前画质设置一次；画质 low 时关闭。 */
export function installLightShafts(stage: Stage<StageRenderer>, level: LevelData, ground: Int16Array, disposers: Array<() => void>): ShaftsWiring {
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
  /** 每帧（光场 update 之后）：按玩家插值位置采样光场，更新鹈鹕微光（暗处淡入，水下略弱偏青）。 */
  readonly updateAura: (player: Entity, alpha: number, frameDt: number) => void;
}

/**
 * 泰拉瑞亚式 1/4 光场：地下逐格变暗，树冠下/屋内/水下变暗，光球照亮周围（挂接到场景全部网格材质）。
 * 洞内发光源（蘑菇/晶簇/萤火虫）为静态光源；大浮空岛列的天空光穿过岛体（岛下淡投影而不是全黑）。
 */
export function createWorldLighting(level: LevelData, world: SimWorld, waterPaletteName: WaterPaletteName, disposers: Array<() => void>, lighting: LightingTuning = TUNING.render.lighting): WorldLighting {
  const city = world.city;
  const worldLight = createWorldLight({
    // 城区：地基顶面以上无墙无实心的空气露天（住宅规则）。
    ...city ? { city: { rules: cityLightRules(city.building.site.foundationTop * SUBCELLS) } } : {},
    map: level.map,
    fluid: world.fluid,
    trees: level.trees,
    lighting,
    waterPalette: waterPalette(waterPaletteName),
    emitters: caveLightSources(level.caves.glows),
    skyPass: islandSkyPass(level.islands, level.map.width, level.map.height),
  });
  // 鹈鹕自带微光（021）：暗处（光照图亮度 < aura.darkStart）淡入，水下略弱偏青。
  const aura = createPelicanAura(DEFAULT_AURA);
  disposers.push(() => worldLight.dispose());
  const updateAura = (pl: Entity, alpha: number, frameDt: number): void => {
    const ax = lerp(pl.body.prevX, pl.body.x, alpha);
    const ay = lerp(pl.body.prevY, pl.body.y, alpha) + DEFAULT_AURA.offsetY;
    // 自由镜头远离主角时主角不在画面里，光场也没算到那里，微光保持原状。
    if (!worldLight.field.covers(ax)) return;
    const st = aura.update(frameDt, worldLight.field.sample(ax, ay), pl.pelican?.inWater === true);
    worldLight.setAura(ax, ay, DEFAULT_AURA.radius, st.strength, st.color);
  };
  return { worldLight, updateAura };
}
