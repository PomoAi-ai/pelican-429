// Pure data of the refined pelican's lakeside ride (task 008; the short bicycle and the hop off are task 009):
// the SVG-to-world conversion, every bicycle and rider constant of both versions, the way off the bicycle, the
// animation clocks and their validation. No three.js here, so Node tests and the page share one source.
// Bicycle numbers are read off standing-reference/ride/pelican-breezy-ride.svg (1000×680) through svgToWorld;
// test/standing-ride-rig.test.js re-parses that SVG to keep them honest.
//
// Two versions share one set of modules and differ only in the data here (RIDE_RIGS) and in the timeline
// (ride-timeline.js RIDE_TIMELINES):
// - tall (高车·迈步下车, task 008): the bicycle 1:1 as the SVG draws it, legs 1.46 + 1.34, and a step-by-step
//   climb off (style 'step', rig.dismount): up onto the near pedal, the far leg back over the rack, far foot
//   down first, then the near foot.
// - short (矮车·跳车, task 009): the whole bicycle at 0.6, legs 0.67 + 1.08, and the bird's hop off (style
//   'hop', rig.hop): crouch, spring off as the kickstand is kicked down, one wing beat in the air, land, settle.
//
// World frame: +X forward (the bird's bill), +Y up, +Z toward the camera, y = 0 is the tyres' ground line.

export const SVG_UNIT = 60;
// Midpoint of the two axles (x) on the tyres' ground line (y) of the reference SVG.
export const SVG_ORIGIN = Object.freeze([511, 583]);

const TAU = Math.PI * 2;

/** Convert an SVG pixel position to world units: X = (px − 511)/60, Y = (583 − py)/60. */
export function svgToWorld(px, py) {
  if (typeof px !== 'number' || !Number.isFinite(px) || typeof py !== 'number' || !Number.isFinite(py)) {
    throw new TypeError(`svgToWorld needs two finite SVG coordinates, got ${String(px)}, ${String(py)}.`);
  }
  return [(px - SVG_ORIGIN[0]) / SVG_UNIT, (SVG_ORIGIN[1] - py) / SVG_UNIT];
}

const svgLength = (length) => length / SVG_UNIT;
// Angle of an SVG point around an SVG centre, counter-clockwise with +Y up as in the world.
const svgAngle = ([x, y], [cx, cy]) => Math.atan2(cy - y, x - cx);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** The ways off the bicycle, each with the rig section that holds its geometry. */
export const RIDE_STYLES = Object.freeze({ step: 'dismount', hop: 'hop' });

const REAR_AXLE = [340, 487];
const FRONT_AXLE = [682, 487];
const HEAD_TOP = [625, 330];
// The SVG lamp floats in front of the fork; its 3D bracket meets the fork line at the lens height.
const LENS = [678, 367];
const forkAt = (y) => [HEAD_TOP[0] + ((FRONT_AXLE[0] - HEAD_TOP[0]) * (y - HEAD_TOP[1])) / (FRONT_AXLE[1] - HEAD_TOP[1]), y];

// SVG clocks, except the wheel: the SVG spins its spokes every 1.2s over an 80px/s road (a 6× slip); the
// 3D wheel rolls without slipping, one turn per three crank turns (DESIGN.md 2.5).
const TIMING = {
  crankPeriod: 1.6, // crank rotate, and both legs' 33 keyframes
  wheelPeriod: 4.8,
  bobPeriod: 0.8, // rider group translate 0 → −1.6px → 0
  blinkPeriod: 4.8, // eye ry
  scarfPeriod: 1.6, // scarf tail d morph
  gullPeriod: 6, // gull group translate 0 → (10, −4)px → 0
  cloudSpeedPx: 10, // clouds translate −1000px over 100s
};

/**
 * The bicycle of one version. The whole bicycle is the SVG's at `scale`: every SVG point is converted by
 * svgToWorld and multiplied by `scale` about the origin (the midpoint of the axles on the ground line), so both
 * tyres still touch y = 0 and the wheelbase shrinks with the wheels. Tube radii and 3D-only depths shrink with
 * it too, but for what the bird's own size sets: the pedals' spacing (`pedalZ`: the refined bird's feet do not
 * shrink) and the handlebar group (stem top, bar, sleeves, grip, bell, brake lever), which is moved by
 * `barShift`, up the steering axis and forward along a longer stem, so the folded wings can still reach it.
 * At scale 1 with no shift every number is the SVG's own, bit for bit (x · 1 = x, x + 0 = x).
 * - grip: where the wing holds the bar, in SVG pixels (between the stem and the sleeve).
 * - stowed: the kickstand's folded direction (not scaled: a direction).
 * - postInSaddle: the 3D seat post stops a quarter of the way up into the saddle instead of at the SVG post's top.
 */
function makeBike({ scale, barShift, pedalZ, grip, stowed, postInSaddle }) {
  const bikePoint = (px, py) => svgToWorld(px, py).map((value) => value * scale);
  const bikeLength = (length) => svgLength(length) * scale;
  const bikeAngle = svgAngle; // angles do not change under a uniform scale
  const barPoint = (px, py) => {
    const [x, y] = bikePoint(px, py);
    return [x + barShift[0], y + barShift[1]];
  };
  const tyreOuter = bikeLength(90 + 12 / 2); // circle r90 with a 12px stroke
  return {
    scale,
    barShift: [...barShift],
    rearAxle: bikePoint(...REAR_AXLE),
    frontAxle: bikePoint(...FRONT_AXLE),
    tyreOuter,
    tyreTube: bikeLength(12 / 2),
    rim: { radius: bikeLength(81), tube: bikeLength(5 / 2) },
    spokes: { count: 12, length: bikeLength(77), radius: bikeLength(2.3 / 2) },
    hub: { radius: bikeLength(8) },
    // Wheel space (+Y up), turning with the wheel: the SVG's M12 −77 L27 −73 stroke.
    reflector: { from: [bikeLength(12), bikeLength(77)], to: [bikeLength(27), bikeLength(73)], radius: bikeLength(6 / 2) },
    bottomBracket: bikePoint(510, 482),
    crankLength: bikeLength(34),
    // Crank arms sit outside the chain guard (DESIGN.md 2.4); the SVG arm is 7px wide with an r7 cap.
    crankArm: { radius: bikeLength(7 / 2), cap: bikeLength(7), z: 0.42 * scale },
    chainringRadius: bikeLength(24),
    chainringZ: 0.18 * scale,
    // 3D-only: pedals stay level, centred on the crank end; the foot rests on their top. Not scaled with the
    // bicycle: the refined bird's feet keep their size, and their inner toe edge (0.33 from the pedal centre)
    // must pass outside the crank arm and cap at every crank angle.
    pedalZ,
    pedalHalfThickness: 0.06 * scale,
    pedalLength: bikeLength(32), // pedal bar −10..22
    // Between the SVG's painted 7px and outlined 13px tube; the 3D frame has no outline.
    frameTube: 0.065 * scale,
    seatTop: bikePoint(435, 370),
    seatPost: { from: bikePoint(446, 393), to: bikePoint(435, 353), radius: bikeLength(8 / 2), inSaddle: postInSaddle },
    saddle: { min: bikePoint(413, 363), max: bikePoint(466, 348) }, // bounds of the saddle path
    headTop: bikePoint(...HEAD_TOP),
    topTubeEnd: bikePoint(635, 360),
    // The stem runs from the head top to the (shifted) bar clamp.
    stem: { from: bikePoint(626, 330), to: barPoint(617, 307), radius: bikeLength(8 / 2) },
    // Swept-back city bar: line to (645,301), then Q (659,301) → (657,315); the brown sleeve covers the bend.
    bar: {
      points: [barPoint(617, 307), barPoint(645, 301)],
      control: barPoint(659, 301),
      end: barPoint(657, 315),
      radius: bikeLength(8 / 2),
      sleeveStart: barPoint(642, 301),
      sleeveRadius: bikeLength(10 / 2),
    },
    grip: { point: barPoint(...grip), z: 0.42 * scale },
    bell: { center: barPoint(620, 303), radius: bikeLength(8) },
    // The lever end moves with the bar; the cable still ends on the fork.
    brakeCable: { from: barPoint(632, 317), control: bikePoint(665, 356), to: bikePoint(662, 427), radius: bikeLength(2 / 2) },
    lamp: {
      min: bikePoint(659, 377),
      max: bikePoint(682, 357),
      lens: { center: bikePoint(...LENS), rx: bikeLength(4), ry: bikeLength(9) },
      mount: bikePoint(...forkAt(LENS[1])),
    },
    rack: { from: bikePoint(281, 376), to: bikePoint(390, 376), struts: [bikePoint(298, 379), bikePoint(381, 379)], radius: bikeLength(5 / 2) },
    // The SVG paints an r92 fender over the r96 tyre; the 3D one keeps its arcs but clears the tyre (r1.72 at full
    // size). Arcs run counter-clockwise from start to end over the top of each wheel.
    fender: {
      radius: 1.72 * scale,
      thickness: bikeLength(9),
      arcs: {
        rear: [bikeAngle([424, 450], REAR_AXLE), bikeAngle([250, 471], REAR_AXLE)],
        front: [bikeAngle([770, 461], FRONT_AXLE), bikeAngle([602, 440], FRONT_AXLE)],
      },
    },
    // Outline of two circles joined by tangents: r22 round the bottom bracket, r12 at (342,487).
    chainGuard: {
      front: { center: bikePoint(510, 482), radius: bikeLength(22) },
      rear: { center: bikePoint(342, 487), radius: bikeLength(12) },
      z: 0.26 * scale,
    },
    // 3D-only (the SVG bicycle has none): a two-legged centre stand behind the bottom bracket, dark legs with
    // cream pads. Each leg swings about its own hinge from `stowed` (folded back under the chain stays and
    // the chain guard, splayed clear of the tyre) down to its pad, whose lowest point then touches y = 0; the
    // bicycle stays upright. The pad sits just behind the hinge, so it reaches the ground still moving down:
    // any further forward and it would dip through the ground and rise back. Folded, the leg hugs the lower
    // edge of the chain guard; at full size it cannot hide behind the guard, since the gap between the spokes
    // (|z| <= 0.08) and the guard plate (z >= 0.225) is thinner than the pad plus its clearances. Near side
    // values (the full-size stand × scale); the far leg mirrors z.
    kickstand: {
      hinge: [-0.47 * scale, 1.52 * scale],
      hingeZ: 0.1 * scale,
      pad: [-0.5 * scale, 0.34 * scale], // down: pad centre x and z
      stowed: [...stowed], // folded leg direction from the hinge
      radius: 0.035 * scale,
      padRadius: 0.06 * scale,
    },
    colors: {
      dark: '#234c50', // strokes: frame outline, saddle, stem, bar, rack, crank, pedals, brake, fender edge
      tyre: '#234c50',
      disc: '#fff9e9', // translucent wheel disc, omitted by default
      rim: '#fcf4d9',
      spoke: '#52817f',
      hub: '#efb153',
      reflector: '#edab53',
      fender: '#f4c765',
      frame: '#e8775f',
      grip: '#bc8056',
      bell: '#f6c967',
      lamp: '#efb858',
      lens: '#fff4c7',
      chainGuard: '#d6ded0',
      chain: '#64827a',
      chainring: '#f8e1aa',
      crankCap: '#f9f4df',
    },
  };
}

// Tall (task 008): the SVG bicycle 1:1. The pedals sit wider than DESIGN 2.4's 0.55 so the refined bird's foot
// keeps its size: its inner toe edge (0.33 from the pedal centre) passes outside the crank arm and cap (z ≤ 0.49)
// at every crank angle, instead of the arm cutting through it. The wing tip holds the bar where the SVG wing's
// finger feathers do (628, 312), between the stem and the sleeve.
const TALL_BIKE = makeBike({ scale: 1, barShift: [0, 0], pedalZ: 0.85, grip: [628, 312], stowed: [-1, -0.22, 0.11], postInSaddle: false });

// Short (task 009, the user's choice): the whole bicycle at 0.6, so the riding legs come close to the standing
// ones. The handlebar group moves by (0.35, 0.45) so the folded wings can still reach it. The wing holds the bar
// near the sleeve (638, 310): on the short bicycle the folded wing reaches past the grip, and a grip near the
// sleeve keeps the bar's sweep shallow so the sleeve sits under the wing. The kickstand folds a little further
// down (−0.26) to keep the smaller pad off the tyre, and the seat post ends inside the saddle, so nothing of it
// stands proud of the seat the bird sits on.
const SHORT_BIKE = makeBike({ scale: 0.6, barShift: [0.35, 0.45], pedalZ: 0.7, grip: [638, 310], stowed: [-1, -0.26, 0.11], postInSaddle: true });

// Riding pose of the refined bird: createStandingBird({ round, wings, smooth }) at setDepth(1). These are the
// design's starting values (DESIGN.md 2.2–2.3, the 1u = 60px sweep); later stages tune them here only.
// Bird space: the standing model's own frame (feet at y = 0, facing +X); z is the near side and mirrors.
// `seat` is what differs between the versions: the hip placement, the legs, the wing's shoulder and the far
// leg's tint fade (riding-pelican.js: the tint is gone by fade[1], fading from fade[0], which must lie inboard
// of the far ankle on its pedal).
function makeBird({ lift, offsetX, lean, hip, thigh, shin, wingPivot, shareRange, farTintFade }) {
  return {
    refinements: { round: true, wings: true, smooth: true }, // user decision: always the refined bird
    lift,
    offsetX,
    lean,
    hip, // hidden in the belly; the standing hips are (−.65, 1.22, .42) / (−.17, 1.22, −.40)
    thigh,
    shin,
    footBall: [0.25, 0, 0], // foot space: the ball of the foot, pressed on the pedal axle
    ankleInFoot: [0, 0.14, 0], // foot space: the ankle, as standing-feet.js builds the foot Group
    bob: svgLength(1.6), // the SVG's 1.6px rise (the design text rounds it to 0.025)
    blink: { ry: [6, 6, 0.7, 6, 6], keyTimes: [0, 0.86, 0.88, 0.9, 1] }, // eye ry animate
    // Each folded wing swings forward on its own side about a shoulder pivot (near side here; the far side
    // mirrors z): the shortest turn that points the pivot→tip line at the grip, then `twist` about that line.
    // The wing keeps its outer face outward, so letting go and folding back is one continuous motion.
    wing: {
      hand: [-1.909, 1.4615, 0.2899], // tip of the near folded wing at depth 1 (morphs applied)
      pivot: wingPivot,
      twist: (-40 * Math.PI) / 180,
      shareRange, // allowed pivot-to-grip distance as a share of pivot-to-tip
      // Letting go: the wing opens out to the side (abduction about the horizontal line across it) by
      // `abduction` half way, where the swing alone would hang it straight down past the legs: `leave` of it as
      // sin(π·s), easing off the bar from the start, the rest as a C2 bump that only opens up mid-way, clear
      // of the grip ends and the brake cable. The pivot slides outward by `shift` · sin(π·s), so the wing
      // clears the body and the seated legs on the way back.
      release: { abduction: (55 * Math.PI) / 180, leave: (14 * Math.PI) / 180, shift: 0.12 },
    },
    farTintFade,
    // The standing pose it comes down into: createStandingBird at depth 1, from standing-feet.js LEGS (private
    // there). The riding pelican checks these against the live bird before posing it.
    stance: {
      near: { foot: [-0.63, 0, 0.42], yaw: -0.65, hip: [-0.65, 1.22, 0.42] },
      far: { foot: [-0.15, 0, -0.4], yaw: -0.3, hip: [-0.17, 1.22, -0.4] },
    },
  };
}

// Tall: the body pitches forward by `lean` about the hip, then the hip moves by (offsetX, lift): the belly bottom
// (−0.44, 0.912) lands at world y 3.46 (SVG y 375), the hip at world (−0.68, 3.755). The SVG's 92/85px keep
// their ratio; 2.80 in total stretches 0.52–0.91 over the loop, bob and pedalZ included. The far leg's tint is
// full on its pedal (z = −0.85) and fades as the swinging ankle comes back in over the middle of the bicycle.
const TALL_BIRD = makeBird({
  lift: 2.555, offsetX: -0.18, lean: (8 * Math.PI) / 180, hip: [-0.5, 1.2, 0.41], thigh: 1.46, shin: 1.34,
  wingPivot: [0.1, 2.5, 0.4], shareRange: [0.8, 0.98], farTintFade: [-0.8, 0],
});

// Short: on the 0.6 bicycle the belly sits on the saddle (its bottom under the saddle top all through the bob)
// yet clears the top tube by 0.033 (a smaller lean lifts the front of the belly), and the tail clears the rack
// by 0.19; the hip sits low in the belly (0.065 under the skin) so the short legs reach the pedals without
// locking straight. 1.75 in total: the hip-to-ankle span stretches 0.530–0.907 of it over the loop, bob and
// pedalZ included; the knee stays out of the belly. The shoulder moves forward and up of the full-size
// (0.1, 2.5): the grip is lower and nearer, and a shoulder there keeps the wing's root out of the body and its
// tip off the sleeve. The far tint is full on its pedal (z = −0.7) and while the foot is drawn up for the hop.
const SHORT_BIRD = makeBird({
  lift: 1.33, offsetX: 0.15, lean: (5 * Math.PI) / 180, hip: [-0.45, 1.05, 0.41], thigh: 0.67, shin: 1.08,
  wingPivot: [0.3, 2.6, 0.4], shareRange: [0.4, 0.98], farTintFade: [-0.65, 0],
});

// Climbing off on the near side, one foot at a time (ride frame; times are the story clock, checked against the
// timeline's windows by ride-dismount.js). There is always a foot on a pedal or on the ground: the bird rises
// onto the near pedal and the far foot leaves its pedal as it rises (eased in over the first 0.1 s or so). The
// far knee swings out (z ≈ −1.5, under the wing) as the foot comes up behind; the leg passes over the rack
// almost straight, the ankle at about (−3.06, 4.4, 0), never above the hip, the shin near level, with a short
// easing at the top of the arc; then it drops like a pendulum, toes forward and down, speeding up, and eases
// onto its stance spot beside the bicycle. The near foot then steps off its pedal (eased in), forward round
// the front of the far leg, and the bird settles into the standing pose.
// How the keys were made (offline; nothing here is computed at run time): the far ankle's path through a few
// waypoints (centripetal Catmull-Rom from the pedal ankle to the stance ankle), the foot's yaw and pitch hung on
// the path's arc length, keys re-timed so the largest per-frame step (knee, ankle, sole, toe tip, foot turn)
// follows a target profile over the window (eased off the pedal, slower at the top of the arc, faster going
// down, eased onto the ground), then an evolution-strategy search over waypoints, turns and profile against
// the tests' limits with a margin: key points ≤ 0.045 and foot turns ≤ 0.02 per 240Hz frame, the knee bent
// toward the toes (toes ≥ 30° off the leg axis), leg and foot ≥ 0.02 off the bicycle, the swinging foot ≥ 0.25
// off saddle, rack, fender and rear wheel, the wing ≥ 0.03 off the leg, the legs ≥ 0.01 apart, the far leg's
// tint gone (fading over ≥ 0.2 s, ≤ 0.035 a frame) before either far knee or ankle crosses to the near side,
// every ankle within reach. The near step (the same re-timing) and the body and tuck keys were fitted by hand
// against the leg-length rate (≤ 2 per s, only with the foot supported), the legs' clearance and a knee speed
// that dies out into the stand.
// - body: the hip pivot (bird.hip at z = 0) and the forward lean, from the seated hip (stepUp.start) through
//   these keys (the first at stepUp.end) to `stand` (standing), arrive() per channel (ride-dismount.js).
// - feet: each foot's swing, from its pedal (the side's swing window start) through these keys to its stance
//   spot beside the bicycle (window end): the ankle (ride frame), the foot's yaw about +Y and its pitch (toes
//   down, radians), monotone cubic per channel. The knee bends toward the toes, so the swinging foot keeps its
//   toes off the hip→ankle line: the far knee points out and back as the foot lifts behind, forward as it drops.
// - tuck: each leg's length (riding thigh + shin, tucking up to the standing leg at hips.end) through these
//   keys, monotone; it changes only while that foot is on its pedal or on the ground, never in the air.
const DISMOUNT = {
  stand: [-0.4, 0, 1.95],
  body: [
    { at: 11.5, pivot: [-0.5, 4.25, 0.12], lean: 0.2 },
    { at: 11.72, pivot: [-0.45, 4.43, 0.2], lean: 0.38 },
    { at: 11.88, pivot: [-0.5, 4.42, 0.55], lean: 0.32 },
    { at: 12.1, pivot: [-0.74, 3.85, 1.12], lean: 0.14 },
    { at: 12.45, pivot: [-1, 2.78, 1.65], lean: 0 },
    { at: 12.61, pivot: [-1, 2.66, 1.72], lean: 0 },
    { at: 12.8, pivot: [-0.97, 2.33, 1.8], lean: 0 },
    { at: 13.06, pivot: [-0.93, 1.6, 1.9], lean: 0 },
    { at: 13.28, pivot: [-0.9, 1.16, 1.95], lean: 0 },
  ],
  feet: {
    near: [
      { at: 12.6442, ankle: [-0.7925, 1.8872, 0.8706], yaw: -0.0026, pitch: 0.0009 },
      { at: 12.6854, ankle: [-0.5824, 1.9191, 0.9711], yaw: -0.0715, pitch: 0.0255 },
      { at: 12.73, ankle: [-0.2856, 1.8255, 1.1711], yaw: -0.206, pitch: 0.0645 },
      { at: 12.7747, ankle: [-0.0808, 1.5717, 1.386], yaw: -0.3326, pitch: 0.0933 },
      { at: 12.8168, ankle: [-0.0166, 1.2696, 1.6212], yaw: -0.4381, pitch: 0.0978 },
      { at: 12.8574, ankle: [-0.0924, 0.9606, 1.8487], yaw: -0.533, pitch: 0.0775 },
      { at: 12.8975, ankle: [-0.2486, 0.6668, 2.0548], yaw: -0.5968, pitch: 0.0519 },
      { at: 12.9373, ankle: [-0.511, 0.4252, 2.21], yaw: -0.6271, pitch: 0.0273 },
      { at: 12.9778, ankle: [-0.819, 0.254, 2.3064], yaw: -0.6458, pitch: 0.0057 },
      { at: 13.0187, ankle: [-0.9977, 0.1594, 2.3588], yaw: -0.6499, pitch: 0.0002 },
    ],
    far: [
      { at: 11.1581, ankle: [0.2466, 1.9272, -0.8529], yaw: 0.002, pitch: 0.0002 },
      { at: 11.2062, ankle: [-0.0047, 2.1439, -0.8664], yaw: 0.0523, pitch: 0.0073 },
      { at: 11.2541, ankle: [-0.3742, 2.4351, -0.886], yaw: 0.1648, pitch: 0.0562 },
      { at: 11.3035, ankle: [-0.7897, 2.6586, -0.9161], yaw: 0.3184, pitch: 0.1535 },
      { at: 11.3569, ankle: [-1.2264, 2.8389, -0.9416], yaw: 0.518, pitch: 0.1614 },
      { at: 11.4093, ankle: [-1.6532, 3.0402, -0.9214], yaw: 0.6884, pitch: 0.1678 },
      { at: 11.457, ankle: [-2.0755, 3.2442, -0.8758], yaw: 0.7479, pitch: 0.2051 },
      { at: 11.5054, ankle: [-2.4756, 3.4721, -0.7876], yaw: 0.7854, pitch: 0.2921 },
      { at: 11.5532, ankle: [-2.7191, 3.6881, -0.6537], yaw: 0.8282, pitch: 0.4264 },
      { at: 11.6026, ankle: [-2.8462, 3.8674, -0.5123], yaw: 0.8517, pitch: 0.5169 },
      { at: 11.6503, ankle: [-2.9665, 4.0506, -0.3516], yaw: 0.7941, pitch: 0.5045 },
      { at: 11.7149, ankle: [-3.1108, 4.2653, -0.18], yaw: 0.5889, pitch: 0.4554 },
      { at: 11.7704, ankle: [-3.156, 4.3787, 0.1928], yaw: 0.3544, pitch: 0.4742 },
      { at: 11.8271, ankle: [-3.0633, 4.2778, 0.6204], yaw: 0.1317, pitch: 0.5515 },
      { at: 11.8753, ankle: [-2.9168, 4.0189, 0.9602], yaw: 0.0297, pitch: 0.5373 },
      { at: 11.9229, ankle: [-2.7356, 3.6588, 1.1814], yaw: -0.0352, pitch: 0.4697 },
      { at: 11.9707, ankle: [-2.5657, 3.26, 1.3453], yaw: -0.1411, pitch: 0.3972 },
      { at: 12.0182, ankle: [-2.4739, 2.8184, 1.4457], yaw: -0.2454, pitch: 0.3429 },
      { at: 12.0657, ankle: [-2.5759, 2.3682, 1.3738], yaw: -0.2998, pitch: 0.364 },
      { at: 12.1112, ankle: [-2.4512, 1.969, 1.5011], yaw: -0.3342, pitch: 0.3982 },
      { at: 12.1587, ankle: [-2.1599, 1.6781, 1.7271], yaw: -0.3243, pitch: 0.39 },
      { at: 12.2065, ankle: [-1.8887, 1.2977, 1.7908], yaw: -0.272, pitch: 0.3332 },
      { at: 12.2545, ankle: [-1.6199, 0.9083, 1.7893], yaw: -0.2283, pitch: 0.2564 },
      { at: 12.3029, ankle: [-1.3147, 0.5488, 1.7531], yaw: -0.1962, pitch: 0.1407 },
      { at: 12.3505, ankle: [-0.925, 0.3207, 1.6593], yaw: -0.2379, pitch: 0.0473 },
      { at: 12.3977, ankle: [-0.6193, 0.199, 1.5649], yaw: -0.2971, pitch: 0.0019 },
    ],
  },
  tuck: {
    near: [
      { at: 11.7, length: 2.8 },
      { at: 12, length: 2.5 },
      { at: 12.3, length: 2.17 },
      { at: 12.5, length: 1.9 },
      { at: 12.6, length: 1.76 },
      { at: 13.06, length: 1.76 },
      { at: 13.15, length: 1.64 },
      { at: 13.26, length: 1.45 },
      { at: 13.38, length: 1.25 },
    ],
    far: [
      { at: 12.45, length: 2.8 },
      { at: 12.54, length: 2.72 },
      { at: 12.7, length: 2.44 },
      { at: 12.9, length: 2.08 },
      { at: 13.1, length: 1.73 },
      { at: 13.28, length: 1.42 },
      { at: 13.42, length: 1.2 },
    ],
  },
};

// Hopping off, the bird's way (task 009): the wings let go of the bar, the bird crouches on the saddle with its
// feet drawn up off the pedals, springs up and out toward the near side (+Z) as the kickstand drops, flies a
// parabola with its legs tucked and its wings opening for one beat, lands on the near side with its knees
// giving, and rises into the standing pose. Geometry only; the times are the timeline's windows (release,
// crouch, hop, tuck, reach, flap, land, settle, standing) and ride-dismount.js checks the two together.
// - stand: the standing bird's translation (its feet on the ground beside the bicycle).
// - gravity: the constant downward acceleration of the hip pivot while airborne (u/s²).
// - crouch: the hip pivot (bird.hip at z = 0, ride frame) and lean at the bottom of the crouch, as an offset
//   from the seated hip pivot; `spring` seconds before take-off the body leaves that rest and springs up to the
//   take-off speed.
// - takeoff: the hip pivot at take-off (hop.start), offset from the seated hip pivot; the take-off velocity is
//   what carries it to `touchdown` under `gravity` over the hop window.
// - touchdown, low: the hip pivot at touchdown and at the bottom of the landing, offsets from the standing hip
//   pivot (stand + bird.hip at z = 0); airLean is the lean at touchdown.
// - tuck: each foot drawn up under the belly (bird space): ankle, yaw about +Y, pitch (toes down, radians).
// - flap: the wings' one beat in the air: they open out by `open` (radians, about the horizontal line across
//   each wing) and rise by `lift` (about the body's long axis), beat down by `beat` of that and open again, then
//   fold.
const HOP = {
  stand: [-1.8, 0, 2.2],
  gravity: 16,
  crouch: { pivot: [-0.02, -0.01, 0], lean: 0.07 }, // sinks a little onto the saddle, belly lifted off the top tube
  spring: 0.15,
  takeoff: [-0.05, 0.5, 0.06],
  touchdown: [0.193, -0.06, -0.217],
  low: [0, -0.44, 0],
  airLean: 0.05,
  tuck: {
    near: { ankle: [-0.22, 0.97, 0.4], yaw: -0.5, pitch: 0.1 },
    far: { ankle: [-0.58, 0.95, -0.38], yaw: 0.25, pitch: 0.1 },
  }, // toes turned out a little (the far toes clear the top tube) and pitched down
  flap: { open: (80 * Math.PI) / 180, lift: (55 * Math.PI) / 180, beat: 0.4 },
};

/** The two versions' rigs: tall (the SVG bicycle, climbing off step by step) and short (the 0.6 bicycle, hopping off). */
export const RIDE_RIGS = deepFreeze({
  tall: {
    style: 'step',
    timing: { ...TIMING },
    bike: TALL_BIKE,
    bird: TALL_BIRD,
    dismount: DISMOUNT,
    speed: { road: (TAU * TALL_BIKE.tyreOuter) / TIMING.wheelPeriod }, // one tyre circumference per wheel turn
  },
  short: {
    style: 'hop',
    timing: { ...TIMING },
    bike: SHORT_BIKE,
    bird: SHORT_BIRD,
    hop: HOP,
    speed: { road: (TAU * SHORT_BIKE.tyreOuter) / TIMING.wheelPeriod },
  },
});

// ---------------------------------------------------------------------------------------------------------
// Validation: a schema walk for presence, type and range, then the relations the rest of the ride relies on.

const LEAF = Symbol('rig leaf');
const number = (min, max, { integer = false, openMin = false } = {}) => ({ [LEAF]: 'number', min, max, integer, openMin });
const positive = (max) => number(0, max, { openMin: true });
const point = (...bounds) => ({ [LEAF]: 'point', bounds });
const list = (item, length) => ({ [LEAF]: 'list', item, length });
// Key lists (the step dismount's): any number of entries from `min` up, each checked against `item`.
const keys = (item, min = 1) => ({ [LEAF]: 'keys', item, min });
const COLOR = { [LEAF]: 'color' };
const FLAG = { [LEAF]: 'flag' };

const [PICTURE_MIN, PICTURE_MAX] = [svgToWorld(0, 680), svgToWorld(1000, 0)];
const PICTURE = point([PICTURE_MIN[0], PICTURE_MAX[0]], [PICTURE_MIN[1], PICTURE_MAX[1]]); // inside the 1000×680 SVG
const WHEEL = point([-2, 2], [-2, 2]);
const BIRD_POINT = point([-3, 3], [0, 5.5], [0, 1.5]);
const SIDE_POINT = point([-3, 3], [0, 5.5], [-1.5, 1.5]); // bird space, either side
const RIDE_POINT = point([-6, 6], [0, 10], [-4, 4]); // ride frame
const STANCE = { foot: SIDE_POINT, yaw: number(-Math.PI, Math.PI), hip: SIDE_POINT };
const KEY_TIME = positive(60);
const BODY_KEY = { at: KEY_TIME, pivot: RIDE_POINT, lean: number(-Math.PI / 4, Math.PI / 4) };
// pitch: toes down (radians), from toes straight up (−π/2) to toes pointing back (π); past π/2 they point down and back.
const SWING_KEY = { at: KEY_TIME, ankle: RIDE_POINT, yaw: number(-Math.PI, Math.PI), pitch: number(-Math.PI / 2, Math.PI) };
const TUCK_KEY = { at: KEY_TIME, length: positive(10) };
const OFFSET = point([-3, 3], [-3, 3], [-3, 3]); // ride frame, from a hip pivot
// pitch: toes down (radians), from toes straight up (−π/2) through straight down (π/2) to pointing back (π).
const TUCK = { ankle: SIDE_POINT, yaw: number(-Math.PI, Math.PI), pitch: number(-Math.PI / 2, Math.PI) };
const FOOT_POINT = point([-1, 1], [-0.5, 0.5], [-0.5, 0.5]);
const PERIOD = positive(600);
const ANGLE = number(-Math.PI, Math.PI);
const Z = positive(1.5);
const tube = (max = 0.3) => positive(max);

// The sections every rig has; the way off the bicycle adds its own (STYLE_SCHEMA, by rig.style).
const COMMON_SCHEMA = {
  timing: Object.fromEntries(Object.keys(TIMING).map((key) => [key, key === 'cloudSpeedPx' ? positive(1000) : PERIOD])),
  bike: {
    scale: number(0.4, 1),
    barShift: point([-1, 1], [-1, 1]),
    rearAxle: PICTURE,
    frontAxle: PICTURE,
    tyreOuter: positive(4),
    tyreTube: tube(0.5),
    rim: { radius: positive(4), tube: tube() },
    spokes: { count: number(3, 64, { integer: true }), length: positive(4), radius: tube(0.1) },
    hub: { radius: tube(0.5) },
    reflector: { from: WHEEL, to: WHEEL, radius: tube(0.2) },
    bottomBracket: PICTURE,
    crankLength: positive(2),
    crankArm: { radius: tube(0.2), cap: tube(), z: Z },
    chainringRadius: positive(1),
    chainringZ: Z,
    pedalZ: Z,
    pedalHalfThickness: tube(),
    pedalLength: positive(1.5),
    frameTube: tube(),
    seatTop: PICTURE,
    seatPost: { from: PICTURE, to: PICTURE, radius: tube(), inSaddle: FLAG },
    saddle: { min: PICTURE, max: PICTURE },
    headTop: PICTURE,
    topTubeEnd: PICTURE,
    stem: { from: PICTURE, to: PICTURE, radius: tube() },
    bar: { points: list(PICTURE, 2), control: PICTURE, end: PICTURE, radius: tube(), sleeveStart: PICTURE, sleeveRadius: tube() },
    grip: { point: PICTURE, z: Z },
    bell: { center: PICTURE, radius: tube() },
    brakeCable: { from: PICTURE, control: PICTURE, to: PICTURE, radius: tube(0.1) },
    lamp: { min: PICTURE, max: PICTURE, lens: { center: PICTURE, rx: tube(), ry: tube() }, mount: PICTURE },
    rack: { from: PICTURE, to: PICTURE, struts: list(PICTURE, 2), radius: tube(0.2) },
    fender: { radius: positive(4), thickness: tube(0.5), arcs: { rear: list(ANGLE, 2), front: list(ANGLE, 2) } },
    chainGuard: { front: { center: PICTURE, radius: positive(1) }, rear: { center: PICTURE, radius: positive(1) }, z: Z },
    kickstand: { hinge: PICTURE, hingeZ: Z, pad: point([-6, 6], [0, 1.5]), stowed: point([-1, 1], [-1, 1], [-1, 1]), radius: tube(0.2), padRadius: tube(0.3) },
    colors: Object.fromEntries(Object.keys(TALL_BIKE.colors).map((key) => [key, COLOR])),
  },
  bird: {
    refinements: { round: FLAG, wings: FLAG, smooth: FLAG },
    lift: number(0, 10),
    offsetX: number(-5, 5),
    lean: number(0, Math.PI / 4),
    hip: BIRD_POINT,
    thigh: positive(5),
    shin: positive(5),
    footBall: FOOT_POINT,
    ankleInFoot: FOOT_POINT,
    bob: number(0, 0.2),
    blink: { ry: list(number(0, 50), 5), keyTimes: list(number(0, 1), 5) },
    wing: {
      hand: BIRD_POINT,
      pivot: BIRD_POINT,
      twist: ANGLE,
      shareRange: list(positive(1), 2),
      release: { abduction: number(0, Math.PI / 2), leave: number(0, Math.PI / 2), shift: number(0, 0.5) },
    },
    farTintFade: list(number(-2, 0), 2),
    stance: { near: STANCE, far: STANCE },
  },
  speed: { road: positive(100) },
};

const STYLE_SCHEMA = {
  step: {
    dismount: {
      stand: RIDE_POINT,
      body: keys(BODY_KEY),
      feet: { near: keys(SWING_KEY), far: keys(SWING_KEY) },
      tuck: { near: keys(TUCK_KEY), far: keys(TUCK_KEY) },
    },
  },
  hop: {
    hop: {
      stand: RIDE_POINT,
      gravity: positive(100),
      crouch: { pivot: OFFSET, lean: number(-Math.PI / 4, Math.PI / 4) },
      spring: positive(2),
      takeoff: OFFSET,
      touchdown: OFFSET,
      low: OFFSET,
      airLean: number(-Math.PI / 4, Math.PI / 4),
      tuck: { near: TUCK, far: TUCK },
      flap: { open: positive((3 * Math.PI) / 4), lift: number(0, Math.PI / 2), beat: number(0, 1) },
    },
  },
};

const describe = (value) => (typeof value === 'string' ? JSON.stringify(value) : Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value === 'object' ? 'an object' : String(value));

function checkNumber(value, rule, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Ride rig ${path} must be a finite number, got ${describe(value)}.`);
  if (rule.integer && !Number.isInteger(value)) throw new RangeError(`Ride rig ${path} must be an integer, got ${value}.`);
  if (value < rule.min || value > rule.max || (rule.openMin && value === rule.min)) {
    throw new RangeError(`Ride rig ${path} must be within ${rule.openMin ? '(' : '['}${rule.min}, ${rule.max}], got ${value}.`);
  }
}

function checkNode(value, rule, path) {
  switch (rule[LEAF]) {
    case 'number':
      return checkNumber(value, rule, path);
    case 'point':
      if (!Array.isArray(value) || value.length !== rule.bounds.length) {
        throw new TypeError(`Ride rig ${path} must be a point of ${rule.bounds.length} finite numbers, got ${describe(value)}.`);
      }
      return value.forEach((coordinate, index) => checkNumber(coordinate, number(...rule.bounds[index]), `${path}[${index}]`));
    case 'list':
      if (!Array.isArray(value) || value.length !== rule.length) throw new TypeError(`Ride rig ${path} must list ${rule.length} entries, got ${describe(value)}.`);
      return value.forEach((item, index) => checkNode(item, rule.item, `${path}[${index}]`));
    case 'keys':
      if (!Array.isArray(value) || value.length < rule.min) throw new TypeError(`Ride rig ${path} must list at least ${rule.min} key${rule.min === 1 ? '' : 's'}, got ${Array.isArray(value) ? `${value.length}` : describe(value)}.`);
      return value.forEach((item, index) => checkNode(item, rule.item, `${path}[${index}]`));
    case 'color':
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new TypeError(`Ride rig ${path} must be a #rrggbb colour, got ${describe(value)}.`);
      return undefined;
    case 'style':
      return undefined; // read by schemaOf before the walk
    case 'flag':
      if (typeof value !== 'boolean') throw new TypeError(`Ride rig ${path} must be a boolean, got ${describe(value)}.`);
      return undefined;
    default:
      break;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Ride rig ${path || 'root'} must be an object, got ${describe(value)}.`);
  for (const key of Object.keys(rule)) {
    const child = path ? `${path}.${key}` : key;
    if (!Object.hasOwn(value, key) || value[key] === undefined) throw new TypeError(`Ride rig ${child} is missing.`);
    checkNode(value[key], rule[key], child);
  }
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(rule, key)) throw new RangeError(`Unknown ride rig key: ${path ? `${path}.${key}` : key}.`);
  }
  return undefined;
}

// Minimum clearance between the fender's inner edge and the tyre (DESIGN.md acceptance 4).
const FENDER_CLEARANCE = 0.02;
const EPSILON = 1e-9;

// Hip-to-ankle span of a leg over the whole crank circle and bob range, in the ride frame. The ankle
// circle is the crank circle shifted by the foot offsets; lean pivots about the hip, so only bob moves it.
function legSpan({ bike, bird }) {
  const centerX = bike.bottomBracket[0] - bird.footBall[0] + bird.ankleInFoot[0];
  const centerY = bike.bottomBracket[1] + bike.pedalHalfThickness - bird.footBall[1] + bird.ankleInFoot[1];
  const depth = bike.pedalZ - bird.footBall[2] + bird.ankleInFoot[2] - bird.hip[2];
  const hipX = bird.hip[0] + bird.offsetX;
  const hipY = bird.hip[1] + bird.lift;
  // The planar distance is convex in bob: largest at an end, smallest at the level of the circle centre.
  const planar = (bob) => Math.hypot(hipX - centerX, hipY + bob - centerY);
  const closest = Math.min(bird.bob, Math.max(0, centerY - hipY));
  const far = Math.max(planar(0), planar(bird.bob));
  const nearest = Math.min(planar(0), planar(bird.bob), planar(closest));
  return {
    min: Math.hypot(Math.max(0, nearest - bike.crankLength), depth),
    max: Math.hypot(far + bike.crankLength, depth),
  };
}

function checkRelations(rig) {
  const { timing, bike, bird, speed } = rig;
  const fail = (path, message) => {
    throw new RangeError(`Ride rig ${path} ${message}`);
  };
  for (const axle of ['rearAxle', 'frontAxle']) {
    if (Math.abs(bike[axle][1] - bike.tyreOuter) > EPSILON) fail(`bike.${axle}[1]`, `must equal bike.tyreOuter (${bike.tyreOuter}) so the tyre touches y = 0, got ${bike[axle][1]}.`);
  }
  if (!(bike.frontAxle[0] > bike.rearAxle[0])) fail('bike.frontAxle[0]', `must lie ahead (+X) of bike.rearAxle[0] (${bike.rearAxle[0]}), got ${bike.frontAxle[0]}.`);
  // The whole bicycle is the SVG's scaled about the ground midpoint: the wheelbase and the tyre shrink together.
  const wheelbase = bike.scale * ((FRONT_AXLE[0] - REAR_AXLE[0]) / SVG_UNIT);
  if (Math.abs(bike.frontAxle[0] - bike.rearAxle[0] - wheelbase) > 1e-9) fail('bike.scale', `(${bike.scale}) must scale the SVG wheelbase to the axles' ${bike.frontAxle[0] - bike.rearAxle[0]} (expected ${wheelbase}).`);
  const tyre = bike.scale * ((90 + 12 / 2) / SVG_UNIT);
  if (Math.abs(bike.tyreOuter - tyre) > 1e-9) fail('bike.scale', `(${bike.scale}) must scale the SVG tyre to bike.tyreOuter ${bike.tyreOuter} (expected ${tyre}).`);
  if (!(2 * bike.tyreTube < bike.tyreOuter)) fail('bike.tyreTube', `must be under half of bike.tyreOuter, got ${bike.tyreTube}.`);
  if (bike.rim.radius + bike.rim.tube > bike.tyreOuter - 2 * bike.tyreTube) fail('bike.rim.radius', `must sit inside the tyre (≤ ${bike.tyreOuter - 2 * bike.tyreTube - bike.rim.tube}), got ${bike.rim.radius}.`);
  if (bike.spokes.length > bike.rim.radius) fail('bike.spokes.length', `must end inside bike.rim.radius (${bike.rim.radius}), got ${bike.spokes.length}.`);
  if (!(bike.hub.radius < bike.spokes.length)) fail('bike.hub.radius', `must be smaller than bike.spokes.length, got ${bike.hub.radius}.`);
  const fenderInner = bike.fender.radius - bike.fender.thickness / 2;
  if (!(fenderInner > bike.tyreOuter + FENDER_CLEARANCE)) fail('bike.fender.radius', `inner edge ${fenderInner} must clear the tyre by more than ${FENDER_CLEARANCE}.`);
  for (const side of ['rear', 'front']) {
    const [start, end] = bike.fender.arcs[side];
    if (!(end > start)) fail(`bike.fender.arcs.${side}`, `must run counter-clockwise from start to end, got [${start}, ${end}].`);
  }
  if (!(bike.chainringRadius < bike.crankLength)) fail('bike.chainringRadius', `must be shorter than bike.crankLength (${bike.crankLength}), got ${bike.chainringRadius}.`);
  if (!(bike.chainringZ < bike.chainGuard.z)) fail('bike.chainringZ', `must lie inside bike.chainGuard.z (${bike.chainGuard.z}), got ${bike.chainringZ}.`);
  if (!(bike.chainGuard.z < bike.crankArm.z)) fail('bike.chainGuard.z', `must lie inside bike.crankArm.z (${bike.crankArm.z}), got ${bike.chainGuard.z}.`);
  if (!(bike.crankArm.z < bike.pedalZ)) fail('bike.crankArm.z', `must lie inside bike.pedalZ (${bike.pedalZ}), got ${bike.crankArm.z}.`);
  const { front, rear } = bike.chainGuard;
  if (!(Math.hypot(front.center[0] - rear.center[0], front.center[1] - rear.center[1]) > Math.abs(front.radius - rear.radius))) {
    fail('bike.chainGuard', 'circles must not contain each other.');
  }
  for (const box of ['saddle', 'lamp']) {
    if (!(bike[box].min[0] < bike[box].max[0] && bike[box].min[1] < bike[box].max[1])) fail(`bike.${box}.min`, `must lie below and behind bike.${box}.max.`);
  }
  const road = (TAU * bike.tyreOuter) / timing.wheelPeriod;
  if (Math.abs(speed.road - road) > EPSILON * road) fail('speed.road', `must equal 2π·bike.tyreOuter / timing.wheelPeriod = ${road} so the tyres roll without slipping, got ${speed.road}.`);
  const [shareMin, shareMax] = bird.wing.shareRange;
  if (!(shareMin < shareMax)) fail('bird.wing.shareRange', `must be an increasing [min, max] range, got [${shareMin}, ${shareMax}].`);
  if (!(bird.wing.pivot[0] > bird.wing.hand[0] && bird.wing.pivot[1] > bird.wing.hand[1])) fail('bird.wing.pivot', 'must sit at the shoulder, ahead of and above the wing tip (bird.wing.hand).');
  const [fadeFrom, fadeTo] = bird.farTintFade;
  if (!(fadeFrom < fadeTo)) fail('bird.farTintFade', `must be an increasing [from, to] range, got [${fadeFrom}, ${fadeTo}].`);
  if (!(bird.wing.release.leave <= bird.wing.release.abduction)) fail('bird.wing.release.leave', `must be at most bird.wing.release.abduction (${bird.wing.release.abduction}), got ${bird.wing.release.leave}.`);
  checkKickstand(bike, fail);
  const times = bird.blink.keyTimes;
  if (times[0] !== 0 || times.at(-1) !== 1 || times.some((time, index) => index > 0 && time <= times[index - 1])) {
    fail('bird.blink.keyTimes', `must increase strictly from 0 to 1, got [${times.join(', ')}].`);
  }
  if (!(Math.max(...bird.blink.ry) > 0)) fail('bird.blink.ry', 'must open the eye (a positive ry) at some key time.');
  const span = legSpan(rig);
  const reach = bird.thigh + bird.shin;
  if (!(span.max < reach)) fail('bird.thigh', `+ bird.shin (${reach}) cannot reach the pedals: the hip-to-ankle span reaches ${span.max}.`);
  if (!(span.min > Math.abs(bird.thigh - bird.shin))) fail('bird.thigh', `− bird.shin cannot fold to the nearest pedal: the span shrinks to ${span.min}.`);
  // After the legs: the step dismount's tuck keys are checked against the riding length bird.thigh + bird.shin.
  if (rig.style === 'step') checkDismount(rig, fail);
  else checkHop(rig, fail);
}

// The kickstand: hinge behind the chainring and above its pad, folded back and down, level pads on the ground.
function checkKickstand(bike, fail) {
  const { hinge, hingeZ, pad, stowed, radius, padRadius } = bike.kickstand;
  const fromBracket = Math.hypot(hinge[0] - bike.bottomBracket[0], hinge[1] - bike.bottomBracket[1]);
  if (!(fromBracket > bike.chainringRadius + radius)) fail('bike.kickstand.hinge', `must clear the chainring (radius ${bike.chainringRadius}), got ${fromBracket} from the bottom bracket.`);
  if (!(hinge[1] > padRadius)) fail('bike.kickstand.hinge', `must sit above the pad centre (${padRadius}).`);
  if (!(pad[1] > hingeZ)) fail('bike.kickstand.pad', `z must splay outside the hinge (bike.kickstand.hingeZ ${hingeZ}), got ${pad[1]}.`);
  if (!(stowed[0] < 0 && stowed[1] <= 0 && stowed[2] >= 0)) fail('bike.kickstand.stowed', `must fold back, not up or inward, got [${stowed.join(', ')}].`);
  if (!(radius < padRadius)) fail('bike.kickstand.radius', `must be thinner than the pad (bike.kickstand.padRadius ${padRadius}).`);
  // The swing is the shortest turn from `stowed` to down; at its end the pad must not be rising, or it would
  // have dipped below the ground on the way (the lowest point of its arc would come before the end).
  const down = [pad[0] - hinge[0], padRadius - hinge[1], pad[1] - hingeZ];
  const axis = cross(stowed, down);
  const motion = cross(axis, down);
  if (!(Math.hypot(...axis) > 1e-9)) fail('bike.kickstand.stowed', 'must not point along the down leg.');
  if (!(motion[1] <= 0)) fail('bike.kickstand.pad', `must end the swing from bike.kickstand.stowed at its lowest point; the pad would dip below the ground and rise back (end motion y ${motion[1]}).`);
  if (!(hinge[1] + (Math.hypot(...down) * stowed[1]) / Math.hypot(...stowed) > padRadius)) fail('bike.kickstand.stowed', 'must hold the pad above the ground.');
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The dismount: a stand beside the bicycle on the ground; every key list in time order; a body that stays above
// the ground; swinging ankles above it; legs that only tuck up, from the riding length. Keys against the
// timeline's windows, the standing leg and the reach of each leg are checked by ride-dismount.js.
function checkDismount({ bike, bird, dismount }, fail) {
  const { stand, body, feet, tuck } = dismount;
  if (stand[1] !== 0) fail('dismount.stand[1]', `must be 0 so the standing bird's feet are on the ground, got ${stand[1]}.`);
  if (!(stand[2] > bike.pedalZ)) fail('dismount.stand[2]', `must put the bird on the near side, beyond the pedals (bike.pedalZ ${bike.pedalZ}), got ${stand[2]}.`);
  const increasing = (keys, path) => keys.forEach((key, index) => {
    if (index > 0 && !(key.at > keys[index - 1].at)) fail(`${path}[${index}].at`, `must come after the previous key (${keys[index - 1].at}), got ${key.at}.`);
  });
  increasing(body, 'dismount.body');
  body.forEach((key, index) => {
    if (!(key.pivot[1] > bird.ankleInFoot[1])) fail(`dismount.body[${index}].pivot[1]`, `must hold the hip above the ankles on the ground (${bird.ankleInFoot[1]}), got ${key.pivot[1]}.`);
  });
  const riding = bird.thigh + bird.shin;
  for (const side of ['near', 'far']) {
    increasing(feet[side], `dismount.feet.${side}`);
    feet[side].forEach((key, index) => {
      if (!(key.ankle[1] > bird.ankleInFoot[1])) fail(`dismount.feet.${side}[${index}].ankle[1]`, `must keep the swinging foot off the ground (above ${bird.ankleInFoot[1]}), got ${key.ankle[1]}.`);
    });
    increasing(tuck[side], `dismount.tuck.${side}`);
    tuck[side].forEach((key, index) => {
      const before = index === 0 ? riding : tuck[side][index - 1].length;
      if (!(key.length <= before)) fail(`dismount.tuck.${side}[${index}].length`, `must not grow: the legs only tuck up from the riding ${riding}, got ${key.length} after ${before}.`);
    });
  }
}

// The hop: a stand beside the bicycle on the ground, clear of the pedals; a crouch that sinks, a landing that
// dips below the stand and a touchdown between the two; the tucked feet above the ground and on their own side.
// Everything that needs the timeline (the flight itself, the legs' reach) is checked by ride-dismount.js.
function checkHop({ bike, bird, hop }, fail) {
  const { stand, crouch, low, touchdown, tuck } = hop;
  if (stand[1] !== 0) fail('hop.stand[1]', `must be 0 so the standing bird's feet are on the ground, got ${stand[1]}.`);
  if (!(stand[2] > bike.pedalZ)) fail('hop.stand[2]', `must put the bird on the near side, beyond the pedals (bike.pedalZ ${bike.pedalZ}), got ${stand[2]}.`);
  if (!(crouch.pivot[1] <= 0)) fail('hop.crouch.pivot[1]', `must not lift the seated hip (a crouch sinks), got ${crouch.pivot[1]}.`);
  if (!(low[1] < 0)) fail('hop.low[1]', `must dip below the standing hip (the knees give on landing), got ${low[1]}.`);
  if (!(touchdown[1] > low[1])) fail('hop.touchdown[1]', `must lie above hop.low[1] (${low[1]}): the landing sinks from touchdown, got ${touchdown[1]}.`);
  for (const [key, side] of [['near', 1], ['far', -1]]) {
    const { ankle } = tuck[key];
    if (!(ankle[1] > bird.ankleInFoot[1])) fail(`hop.tuck.${key}.ankle[1]`, `must hold the tucked foot above the ground (${bird.ankleInFoot[1]}), got ${ankle[1]}.`);
    if (!(ankle[2] * side > 0)) fail(`hop.tuck.${key}.ankle[2]`, `must keep the tucked ${key} foot on its own side (z ${side > 0 ? '> 0' : '< 0'}), got ${ankle[2]}.`);
  }
}

// The rig's schema: the common sections, `style` and the section of that way off the bicycle.
function schemaOf(rig) {
  if (rig === null || typeof rig !== 'object' || Array.isArray(rig)) throw new TypeError(`Ride rig root must be an object, got ${describe(rig)}.`);
  if (!Object.hasOwn(rig, 'style') || rig.style === undefined) throw new TypeError(`Ride rig style is missing (one of ${Object.keys(RIDE_STYLES).join(', ')}).`);
  if (!Object.hasOwn(STYLE_SCHEMA, rig.style)) throw new RangeError(`Ride rig style must be one of ${Object.keys(RIDE_STYLES).join(', ')}, got ${describe(rig.style)}.`);
  return { style: { [LEAF]: 'style' }, ...COMMON_SCHEMA, ...STYLE_SCHEMA[rig.style] };
}

/**
 * Throw on any missing key, wrong type, out-of-range value, unknown key or inconsistent pair; return the rig.
 * rig.style picks the way off the bicycle and so the section it needs: 'step' → dismount, 'hop' → hop.
 */
export function validateRig(rig) {
  checkNode(rig, schemaOf(rig), '');
  checkRelations(rig);
  return rig;
}
