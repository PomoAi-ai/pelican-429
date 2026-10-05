import { FISH_SPECIES } from '../../config/fish-appearance.ts';
import { createFishSchool } from '../../entities/fish.ts';
import { NEUTRAL_INPUT } from '../../entities/pelican-controller.ts';
import { getPlayer } from '../../sim/sim-world.ts';
import { placeBody } from './scenario.ts';
import type { ScenarioContext, ScenarioDriver } from './scenario.ts';

export function prepareFish(ctx: ScenarioContext): ScenarioDriver {
  const { world, groundY, entry, facing } = ctx;
  const species = FISH_SPECIES.find((species) => species.id === (entry.fishSpecies ?? 'minnow'))!;
  const school = createFishSchool([{ x: 50, y: groundY - 1.5, lake: groundY === 10 ? 0 : 1, seed: species.sampleSeed }], world.fluid, world.tuning.fish);
  world.fish.fish.push(...school.fish);
  const fish = school.fish[0]!;
  fish.facing = facing;
  fish.dirX = facing;
  const player = getPlayer(world);
  placeBody(player.body, 8, groundY, true);
  if (entry.action === 'stranded' || entry.action === 'return') {
    placeBody(fish.body, entry.action === 'return' ? 42.4 : 40.5, groundY + 0.1);
    fish.state = 'stranded';
  }
  return {
    input(tick) {
      if (entry.action === 'flee' && tick === 40) placeBody(player.body, fish.body.x - facing * 2, groundY - 1.5);
      return NEUTRAL_INPUT;
    },
    focus: () => ({ x: fish.body.x, y: fish.body.y + fish.body.height * 0.5 }),
    height: 2.5,
    width: 2.5,
    status: () => `${species.name} · ${{ swim: '自由游动', flee: '受惊逃离', stranded: '搁浅扑腾', dead: '演示结束' }[fish.state]}`,
  };
}
