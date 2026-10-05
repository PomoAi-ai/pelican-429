// Scarf flutter of the riding pelican (DESIGN.md 2.3): a travelling wave along one scarf ribbon, written
// into its base vertices on the CPU. The ribbon is a cloth() mesh from standing-geometry.js: two faces of
// (rows + 1) × (columns + 1) vertices, u = i / rows running from the knot (u = 0) to the free end. Both
// faces move by the same offset, so the cloth keeps its thickness. The flat 2D morph target is left alone
// (the solid bird shows the base vertices at depth 1); rest() puts every base vertex and normal back bit
// for bit.

const TAU = Math.PI * 2;
// dz follows dy at this share, so the ribbon swings a little toward the camera as it lifts.
const DEPTH_SHARE = 0.5;
const ROOT_EASE = 1.5; // dy grows as u^1.5: the knot stays put

function count(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${name} must be an integer of at least ${minimum}, got ${String(value)}.`);
  return value;
}

/**
 * Flutter for one cloth ribbon mesh: update(phase, gain = 1) offsets vertex i by dy = gain · amplitude ·
 * u^1.5 · sin(2π · waves · u − phase) and dz = dy / 2, where u = floor((i mod face) / (columns + 1)) / rows.
 * The gain (0 … 1) lets the flutter die down as the bicycle stops; at gain 0 the ribbon is at rest.
 */
export function createScarfFlutter(mesh, { rows, columns, amplitude, waves } = {}) {
  if (!mesh?.isMesh || !mesh.geometry?.getAttribute('position') || !mesh.geometry.getAttribute('normal')) {
    throw new TypeError('createScarfFlutter needs a mesh with position and normal attributes.');
  }
  const name = mesh.name || 'scarf ribbon';
  count(rows, `${name} rows`, 1);
  count(columns, `${name} columns`, 1);
  if (typeof amplitude !== 'number' || typeof waves !== 'number') throw new TypeError(`${name} needs a numeric amplitude and waves.`);
  if (!Number.isFinite(amplitude) || amplitude < 0) throw new RangeError(`${name} amplitude must be a nonnegative finite number, got ${amplitude}.`);
  if (!Number.isFinite(waves) || waves <= 0) throw new RangeError(`${name} waves must be a positive finite number, got ${waves}.`);
  const { geometry } = mesh;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const face = (rows + 1) * (columns + 1);
  if (position.count !== 2 * face || normal.count !== position.count) {
    throw new RangeError(`${name} has ${position.count} vertices; a two-faced ${rows}×${columns} cloth has ${2 * face}.`);
  }
  const restPosition = Float32Array.from(position.array);
  const restNormal = Float32Array.from(normal.array);
  const along = Float64Array.from({ length: position.count }, (_, i) => Math.floor((i % face) / (columns + 1)) / rows);
  const ease = along.map((u) => u ** ROOT_EASE);
  // The largest offset is amplitude · √(1 + share²); grow the bounds once so culling never clips the ribbon.
  const margin = amplitude * Math.hypot(1, DEPTH_SHARE);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.boundingSphere.radius += margin;
  geometry.boundingBox.expandByScalar(margin);

  function update(phase, gain = 1) {
    if (typeof phase !== 'number' || !Number.isFinite(phase)) throw new TypeError(`${name} flutter needs a finite phase, got ${String(phase)}.`);
    if (typeof gain !== 'number' || !(gain >= 0 && gain <= 1)) throw new RangeError(`${name} flutter gain must be within [0, 1], got ${String(gain)}.`);
    const array = position.array;
    const height = gain * amplitude;
    for (let i = 0; i < position.count; i++) {
      const dy = height * ease[i] * Math.sin(TAU * waves * along[i] - phase);
      array[i * 3] = restPosition[i * 3];
      array[i * 3 + 1] = restPosition[i * 3 + 1] + dy;
      array[i * 3 + 2] = restPosition[i * 3 + 2] + DEPTH_SHARE * dy;
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  function rest() {
    position.array.set(restPosition);
    normal.array.set(restNormal);
    position.needsUpdate = true;
    normal.needsUpdate = true;
  }

  return Object.freeze({ update, rest });
}
