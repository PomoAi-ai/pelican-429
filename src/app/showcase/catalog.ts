import { showcaseEntry } from '../../config/showcase.ts';
import type { ShowcaseActor, ShowcaseEnvironment } from '../../config/showcase.ts';
import { TUNING } from '../../config/tuning.ts';
import { createSimWorld, stepSim } from '../../sim/sim-world.ts';
import { createShowcaseLevel } from '../../world/showcase-level.ts';
import { preparePelican } from './pelican.ts';
import { prepareDummy } from './dummy.ts';
import { prepareEnemy } from './enemy.ts';
import { prepareFish } from './fish.ts';
import { prepareHuman } from './human.ts';
import type { ScenarioContext, ScenarioDriver, ShowcaseScenario } from './scenario.ts';

type SimulatedActor = Exclude<ShowcaseActor, 'human' | 'd1' | 'luma' | 'sam' | 'tibo'>;

const adapters: Readonly<Record<SimulatedActor, (ctx: ScenarioContext) => ScenarioDriver>> = {
  pelican: preparePelican, dummy: prepareDummy, gatekeeper: prepareEnemy, lineHound: prepareEnemy, watchWasp: prepareEnemy, loadmaster: prepareEnemy, fish: prepareFish,
};

export function createShowcaseScenario(id: string, environment: ShowcaseEnvironment, facing: 1 | -1, attackMotion: 'still' | 'walk' | 'run' = 'still'): ShowcaseScenario {
  const entry = showcaseEntry(id);
  const { level, groundY } = createShowcaseLevel(environment);
  const world = createSimWorld({ level, tuning: TUNING, precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const ctx: ScenarioContext = { world, entry, groundY, facing };
  const driver = entry.actor === 'human' ? prepareHuman(ctx, attackMotion)
    : adapters[entry.actor as SimulatedActor](ctx);
  let ticks = 0;
  return {
    ...ctx,
    height: driver.height, width: driver.width,
    durationTicks: Math.round((entry.actor === 'human' ? 8 : entry.seconds) / TUNING.sim.step),
    get elapsedTicks() { return ticks; },
    step(input, aim) {
      const scripted = driver.input(ticks);
      const controls = input ?? scripted;
      stepSim(world, aim === undefined ? controls : { ...controls, aim });
      ticks++;
    },
    focus: driver.focus,
    status: driver.status,
    dispose() { level.fluid.dispose(); },
  };
}
