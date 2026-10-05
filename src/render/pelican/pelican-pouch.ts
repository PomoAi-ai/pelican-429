// The pelican's swelling throat pouch (task 018): one extra ellipsoid skin hung on the lower jaw
// (pelican-jaw-inner, which is bird space), sized after the vendored bill's pouch rows (deepest near x 1.27,
// depth .65 below the mouth line at y ≈ 4.226, half-width .46). At rest it hides inside the painted pouch;
// the attack layer's pouch channel swells it (mostly downward, keeping its top on the mouth line), tints it by
// content (water bluish, fish tawny with a flutter) and lets an orb charge or a glowing mouthful shine through
// the skin (emissive, which the light-map keeps). Nothing in the rig or vendor is changed: the mesh only joins
// the jaw group and is released by dispose().
// A live fish (state.wriggle) shows two ways: lumps run back and forth over the sac skin, and the cartoon fish
// (render/cartoon-fish.ts) sits in the bill with its tail poking out of the tip (state.tailOut), flapping.
import * as THREE from 'three';
import { createCartoonFishKit, fishWiggle } from '../cartoon-fish.ts';
import type { CartoonFish, FishPose, FishVariantRelay } from '../cartoon-fish.ts';
import type { PouchContent, PouchState } from './pelican-attack-layer.ts';

/** Bird-space sac at rest: centre and radii (inside the painted pouch). */
export const POUCH_CENTER: Readonly<[number, number, number]> = Object.freeze([1.3, 3.86, 0]) as Readonly<[number, number, number]>;
export const POUCH_RADII: Readonly<[number, number, number]> = Object.freeze([0.82, 0.34, 0.4]) as Readonly<[number, number, number]>;
/** Mouth line height the sac hangs from. */
const POUCH_TOP = 4.2;
/** Swelling per unit bulge: length, depth, width. */
const SWELL: Readonly<[number, number, number]> = Object.freeze([0.22, 0.95, 0.45]) as Readonly<[number, number, number]>;
const SKIN = '#f4b660';
const TINT: Readonly<Record<PouchContent, { color: string; mix: number; emissive: string; gain: number }>> = Object.freeze({
  none: { color: SKIN, mix: 0, emissive: '#000000', gain: 0 },
  water: { color: '#9fd6ee', mix: 0.35, emissive: '#2a6f9a', gain: 0.25 },
  fish: { color: '#d39a62', mix: 0.3, emissive: '#000000', gain: 0 },
  orb: { color: '#ffe0a0', mix: 0.25, emissive: '#ffb43c', gain: 2.6 },
  enemy: { color: '#d7a6ff', mix: 0.3, emissive: '#b061ff', gain: 1.8 },
  gold: { color: '#ffe08a', mix: 0.3, emissive: '#ffcf5a', gain: 2 },
});

/** The fish in the bill: length (bird units), tilt of its axis (radians, nose down into the sac), tail-tip travel. */
export const MOUTH_FISH = Object.freeze({ length: 1.1, tilt: 0.5, tipIn: -0.25, tipOut: 0.32, wiggle: 1.8 });
/** Lumps of the fish fighting inside: radius (bird units, at wriggle 1), sweep (radians around the sac bottom), rate (rad/s). */
export const POUCH_LUMP = Object.freeze({ radius: 0.27, sweep: 0.95, rate: 8.5 });

export interface PelicanPouch {
  readonly mesh: THREE.Mesh;
  /** Bumps on the sac (visible while a fish wriggles inside). */
  readonly lumps: readonly THREE.Mesh[];
  /** The fish in the bill (tail out of the tip). */
  readonly mouthFish: CartoonFish;
  /** Applies the attack layer's pouch channel (bulge 0 hides the sac). */
  set(state: PouchState): void;
  dispose(): void;
}

/**
 * Hangs the sac on `root`'s jaw group (pelican-jaw-inner); throws if the rig has none. `relay` (shared with the
 * projectile views) gives the mouth fish the colours of the fish about to fly; without one it stays variant 0.
 */
export function createPelicanPouch(root: THREE.Object3D, relay?: FishVariantRelay): PelicanPouch {
  const jaw = root.getObjectByName('pelican-jaw-inner');
  if (!jaw) throw new Error('Pelican pouch needs the rig jaw group pelican-jaw-inner.');
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  const material = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55, metalness: 0, emissive: '#000000', emissiveIntensity: 1 });
  material.name = 'pelican-pouch-sac';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'pelican-pouch-sac';
  mesh.castShadow = true;
  mesh.visible = false;
  jaw.add(mesh);
  const lumps = [0, 1].map((i) => {
    const lump = new THREE.Mesh(geometry, material);
    lump.name = `pelican-pouch-lump-${i}`;
    lump.visible = false;
    jaw.add(lump);
    return lump;
  });
  // The bill tip in bird space = the last vertex of the jaw mesh (pelican-rig buildJaw: the tip ring's apex).
  const jawMesh = jaw.getObjectByName('pelican-jaw') as THREE.Mesh | undefined;
  const jawPos = jawMesh?.isMesh ? jawMesh.geometry.getAttribute('position') : undefined;
  if (!jawPos || jawPos.count < 2) throw new Error('Pelican pouch needs the rig jaw mesh pelican-jaw (bill tip).');
  const tipX = jawPos.getX(jawPos.count - 1);
  const tipY = jawPos.getY(jawPos.count - 1);
  const fishKit = createCartoonFishKit();
  const mouthFish = fishKit.create(0);
  const fishPivot = new THREE.Group();
  fishPivot.name = 'pelican-mouth-fish';
  fishPivot.position.set(tipX, tipY, 0);
  fishPivot.rotation.z = MOUTH_FISH.tilt;
  // Tail toward the tip (+x), nose back into the sac.
  mouthFish.object.rotation.y = Math.PI;
  mouthFish.object.scale.setScalar(MOUTH_FISH.length);
  fishPivot.add(mouthFish.object);
  fishPivot.visible = false;
  jaw.add(fishPivot);
  const fishPose: FishPose = { bend: 0, tail: 0, mouth: 0, fin: 0 };
  const skin = new THREE.Color(SKIN);
  const tint = new THREE.Color();
  return {
    mesh,
    lumps,
    mouthFish,
    set(state) {
      const b = state.bulge;
      if (!(Number.isFinite(b) && b >= 0) || !(state.glow >= 0 && state.glow <= 1)) throw new RangeError(`Pelican pouch: invalid bulge ${b} / glow ${state.glow}.`);
      if (!(state.wriggle >= 0 && state.wriggle <= 1) || !(state.tailOut >= 0 && state.tailOut <= 1)) throw new RangeError(`Pelican pouch: invalid wriggle ${state.wriggle} / tailOut ${state.tailOut}.`);
      mesh.visible = b > 0.02;
      fishPivot.visible = mesh.visible && state.tailOut > 0.02;
      if (!mesh.visible) {
        for (const l of lumps) l.visible = false;
        return;
      }
      const flutter = state.content === 'fish' ? 0.05 * Math.sin(state.time * 23) : 0;
      const rx = POUCH_RADII[0] * (1 + SWELL[0] * b + flutter);
      const ry = POUCH_RADII[1] * (1 + SWELL[1] * b);
      const rz = POUCH_RADII[2] * (1 + SWELL[2] * b - flutter);
      mesh.scale.set(rx, ry, rz);
      // Keep the top on the mouth line: the sac grows downward.
      mesh.position.set(POUCH_CENTER[0] + 0.08 * b, Math.min(POUCH_CENTER[1], POUCH_TOP - ry * 0.95), POUCH_CENTER[2]);
      const c = TINT[state.content];
      material.color.copy(skin).lerp(tint.set(c.color), c.mix);
      material.emissive.set(c.emissive);
      material.emissiveIntensity = c.gain * state.glow + (state.content === 'water' ? 0.25 : 0);
      // Lumps: the fish's head and tail pushing the skin out, sweeping back and forth under the sac.
      const w = state.wriggle;
      lumps.forEach((lump, i) => {
        lump.visible = w > 0.02;
        if (!lump.visible) return;
        const t = state.time * POUCH_LUMP.rate + i * 2.1;
        const a = POUCH_LUMP.sweep * Math.sin(t) + (i === 0 ? 0.35 : -0.45);
        const r = POUCH_LUMP.radius * w * (1 - 0.3 * i) * (1 + 0.25 * Math.sin(t * 1.7));
        lump.position.set(mesh.position.x + rx * 0.86 * Math.sin(a), mesh.position.y - ry * 0.93 * Math.cos(a), rz * 0.35 * Math.sin(t * 0.6));
        lump.scale.set(r * 1.25, r, r);
      });
      if (fishPivot.visible) {
        if (relay) mouthFish.setVariant(relay.peek());
        const tip = MOUTH_FISH.tipIn + (MOUTH_FISH.tipOut - MOUTH_FISH.tipIn) * state.tailOut;
        mouthFish.object.position.x = tip - 0.5 * MOUTH_FISH.length;
        mouthFish.pose(fishWiggle(state.time, MOUTH_FISH.wiggle * Math.max(0.3, w), fishPose));
      }
    },
    dispose() {
      fishPivot.removeFromParent();
      for (const l of lumps) l.removeFromParent();
      fishKit.dispose();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
