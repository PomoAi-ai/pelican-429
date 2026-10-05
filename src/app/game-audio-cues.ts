import { ENEMY_RULES } from '../config/enemy-rules.ts';
import { FORTRESS_STRUCTURE } from '../config/facility-structure.ts';
import { HUMAN_SKILLS } from '../config/human-combat.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { ProjectileKind } from '../core/weapon-ids.ts';
import type { Entity } from '../entities/entity.ts';
import { getPlayer } from '../sim/sim-world.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import { TILE_PLATFORM } from '../world/tile-types.ts';
import type { GameSound } from './fortress-score.ts';

export interface SoundCue { sound: GameSound; x: number; y: number; strength?: number; pitch?: number }

function snapshot(e: Entity) {
  const p = e.pelican;
  return {
    attack: e.attack, elapsed: e.attack?.elapsed ?? -1, grounded: e.body.onGround,
    x: e.body.x, y: e.body.y, vx: e.body.vx, vy: e.body.vy,
    jumping: p?.jumping, flight: p?.flightMode, dash: p?.weapon.dashTicks ?? 0,
    gulp: p?.weapon.gulpTicks ?? 0, action: p?.humanCombat.action,
    actionTicks: p?.humanCombat.ticks ?? 0, transform: p?.transformTicks ?? -1,
    airborne: e.enemy?.airborne, pelican: p,
  };
}
type Snapshot = ReturnType<typeof snapshot>;
const ENEMY_PITCH = { gatekeeper: 0.88, lineHound: 1.25, watchWasp: 1.6, loadmaster: 0.58 } as const;

/** 只观察模拟结果；声音既不消费输入，也不改变战斗或动画时间轴。 */
export class GameAudioCues {
  private previous = new Map<number, Snapshot>();
  private lastTick: number;
  private respawn: number;
  private alive: boolean;
  private cadence = new Map<string, number>();

  constructor(world: SimWorld) {
    this.lastTick = world.tick;
    this.respawn = world.respawnTicks;
    this.alive = getPlayer(world).health!.hp > 0;
    for (const e of world.entities) this.previous.set(e.id, snapshot(e));
  }

  observe(world: SimWorld): SoundCue[] {
    if (world.tick === this.lastTick) return [];
    this.lastTick = world.tick;
    const cues: SoundCue[] = [];
    const player = getPlayer(world);
    const emit = (e: Entity, sound: GameSound, strength = 1, pitch = 1): void => { cues.push({ sound, x: e.body.x, y: e.body.y, strength, pitch }); };
    const pulse = (e: Entity, sound: GameSound, interval: number, strength = 1): void => {
      const key = `${e.id}:${sound}`;
      const last = this.cadence.get(key);
      if (last === undefined || world.tick - last >= interval) { emit(e, sound, strength); this.cadence.set(key, world.tick); }
    };
    const respawned = this.respawn > 0 && world.respawnTicks === 0;
    if (this.alive && player.health!.hp <= 0) emit(player, 'death');
    this.alive = player.health!.hp > 0;
    if (respawned) emit(player, 'respawn');
    this.respawn = world.respawnTicks;
    const next = new Map<number, Snapshot>();
    for (const e of world.entities) {
      if (!e.pelican && !e.enemy) continue;
      const old = this.previous.get(e.id);
      next.set(e.id, snapshot(e));
      if (!old || e.health!.hp <= 0 || world.respawnTicks > 0 || (e.id === player.id && respawned)) continue;
      if (e.enemy) {
        const pitch = ENEMY_PITCH[e.enemy.kind];
        if (e.attack && e.attack !== old.attack) emit(e, 'enemyWindup', 1, pitch);
        if (e.attack && e.enemy.skill !== null) {
          const skill = ENEMY_RULES[e.enemy.kind].skills[e.enemy.skill];
          const landed = old.airborne && !e.enemy.airborne && e.body.onGround;
          const released = e.attack.elapsed >= skill.startup && (old.attack !== e.attack || old.elapsed < skill.startup);
          if ((skill.mode === 'slam' ? landed : released) && skill.mode !== 'bomb' && skill.mode !== 'thermite') emit(e, 'enemyStrike', 1, pitch);
        }
        if (e.enemy.kind === 'watchWasp') pulse(e, 'rotor', 24, 0.4);
        else if (e.body.onGround && Math.abs(e.body.x - old.x) > 0.015) pulse(e, 'stepMetal', e.enemy.kind === 'loadmaster' ? 36 : 22, 0.55);
        continue;
      }
      const p = e.pelican!;
      if (p !== old.pelican) continue;
      if (p.jumping && !old.jumping && e.body.vy > 0) emit(e, 'jump');
      if (e.body.onGround && !old.grounded && old.vy < -1) emit(e, 'land', Math.min(1.8, Math.abs(old.vy) / 8));
      if (p.transformTicks >= 0 && old.transform < 0) emit(e, 'transform');
      if (p.weapon.dashTicks > old.dash) emit(e, 'dash');
      if (p.weapon.gulpTicks > old.gulp) emit(e, 'gulp');
      if (p.humanCombat.action === 'keyboard_smash' && e.attack !== old.attack) emit(e, 'keyboard');
      if (p.humanCombat.action === 'server_overload') {
        if (old.action !== 'server_overload' || p.humanCombat.ticks < old.actionTicks) emit(e, 'overloadCharge');
        if (old.action === 'server_overload' && old.actionTicks < HUMAN_SKILLS.server_overload.release && p.humanCombat.ticks >= HUMAN_SKILLS.server_overload.release) emit(e, 'overloadBurst');
      }
      if (p.flightMode === 'fly') pulse(e, p.form === 'human' ? 'jet' : 'wing', p.form === 'human' ? 18 : 24, 0.6);
      else if (p.flightMode === 'glide') pulse(e, 'glide', 42, 0.4);
      if (p.ride.mode === 'riding') {
        if (Math.abs(e.body.vx) > 0.4) pulse(e, p.ride.pedaling ? 'pedal' : 'coast', 22, 0.5);
        if (Math.abs(old.vx) > 2 && Math.abs(e.body.vx) < Math.abs(old.vx) - 0.3) pulse(e, 'brake', 30, 0.5);
      } else if (p.ride.mode === 'off' && e.body.onGround && !p.inWater && Math.abs(e.body.x - old.x) > 0.012) {
        const tx = Math.max(0, Math.min(world.map.width - 1, Math.floor(e.body.x)));
        const ty = Math.max(0, Math.min(world.map.height - 1, Math.floor(e.body.y - 0.05)));
        const tile = world.map.get(tx, ty);
        const metal = world.level.lethalCoolant !== undefined && e.body.x >= FORTRESS_STRUCTURE.bounds.left;
        pulse(e, tile === TILE_PLATFORM ? 'stepGrate' : metal ? 'stepMetal' : 'stepStone', p.moveGear === 'run' ? 15 : 23, p.form === 'human' ? 0.65 : 0.45);
      }
    }
    this.previous = next;
    for (const key of this.cadence.keys()) if (!next.has(Number(key.split(':')[0]))) this.cadence.delete(key);
    return cues;
  }

  events(events: readonly SimEvent[], world: SimWorld): SoundCue[] {
    const cues: SoundCue[] = [];
    const emit = (sound: GameSound, point: { x: number; y: number }, strength = 1): void => { cues.push({ sound, x: point.x, y: point.y, strength }); };
    const shots: Partial<Record<ProjectileKind, GameSound>> = { waterShot: 'water', fishShot: 'fish', orb: 'codex', codexShot: 'codex', bugShot: 'bug', droneBomb: 'mount', droneThermite: 'mount', enemyShot: 'enemyStrike' };
    const volleys = new Set<string>();
    for (const event of events) {
      switch (event.type) {
        case 'projectileFired': {
          const volley = `${event.ownerId}:${event.kind}`;
          if (event.kind === 'fishShot' || event.kind === 'bugShot') {
            if (volleys.has(volley)) break;
            volleys.add(volley);
            const last = this.cadence.get(volley);
            if (last !== undefined && world.tick - last < 10) break;
            this.cadence.set(volley, world.tick);
          }
          const sound = shots[event.kind];
          if (sound) emit(sound, event, sound === 'mount' ? 0.35 : event.returned ? 1.25 : 0.8);
          break;
        }
        case 'projectileImpact':
          if (event.reason !== 'expire' && event.reason !== 'swallowed') {
            if (event.kind === 'droneBomb' || event.kind === 'droneThermite') emit(event.kind === 'droneBomb' ? 'bomb' : 'thermite', event, 1.3);
            else if (event.reason !== 'hit') emit(event.kind === 'waterShot' || event.kind === 'fishShot' ? 'splash' : 'metalHit', event, 0.45);
          }
          break;
        case 'hit': emit(event.targetId === world.playerId ? 'hurt' : 'metalHit', event); break;
        case 'swallowed': emit('swallow', event); break;
        case 'fishCaught': emit('swallow', event, 0.5); break;
        case 'splash': emit('splash', event, event.entering ? 0.9 : 0.55); break;
        case 'mount': emit('mount', event); break;
        case 'dismount': emit(event.cause === 'crash' ? 'metalHit' : 'mount', event, 0.65); break;
        case 'photonUltimateStarted': emit('photonCharge', event); break;
        case 'photonUltimateBurst': emit('photonBurst', event); break;
      }
    }
    return cues;
  }
}
