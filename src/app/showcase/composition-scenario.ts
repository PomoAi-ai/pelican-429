import type { ShowcaseCard } from '../../config/showcase.ts';
import { TERRAIN_COMPOSITIONS } from '../../config/terrain-compositions.ts';
import { TUNING } from '../../config/tuning.ts';
import { NEUTRAL_INPUT } from '../../entities/pelican-controller.ts';
import { resourceEntry } from '../../render/resource-catalog.ts';
import { createSimWorld, stepSim } from '../../sim/sim-world.ts';
import { createTerrainCompositionLevel } from '../../world/terrain-compositions.ts';
import type { ShowcaseScenario } from './scenario.ts';

export function createCompositionScenario(card: ShowcaseCard): ShowcaseScenario {
  const options = card.resource!;
  const kind = options.composition!;
  const entry = resourceEntry(card.entryId);
  const { level, groundY, ground, frame } = createTerrainCompositionLevel(kind, options.seed, entry.action, card.environment);
  const world = createSimWorld({ level, tuning: TUNING, precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const definition = TERRAIN_COMPOSITIONS.find((item) => item.id === kind)!;
  let ticks = 0;
  return {
    world, entry, groundY, groundColumns: ground, facing: 1,
    width: frame.width, height: frame.height,
    durationTicks: Math.round(entry.seconds / TUNING.sim.step),
    get elapsedTicks() { return ticks; },
    step(input = NEUTRAL_INPUT) { stepSim(world, input); ticks++; },
    focus: () => ({ x: frame.x, y: frame.y }),
    status: () => `${definition.label} · Seed ${options.seed}`,
    dispose() { level.fluid.dispose(); },
  };
}
