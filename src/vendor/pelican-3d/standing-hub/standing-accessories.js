import * as THREE from 'three';
import { TAU, vector, geometryFrom, add, rings, cloth, understated, addMorph, drawnOutline, requireRefinements } from './standing-geometry.js';
import { createCap } from './standing-cap.js';
import { createFeet } from './standing-feet.js';

function collarPoint(angle, vertical, radial = 0) {
  const wave = .004 * Math.sin(angle * 5 + vertical * 1.4);
  const rx = .347 - vertical * .016 + radial + wave;
  const rz = .323 - vertical * .006 + radial + wave;
  return [.110 - vertical * .016 + rx * Math.cos(angle),
    3.220 + vertical * .150 + .008 * Math.cos(angle), rz * Math.sin(angle)];
}

// `round` draws the upper inner wall in toward the neck, closing the cup-like gap; the outer face stays put.
function collarGeometry(options = {}) {
  const { round = false } = options;
  const positions = [];
  const indices = [];
  const rows = 80;
  const columns = 32;
  for (let i = 0; i < rows; i++) {
    const angle = i / rows * TAU;
    for (let j = 0; j < columns; j++) {
      const around = j / columns * TAU;
      const vertical = Math.sign(Math.cos(around)) * Math.abs(Math.cos(around)) ** .3;
      const radial = .019 * Math.sign(Math.sin(around)) * Math.abs(Math.sin(around)) ** .65
        - (round ? .045 * Math.max(0, vertical) ** 2 * THREE.MathUtils.smoothstep(-Math.sin(around), 0, .5) : 0);
      positions.push(...collarPoint(angle, vertical, radial));
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * columns + j;
      const b = ((i + 1) % rows) * columns + j;
      const c = ((i + 1) % rows) * columns + (j + 1) % columns;
      const d = i * columns + (j + 1) % columns;
      indices.push(a, b, d, b, c, d);
    }
  }
  return geometryFrom(positions, indices);
}

function scarfRibbon(parent, name, top, bottom, material, phase, flat, ink) {
  const upper = new THREE.CubicBezierCurve3(...top.map(vector));
  const lower = new THREE.CubicBezierCurve3(...bottom.map(vector));
  const geometry = cloth((u, v) => {
    const point = lower.getPoint(u).lerp(upper.getPoint(u), v);
    // A diagonal fold and crosswise twist give fabric a changing surface normal.
    point.z += .050 * Math.sin(Math.PI * v) * Math.sin(u * Math.PI * 1.55 + phase)
      + .017 * Math.sin(v * TAU + u * 4) * Math.sin(Math.PI * u);
    return point.toArray();
  }, 56, 16, .018);
  const mesh = add(parent, name, geometry, material);
  mesh.userData.fabricThickness = .018;
  const flatTop = new THREE.CubicBezierCurve3(...flat.top.map(vector));
  const flatBottom = new THREE.CubicBezierCurve3(...flat.bottom.map(vector));
  const flatPoint = (u, v) => {
    const point = flatBottom.getPoint(u).lerp(flatTop.getPoint(u), v);
    point.x += flat.notch * (1 - Math.abs(v * 2 - 1)) * u ** 10;
    point.z = .070;
    return point;
  };
  const faceCount = 57 * 17;
  addMorph(mesh, (_point, index) => {
    const id = index % faceCount;
    const point = flatPoint(Math.floor(id / 17) / 56, id % 17 / 16);
    point.z += index < faceCount ? -.009 : .009;
    return point.toArray();
  });
  const outline = [];
  for (let i = 0; i <= 48; i++) outline.push(flatPoint(i / 48, 1).toArray());
  for (let j = 1; j <= 12; j++) outline.push(flatPoint(1, 1 - j / 12).toArray());
  for (let i = 47; i >= 0; i--) outline.push(flatPoint(i / 48, 0).toArray());
  outline.forEach((point) => { point[2] = .094; });
  drawnOutline(parent, `${name}-drawn-outline`, outline, ink, true, .021);
  return mesh;
}

function createScarf(parent, materials, ink, { smooth }) {
  // Lit coral sits a little deeper than the painted coral, like the 3D reference.
  const coral = () => {
    const result = understated(materials.coral, '#e56a4d');
    result.userData.illustrationColor = `#${materials.coral.color.getHexString()}`;
    return result;
  };
  const ribbonMaterial = coral();
  const ribbons = [];
  add(parent, 'standing-scarf-collar', collarGeometry(), coral());
  drawnOutline(parent, 'scarf-collar-drawn-outline', [
    [-.225, 3.372, .37], [-.05, 3.366, .37], [.17, 3.366, .37], [.424, 3.371, .37],
    [.455, 3.205, .37], [.475, 3.071, .37], [.22, 3.055, .37], [.025, 3.064, .37],
    [-.262, 3.082, .37], [-.245, 3.245, .37],
  ], ink, true, .021);
  ribbons.push(scarfRibbon(parent, 'scarf-upper-tail',
    [[-.220, 3.292, -.02], [-.65, 3.32, -.02], [-.71, 3.72, .08], [-1.55, 3.54, .01]],
    // `smooth`: the lower edge stays behind the lower ribbon instead of cutting out through it.
    smooth ? [[-.235, 3.175, .015], [-.69, 3.12, .06], [-1.12, 3.14, .10], [-1.39, 3.31, .06]]
      : [[-.235, 3.175, .015], [-.69, 3.12, .13], [-1.12, 3.14, .17], [-1.39, 3.31, .08]],
    ribbonMaterial, .2, {
      top: [[-.22, 3.31, 0], [-.85, 3.35, 0], [-1.10, 3.69, 0], [-1.85, 3.53, 0]],
      bottom: [[-.22, 3.175, 0], [-.87, 3.15, 0], [-1.35, 2.98, 0], [-1.89, 3.13, 0]], notch: .21,
    }, ink));
  ribbons.push(scarfRibbon(parent, 'scarf-lower-tail',
    [[-.230, 3.232, .035], [-.65, 3.32, .22], [-.94, 3.31, .18], [-1.48, 3.01, .055]],
    [[-.235, 3.118, .030], [-.55, 3.12, .10], [-1.11, 2.66, .10], [-1.55, 2.99, .045]],
    ribbonMaterial, 1.4, {
      top: [[-.22, 3.22, 0], [-.68, 3.32, 0], [-1.02, 3.08, 0], [-1.31, 2.88, 0]],
      bottom: [[-.235, 3.118, 0], [-.75, 3.05, 0], [-.72, 2.94, 0], [-1.035, 2.65, 0]], notch: .11,
    }, ink));
  add(parent, 'scarf-back-knot', rings((t, angle, end) => {
    const width = end ? 0 : Math.sin(Math.PI * t) ** .40;
    return [-.260 + .078 * width * Math.cos(angle), 3.12 + t * .22,
      .025 + .091 * width * Math.sin(angle) + .025 * Math.sin(Math.PI * t)];
  }, 28, 32), ribbonMaterial);

  const stitchMaterial = understated(materials.white, '#ffe1b8');
  for (const side of [-1, 1]) {
    for (const center of [.024, .219]) {
      const stitch = cloth((u, v) => {
        const vertical = -.67 + u * 1.35;
        const x = center + (v - .5) * .040 + .009 * Math.sin(u * Math.PI);
        const rx = .347 - vertical * .016 + .019;
        const angle = Math.acos(THREE.MathUtils.clamp((x - .110 + vertical * .016) / rx, -1, 1)) * side;
        return collarPoint(angle, vertical, .024);
      }, 20, 3, .003);
      add(parent, `scarf-stitch-${side}-${center}`, stitch, stitchMaterial);
    }
  }
  return ribbons;
}

/**
 * Build once. The parent owns and disposes all geometry and materials via traversal.
 * `body` is the flat belly the `round` thighs hang from (see createFeet).
 */
export function createAccessories(parent, materials, refinements, body = null) {
  requireRefinements(refinements, 'Standing accessories');
  for (const key of ['white', 'dark', 'teal', 'mint', 'coral', 'foot']) {
    if (!materials?.[key]?.isMaterial) throw new Error(`Standing accessories material is missing: ${key}.`);
  }
  const cap = createCap(parent, materials, refinements);
  const ink = new THREE.MeshBasicMaterial({ color: '#24465b', transparent: true, depthWrite: false });
  ink.userData.outlineParameters = { visible: false };
  const ribbons = createScarf(parent, materials, ink, refinements);
  const feet = createFeet(parent, materials, refinements, body);

  // The rounder collar arrives with depth, so the flat drawing keeps the original collar.
  const collar = refinements.round ? parent.getObjectByName('standing-scarf-collar') : null;
  if (collar) {
    const round = collarGeometry({ round: true });
    const target = round.getAttribute('position');
    addMorph(collar, (_point, index) => [target.getX(index), target.getY(index), target.getZ(index)]);
    round.dispose();
  }
  function setProgress(progress) {
    if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError(`Standing accessories progress must be in [0, 1]: ${String(progress)}.`);
    }
    cap.setProgress(progress);
    feet.setProgress(progress);
    ink.opacity = Math.max(0, 1 - progress / .40);
    for (const mesh of ribbons) mesh.morphTargetInfluences[0] = 1 - progress;
    if (collar) collar.morphTargetInfluences[0] = THREE.MathUtils.smoothstep(progress, .1, .8);
  }
  setProgress(1);
  return { setProgress };
}
