import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createDefinitionDepthLayout } from '../src/app/perspective/definition-depth-layout.ts';
import { createDefinitionSceneLayout } from '../src/app/perspective/definition-scene-layout.ts';
import { createDefinitionSettlementLayout } from '../src/app/perspective/definition-settlement-layout.ts';
import { SCENE_ENTRIES } from '../src/app/workspace/scene-catalog.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createDefinitionWorld, type DefinitionWorldData } from '../src/sim/definition-world.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim, type InputFrame } from '../src/sim/sim-world.ts';

const globals = globalThis as { document?: unknown };
const previousDocument = globals.document;
before(() => {
  globals.document = { createElement: () => ({ getContext: () => ({
    clearRect() {}, strokeText() {}, fillText() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, closePath() {}, fill() {}, arc() {}, createLinearGradient: () => ({ addColorStop() {} }),
  }) }) };
});
after(() => {
  if (previousDocument === undefined) delete globals.document;
  else globals.document = previousDocument;
});

type Layout = ReturnType<typeof createDefinitionSettlementLayout>;

/** 住宅布局写成格子世界后的玩家；x、y 换回布局坐标，断言沿用布局里的高度。 */
function playable(layout: { readonly data: DefinitionWorldData }, start: { x: number; y: number }) {
  const { level, offset } = createDefinitionWorld(layout.data, start);
  const world = createSimWorld({ level, playerForm: 'human' });
  const entity = getPlayer(world);
  return {
    entity,
    step(input: Partial<InputFrame>): void { stepSim(world, { ...NEUTRAL_INPUT, ...input }); },
    get x(): number { return entity.body.x - offset.x; },
    get y(): number { return entity.body.y - offset.y; },
    get onGround(): boolean { return entity.body.onGround; },
  };
}

function traveler(layout: Layout) {
  const body = playable(layout, { x: 2, y: 3 });
  return {
    player: body,
    body,
    walkTo(x: number): void {
      for (let tick = 0; tick < 5000; tick++) {
        const moveX = Math.abs(body.x - x) < .04 ? 0 : body.x < x ? 1 : -1;
        body.step({ moveX });
        if (moveX === 0 && Math.abs(body.entity.body.vx) < .01) return;
      }
      assert.fail(`无法走到 ${x}，停在 (${body.x}, ${body.y})`);
    },
    jumpTo(y: number): void {
      for (let tick = 0; tick < 1500; tick++) {
        if (body.onGround && body.y >= y - .01) return;
        // 跳到最高点后松键落回平台；持续按住会进入飞行。
        body.step({ jumpPressed: body.onGround, jumpHeld: body.onGround || body.entity.body.vy > 0 });
      }
      assert.fail(`无法跳上 ${y}，停在 (${body.x}, ${body.y})`);
    },
    descendToStreet(): void {
      for (let tick = 0; tick < 600; tick++) {
        body.step({ downHeld: true });
        if (body.onGround && Math.abs(body.y - 3) < .01) return;
      }
      assert.fail(`无法沿室外平台回到主街，停在 (${body.x}, ${body.y})`);
    },
  };
}

test('主街可以双向步行穿过全部房屋，不被侧墙或支柱挡住', () => {
  const layout = createDefinitionSettlementLayout();
  try {
    const player = traveler(layout);
    for (const x of [13, 29, 45, 61, 77, 93, 98, 85, 69, 53, 37, 21, 5, 2]) {
      player.walkTo(x);
      assert.ok(player.body.onGround);
      assert.ok(Math.abs(player.body.y - 3) < .01);
    }
  } finally {
    layout.dispose();
  }
});

test('主街贯穿湖桥、矿井入口和空岛下方，步行与骑车均可双向通过', () => {
  const layout = createDefinitionSettlementLayout();
  try {
    const walker = traveler(layout);
    for (const x of [99, 118, 126.5, 161.5, 168, 198.5, 214, 239, 198.5, 168, 124, 100, 2]) {
      walker.walkTo(x);
      assert.ok(walker.body.onGround && Math.abs(walker.body.y - 3) < .01, `主街 ${x} 无连续地面`);
    }
    // 地图左右边界是墙，骑车冲到墙前会撞车；两端各留出刹车距离。
    for (const [start, target] of [[4, 236], [236, 4]] as const) {
      const cyclist = playable(layout, { x: start, y: 3 });
      for (let tick = 0; tick < 5; tick++) cyclist.step({});
      cyclist.step({ mountPressed: true });
      for (let tick = 0; tick < TUNING.player.bike.mountTicks; tick++) cyclist.step({});
      assert.equal(cyclist.entity.pelican!.ride.mode, 'riding');
      const direction = target > start ? 1 : -1;
      let reached = false;
      for (let tick = 0; tick < 5000; tick++) {
        cyclist.step({ moveX: direction });
        const { x, y, onGround } = cyclist;
        assert.equal(cyclist.entity.pelican!.ride.mode, 'riding', `骑车在 (${x}, ${y}) 因 ${cyclist.entity.pelican!.ride.cause} 被迫中断`);
        assert.ok(onGround && Math.abs(y - 3) < .01, `骑车在 (${x}, ${y}) 离开主街`);
        if ((x - target) * direction >= 0) { reached = true; break; }
      }
      assert.ok(reached, `骑车无法到达 ${target}，停在 (${cyclist.x}, ${cyclist.y})`);
    }
  } finally {
    layout.dispose();
  }
});

test('主街经矿井入口下穿、步行穿过矿道并从另一侧跳回街面', () => {
  const layout = createDefinitionSettlementLayout();
  try {
    const route = traveler(layout);
    route.walkTo(126.5);
    for (let tick = 0; tick < 600 && !(route.body.onGround && Math.abs(route.body.y + 7) < .01); tick++) {
      route.player.step({ downHeld: true });
    }
    assert.ok(route.body.onGround && Math.abs(route.body.y + 7) < .01, `矿井无法下到通道，停在 (${route.body.x}, ${route.body.y})`);
    route.walkTo(161.5);
    assert.ok(route.body.onGround && Math.abs(route.body.y + 7) < .01, '矿道出口不可达');
    route.jumpTo(3);
    assert.ok(route.body.onGround && Math.abs(route.body.y - 3) < .01, `矿井无法跳回主街，停在 (${route.body.x}, ${route.body.y})`);
  } finally {
    layout.dispose();
  }
});

test('空岛可从地面逐层跳上，经过岛顶后从另一侧下穿回主街', () => {
  const layout = createDefinitionSettlementLayout();
  try {
    const route = traveler(layout);
    route.walkTo(100);
    route.walkTo(198.5);
    route.jumpTo(21);
    assert.ok(route.body.onGround && Math.abs(route.body.y - 21) < .01, `空岛无法逐层跳上，停在 (${route.body.x}, ${route.body.y})`);
    route.walkTo(214);
    assert.ok(route.body.onGround && Math.abs(route.body.y - 21) < .01, `无法穿过空岛，停在 (${route.body.x}, ${route.body.y})`);
    route.descendToStreet();
  } finally {
    layout.dispose();
  }
});

test('连续走跳进入经典及 A、C、B+H 二层房屋，并从室外登顶再下到主街', () => {
  const layout = createDefinitionSettlementLayout();
  try {
    const player = traveler(layout);
    for (const [x, upperFloor, roof] of [[36, 9, 15], [52, 9, 14.5], [68, 9, 14.5], [84, 8.5, 14.5]] as const) {
      player.walkTo(x + 5);
      player.jumpTo(upperFloor);
      player.walkTo(x + 9.2);
      assert.ok(player.body.onGround);
      assert.ok(Math.abs(player.body.y - upperFloor) < .01, `房屋 ${x} 二层不可达`);
      player.walkTo(x + 13.5);
      player.jumpTo(15);
      player.walkTo(x + 8);
      assert.ok(player.body.onGround);
      assert.ok(Math.abs(player.body.y - roof) < .01, `房屋 ${x} 屋顶不可达`);
      player.walkTo(x + 13.5);
      player.descendToStreet();
    }
  } finally {
    layout.dispose();
  }
});

test('全部透视检视条目都能写成格子世界，出生后落地', () => {
  for (const entry of SCENE_ENTRIES) {
    if (entry.kind !== 'perspective' || entry.variant === 'settlement') continue;
    const layout = entry.variant === 'depth' ? createDefinitionDepthLayout() : createDefinitionSceneLayout(entry.sectionId);
    try {
      const section = layout.sections.find(item => item.id === entry.sectionId) ?? layout.sections[0]!;
      const player = playable(layout, { x: section.playerX, y: section.playerY });
      for (let tick = 0; tick < 60; tick++) player.step({});
      assert.ok(player.onGround, `${entry.id} 出生后没有落地，停在 (${player.x}, ${player.y})`);
    } finally {
      layout.dispose();
    }
  }
});
