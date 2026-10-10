import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefinitionSettlementLayout } from '../src/app/definition-settlement-layout.ts';
import { createPerspectivePlayer } from '../src/app/perspective-player.ts';
import { NEUTRAL_INPUT } from '../src/entities/pelican-controller.ts';
import { TUNING } from '../src/config/tuning.ts';

function traveler(collision: ReturnType<typeof createDefinitionSettlementLayout>['collision']) {
  const player = createPerspectivePlayer(collision, { x: 2, y: 3 }, { width: 240, height: 30 });
  const body = player.entity.body;
  return {
    player,
    body,
    walkTo(x: number): void {
      for (let tick = 0; tick < 5000; tick++) {
        const moveX = Math.abs(body.x - x) < .04 ? 0 : body.x < x ? 1 : -1;
        player.step({ ...NEUTRAL_INPUT, moveX });
        if (moveX === 0 && Math.abs(body.vx) < .01) return;
      }
      assert.fail(`无法走到 ${x}，停在 (${body.x}, ${body.y})`);
    },
    jumpTo(y: number): void {
      for (let tick = 0; tick < 1500; tick++) {
        if (body.onGround && body.y >= y - .01) return;
        // 跳到最高点后松键落回平台；持续按住现在会进入无限飞行。
        player.step({ ...NEUTRAL_INPUT, jumpPressed: body.onGround, jumpHeld: body.onGround || body.vy > 0 });
      }
      assert.fail(`无法跳上 ${y}，停在 (${body.x}, ${body.y})`);
    },
    descendToStreet(): void {
      for (let tick = 0; tick < 600; tick++) {
        player.step({ ...NEUTRAL_INPUT, downHeld: true });
        if (body.onGround && Math.abs(body.y - 3) < .01) return;
      }
      assert.fail(`无法沿室外平台回到主街，停在 (${body.x}, ${body.y})`);
    },
  };
}

test('主街可以双向步行穿过全部房屋，不被侧墙或支柱挡住', () => {
  const layout = createDefinitionSettlementLayout();
  try {
    const player = traveler(layout.collision);
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
    const walker = traveler(layout.collision);
    for (const x of [99, 118, 126.5, 161.5, 168, 198.5, 214, 239, 198.5, 168, 124, 100, 2]) {
      walker.walkTo(x);
      assert.ok(walker.body.onGround && Math.abs(walker.body.y - 3) < .01, `主街 ${x} 无连续地面`);
    }
    for (const [start, target] of [[2, 239], [239, 2]] as const) {
      const cyclist = createPerspectivePlayer(layout.collision, { x: start, y: 3 }, { width: 240, height: 30 });
      cyclist.step({ ...NEUTRAL_INPUT, mountPressed: true });
      for (let tick = 0; tick < TUNING.player.bike.mountTicks; tick++) cyclist.step(NEUTRAL_INPUT);
      assert.equal(cyclist.entity.pelican!.ride.mode, 'riding');
      const direction = target === 239 ? 1 : -1;
      let reached = false;
      for (let tick = 0; tick < 5000; tick++) {
        cyclist.step({ ...NEUTRAL_INPUT, moveX: direction });
        const { x, y, onGround } = cyclist.entity.body;
        assert.equal(cyclist.entity.pelican!.ride.mode, 'riding', `骑车在 (${x}, ${y}) 因 ${cyclist.entity.pelican!.ride.cause} 被迫中断`);
        assert.ok(onGround && Math.abs(y - 3) < .01, `骑车在 (${x}, ${y}) 离开主街`);
        if ((x - target) * direction >= 0) { reached = true; break; }
      }
      assert.ok(reached, `骑车无法到达 ${target}，停在 (${cyclist.entity.body.x}, ${cyclist.entity.body.y})`);
    }
  } finally {
    layout.dispose();
  }
});

test('主街经矿井入口下穿、步行穿过矿道并从另一侧跳回街面', () => {
  const layout = createDefinitionSettlementLayout();
  try {
    const route = traveler(layout.collision);
    route.walkTo(126.5);
    for (let tick = 0; tick < 600 && !(route.body.onGround && route.body.y === -7); tick++) {
      route.player.step({ ...NEUTRAL_INPUT, downHeld: true });
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
    const route = traveler(layout.collision);
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
    const player = traveler(layout.collision);
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
