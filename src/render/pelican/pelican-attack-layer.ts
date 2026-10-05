// Ranged-attack layer of the pelican pose (task 018). Pure (no three.js): it runs after the animator and adds the
// spit motion on top of its pose — the neck pulls back and the pouch swells in the windup, the head snaps forward
// with a "puff" (a short squash) and the body recoils back and settles; the orb charge glows in the pouch and the
// neck draws back with it; the gulp thrusts the open bill forward; a full pouch hangs heavy and wobbles.
// It writes pose.follow.head/headShift (clamped to FOLLOW_LIMITS), pose.lean and pose.squash (within MAX_SQUASH)
// and returns the pouch channel (bulge, glow, content) the pouch mesh reads. Everything eases at `rate`, so
// switching phases never jumps. Kept apart from pelican-animator.ts on purpose (composed in entity-views).
import { FOLLOW_LIMITS, MAX_SQUASH } from './pelican-pose.ts';
import type { PelicanPose } from './pelican-pose.ts';

export type SpitWeapon = 'water' | 'fish' | 'orb' | 'swallow';
/** idle; windup/hold/close of a spit timeline; charge (orb held); gulp (mouth wide open); full (pouch holds something). */
export type SpitPhase = 'idle' | 'windup' | 'hold' | 'close' | 'charge' | 'gulp' | 'full';
/** What shows through the pouch skin. */
export type PouchContent = 'none' | 'water' | 'fish' | 'orb' | 'enemy' | 'gold';

export interface PelicanSpitInput {
  weapon: SpitWeapon;
  phase: SpitPhase;
  /** Progress through the phase, 0..1. */
  progress: number;
  /** 嘴囊容量或已释放弹体的强度，0..1。 */
  charge: number;
  /** Content held while phase is 'full' (or being spat in the swallow windup). */
  held: PouchContent;
}

export interface PouchState {
  /** Pouch swelling, 0 (flat, hidden) … ~1.2. */
  bulge: number;
  /** Inner glow 0..1 (orb charge, glowing mouthful). */
  glow: number;
  content: PouchContent;
  /** Seconds on the layer clock (wobble/flutter phase). */
  time: number;
  /** A live fish fighting inside, 0..1: lumps run over the sac and the fish wriggles. */
  wriggle: number;
  /** How far the fish's tail pokes out of the bill tip, 0 (inside / none) .. 1. */
  tailOut: number;
}

export interface PelicanAttackLayerTuning {
  /** Easing rate (1/s) of every channel. */
  rate: number;
  /** Windup: neck pull-back (model units, −x), head raise (radians), body lean back, pouch swell. */
  pullBack: number;
  pullHead: number;
  pullLean: number;
  /** Release: head thrust (model units, +x), forward pitch and the recoil lean back that follows. */
  thrust: number;
  thrustHead: number;
  recoilLean: number;
  /** The puff: upper-body squash at the instant of release. */
  puffSquash: number;
}

export const DEFAULT_PELICAN_ATTACK_LAYER: Readonly<PelicanAttackLayerTuning> = Object.freeze({
  rate: 22,
  pullBack: 0.26,
  pullHead: 0.18,
  pullLean: 0.1,
  thrust: 0.42,
  thrustHead: -0.12,
  recoilLean: 0.16,
  puffSquash: 0.08,
});

const PHASES: readonly SpitPhase[] = ['idle', 'windup', 'hold', 'close', 'charge', 'gulp', 'full'];
const WEAPONS: readonly SpitWeapon[] = ['water', 'fish', 'orb', 'swallow'];
const CONTENTS: readonly PouchContent[] = ['none', 'water', 'fish', 'orb', 'enemy', 'gold'];

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clampAbs = (v: number, limit: number): number => {
  const c = Math.max(-limit, Math.min(limit, v));
  return c === 0 ? 0 : c;
};

function fail(key: string, rule: string, value: unknown): never {
  throw new RangeError(`Pelican attack layer ${key} ${rule}, got ${String(value)}.`);
}

export function validatePelicanAttackLayerTuning(t: PelicanAttackLayerTuning): void {
  for (const [k, v] of Object.entries(t)) if (typeof v !== 'number' || !Number.isFinite(v)) fail(`tuning.${k}`, 'must be a finite number', v);
  if (!(t.rate > 0)) fail('tuning.rate', 'must be positive', t.rate);
  if (Math.abs(t.pullBack) > FOLLOW_LIMITS.headShift || Math.abs(t.thrust) > FOLLOW_LIMITS.headShift) fail('tuning.pullBack/thrust', `must be within ±${FOLLOW_LIMITS.headShift}`, `${t.pullBack}/${t.thrust}`);
  if (Math.abs(t.pullHead) > FOLLOW_LIMITS.head || Math.abs(t.thrustHead) > FOLLOW_LIMITS.head) fail('tuning.pullHead/thrustHead', `must be within ±${FOLLOW_LIMITS.head}`, `${t.pullHead}/${t.thrustHead}`);
  if (t.puffSquash < 0 || t.puffSquash > MAX_SQUASH) fail('tuning.puffSquash', `must be within [0, ${MAX_SQUASH}]`, t.puffSquash);
}

function checkInput(i: PelicanSpitInput, dt: number): void {
  if (!WEAPONS.includes(i.weapon)) fail('input.weapon', `must be one of ${WEAPONS.join('|')}`, i.weapon);
  if (!PHASES.includes(i.phase)) fail('input.phase', `must be one of ${PHASES.join('|')}`, i.phase);
  if (!CONTENTS.includes(i.held)) fail('input.held', `must be one of ${CONTENTS.join('|')}`, i.held);
  for (const k of ['progress', 'charge'] as const) {
    if (typeof i[k] !== 'number' || !(i[k] >= 0 && i[k] <= 1)) fail(`input.${k}`, 'must be within [0, 1]', i[k]);
  }
  if (!(dt >= 0) || !Number.isFinite(dt)) fail('frameDt', 'must be a finite number >= 0', dt);
}

interface Targets {
  shiftX: number;
  shiftY: number;
  head: number;
  lean: number;
  squash: number;
  bulge: number;
  glow: number;
}

/** Per-weapon strength of the spit gesture: the fish toss is the biggest, the orb the most violent release. */
const STRENGTH: Readonly<Record<SpitWeapon, number>> = Object.freeze({ water: 1, fish: 1.35, orb: 0.8, swallow: 1.1 });

/**
 * The fish toss on top of the generic spit: the windup sac swells big and the head is jostled by the fish
 * fighting inside (wriggle 1, its tail poking out of the bill); the release flings forward and UP; a smug nod
 * after. Head angles in radians (positive = raise), shifts in model units.
 */
export const FISH_TOSS = Object.freeze({
  bulge: 1.25,
  jostleHead: 0.05,
  jostleShift: 0.025,
  jostleFreq: 29,
  liftShift: 0.16,
  liftHead: 0.2,
  smugNod: 0.09,
  /** Windup share by which the tail is fully out of the bill. */
  tailOutBy: 0.3,
  /** Wriggle of a swallowed fish held in the pouch. */
  heldWriggle: 0.55,
});
if (FISH_TOSS.liftHead > FOLLOW_LIMITS.head || FISH_TOSS.liftShift > FOLLOW_LIMITS.headShift || FISH_TOSS.bulge <= 0 || !(FISH_TOSS.tailOutBy > 0 && FISH_TOSS.tailOutBy <= 1)) {
  throw new RangeError('Pelican attack layer FISH_TOSS is out of range.');
}

function targetsOf(i: PelicanSpitInput, t: PelicanAttackLayerTuning, time: number): Targets {
  const out: Targets = { shiftX: 0, shiftY: 0, head: 0, lean: 0, squash: 1, bulge: 0, glow: 0 };
  const k = STRENGTH[i.weapon];
  const p = i.progress;
  const glowing = i.held === 'orb' || i.held === 'enemy' || i.held === 'gold';
  switch (i.phase) {
    case 'windup': {
      const s = smooth(p);
      out.shiftX = -t.pullBack * k * s;
      out.shiftY = 0.06 * k * s;
      out.head = t.pullHead * k * s;
      out.lean = t.pullLean * k * s;
      // The pouch swells with what is about to come out (water/fish/the mouthful); the orb has none here.
      out.bulge = i.weapon === 'orb' ? 0.4 : i.weapon === 'fish' ? 0.85 * s + 0.2 : 1.05 * s;
      out.glow = i.weapon === 'orb' ? i.charge : glowing ? 0.7 : 0;
      if (i.weapon === 'fish') {
        // The fish fights in the pouch: the head is jostled while it is pulled back.
        out.head += FISH_TOSS.jostleHead * Math.sin(time * FISH_TOSS.jostleFreq) * (0.4 + 0.6 * s);
        out.shiftX += FISH_TOSS.jostleShift * Math.sin(time * FISH_TOSS.jostleFreq * 0.73 + 1);
        out.bulge = FISH_TOSS.bulge * (0.35 + 0.65 * s);
      }
      break;
    }
    case 'hold': {
      const s = smooth(p);
      const power = i.weapon === 'orb' ? 1 + 0.5 * i.charge : k;
      out.shiftX = t.thrust * power * (1 - 0.6 * s);
      out.head = t.thrustHead * power * (1 - s);
      // Forward with the puff, then the recoil throws the body back.
      out.lean = -0.08 * power * (1 - s) + t.recoilLean * power * Math.sin(Math.PI * Math.min(1, p * 1.2));
      out.squash = 1 - t.puffSquash * Math.min(1, power) * (1 - s);
      out.bulge = 0.15 * (1 - s);
      out.glow = i.weapon === 'orb' ? i.charge * (1 - s) : 0;
      if (i.weapon === 'fish') {
        // The toss: the head snaps forward AND up (the fish is flung, not spat), the mouth wide open.
        out.shiftY = FISH_TOSS.liftShift * (1 - s);
        out.head = FISH_TOSS.liftHead * (1 - s);
      }
      break;
    }
    case 'close':
      // Settle: a small after-bob of the head, everything else eases home; after a fish, a smug little nod.
      out.shiftX = 0.04 * Math.sin(Math.PI * p);
      if (i.weapon === 'fish') out.head = FISH_TOSS.smugNod * Math.sin(Math.PI * 3 * p) * (1 - p);
      break;
    case 'charge': {
      const c = smooth(i.charge);
      out.shiftX = -0.14 * c;
      out.shiftY = 0.04 * c;
      out.head = 0.08 * c;
      out.lean = 0.05 * c;
      // A full charge trembles.
      out.squash = 1 + 0.02 * c * Math.sin(time * 70);
      out.bulge = 0.35 + 0.65 * c;
      out.glow = 0.25 + 0.75 * c;
      break;
    }
    case 'gulp':
      out.shiftX = t.thrust * 0.9;
      out.head = -0.05;
      out.lean = -0.1;
      out.bulge = 0.55 + i.charge * 0.85;
      out.glow = i.charge * 0.9;
      break;
    case 'full':
      out.bulge = 1.1 + i.charge * 0.5 + 0.05 * Math.sin(time * (i.held === 'fish' ? 14 : 5));
      out.head = -0.04;
      out.glow = glowing ? 0.4 + i.charge * 0.45 + 0.1 * Math.sin(time * 6) : 0;
      break;
    case 'idle':
      break;
  }
  return out;
}

export interface PelicanAttackLayer {
  /** Adds the spit motion to `pose` in place and returns the pouch channel. Throws on invalid input. */
  apply(pose: PelicanPose, input: PelicanSpitInput, frameDt: number): PouchState;
}

export function createPelicanAttackLayer(tuning: PelicanAttackLayerTuning = DEFAULT_PELICAN_ATTACK_LAYER): PelicanAttackLayer {
  validatePelicanAttackLayerTuning(tuning);
  const t = { ...tuning };
  const cur: Targets = { shiftX: 0, shiftY: 0, head: 0, lean: 0, squash: 1, bulge: 0, glow: 0 };
  const pouch: PouchState = { bulge: 0, glow: 0, content: 'none', time: 0, wriggle: 0, tailOut: 0 };
  let content: PouchContent = 'none';
  return {
    apply(pose, input, frameDt) {
      checkInput(input, frameDt);
      pouch.time += frameDt;
      const target = targetsOf(input, t, pouch.time);
      const a = 1 - Math.exp(-t.rate * frameDt);
      for (const key of Object.keys(cur) as Array<keyof Targets>) cur[key] += (target[key] - cur[key]) * a;
      if (Math.abs(cur.bulge) < 1e-4 && target.bulge === 0) cur.bulge = 0;
      const L = FOLLOW_LIMITS;
      const f = pose.follow;
      f.headShift = [clampAbs(f.headShift[0] + cur.shiftX, L.headShift), clampAbs(f.headShift[1] + cur.shiftY, L.headShift), f.headShift[2]];
      f.head = clampAbs(f.head + cur.head, L.head);
      pose.lean += cur.lean;
      pose.squash = Math.max(1 - MAX_SQUASH, Math.min(1 + MAX_SQUASH, pose.squash * cur.squash));
      // The pouch shows what fills it: the held thing, else the weapon's own charge.
      if (input.phase === 'full' || (input.weapon === 'swallow' && (input.phase === 'windup' || input.phase === 'gulp'))) content = input.charge > 0 ? 'gold' : input.held;
      else if (input.phase === 'charge' || (input.weapon === 'orb' && input.phase !== 'idle')) content = 'orb';
      else if (input.phase === 'windup') content = input.weapon === 'fish' ? 'fish' : 'water';
      else if (cur.bulge === 0) content = 'none';
      // The fish inside is not eased: it is there during the windup (or held) and gone the instant it is flung.
      const fishWindup = input.weapon === 'fish' && input.phase === 'windup';
      const fishHeld = input.phase === 'full' && input.held === 'fish';
      pouch.wriggle = fishWindup ? 1 : fishHeld ? FISH_TOSS.heldWriggle : 0;
      pouch.tailOut = fishWindup ? Math.min(1, input.progress / FISH_TOSS.tailOutBy) : fishHeld ? 1 : 0;
      pouch.bulge = Math.max(0, cur.bulge);
      pouch.glow = Math.max(0, Math.min(1, cur.glow));
      pouch.content = content;
      return pouch;
    },
  };
}
