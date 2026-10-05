import { sampleHopDismount } from './ride-dismount-hop.js';
import { sampleStepDismount } from './ride-dismount-step.js';

// Getting off the bicycle, as a pure function of the story clock (ride-timeline.js sampleTimeline) and the
// seated legs on the stopped pedals. The rig's style picks the way off, each in its own module:
// - 'step' (tall, task 008): ride-dismount-step.js, one foot at a time on the near side (rig.dismount);
// - 'hop' (short, task 009): ride-dismount-hop.js, the bird's hop off to the near side (rig.hop).
// What both share (knee IK, the standing leg, the pedal ankle) is ride-dismount-kit.js.

export { kneeOf, pedalAnkle, stanceLeg } from './ride-dismount-kit.js';
export { arrive, monotone } from './ride-dismount-step.js';
export { hopFlight, hopPivot } from './ride-dismount-hop.js';

const BY_STYLE = Object.freeze({ step: sampleStepDismount, hop: sampleHopDismount });

/**
 * Body and legs at the clock's time: { body, legs, standing } (see the style's module). `seated` are the legs
 * on the pedals at the clock's crank angle and bob (ride-motion pedalLegs). Throws on a rig without a known
 * style; the rig and timeline themselves are validated by the caller (ride-motion sampleRideFrame).
 */
export function sampleDismount(clock, seated, rig, tl) {
  const sample = BY_STYLE[rig?.style];
  if (!sample) throw new RangeError(`Ride dismount needs rig.style ${Object.keys(BY_STYLE).join(' or ')}, got ${String(rig?.style)}.`);
  return sample(clock, seated, rig, tl);
}
