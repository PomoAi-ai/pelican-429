"""Strand groom: every lock guide becomes a clump of hair strands that taper to a point."""
from pathlib import Path

import bpy
import numpy as np

import scene

RNG = np.random.default_rng(1429)
POINTS = 14


def _resample(path, n):
    seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, path[:, i]) for i in range(3)], 1), s[-1]


def _frames(path, normals):
    tang = np.gradient(path, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    up = normals - tang * np.sum(normals * tang, 1, keepdims=True)
    up /= np.linalg.norm(up, axis=1, keepdims=True)
    side = np.cross(tang, up)
    return side, up


def strands(build: Path, density=5200.0):
    data = np.load(build / 'locks.npz')
    starts = np.r_[0, np.cumsum(data['counts'])]
    all_pts, all_rad = [], []
    for i in range(len(data['counts'])):
        raw = data['paths'][starts[i]:starts[i + 1]].astype(np.float64)
        nrm = data['normals'][starts[i]:starts[i + 1]].astype(np.float64)
        path, length = _resample(raw, POINTS)
        idx = np.linspace(0, len(nrm) - 1, POINTS)
        nrm = np.stack([np.interp(idx, np.arange(len(nrm)), nrm[:, k]) for k in range(3)], 1)
        side, up = _frames(path, nrm)
        width = float(data['widths'][i])
        thick = max(float(data['thicks'][i]), 0.6 * width)
        ts = np.linspace(0, 1, POINTS)
        w = 1.15 * width * (0.80 + 0.35 * ts) * (1 - ts ** 1.7) ** 0.85 + 0.002
        th = thick * (1 - ts) ** 0.75 + 0.001
        count = int(np.clip(width * thick * density * 6, 90, 650))
        # Strands fill the clump cross-section; outer ones end a little early so tips stay sharp.
        ang = RNG.uniform(0, 2 * np.pi, count)
        # Denser toward the clump core so neighbouring clumps read apart.
        rad = RNG.uniform(0, 1, count) ** 0.6
        u, v = rad * np.cos(ang), rad * np.sin(ang) * 0.9
        end = 1 - 0.18 * rad ** 2 * RNG.uniform(0.3, 1.0, count)
        wob = RNG.normal(0, 1, (count, 2)) * 0.0015
        for j in range(count):
            tt = ts * end[j]
            wj = np.interp(tt, ts, w)
            thj = np.interp(tt, ts, th)
            pj = np.stack([np.interp(tt, ts, path[:, k]) for k in range(3)], 1)
            sj = np.stack([np.interp(tt, ts, side[:, k]) for k in range(3)], 1)
            uj = np.stack([np.interp(tt, ts, up[:, k]) for k in range(3)], 1)
            pts = pj + sj * (u[j] * wj / 2 + wob[j, 0] * np.sin(tt * 5))[:, None] \
                + uj * (v[j] * thj / 2 + wob[j, 1] * np.sin(tt * 4 + 1))[:, None]
            all_pts.append(pts)
            all_rad.append(0.0028 * (1 - 0.7 * ts))
    pts = np.concatenate(all_pts).astype(np.float32)
    rad = np.concatenate(all_rad).astype(np.float32)
    curves = bpy.data.hair_curves.new('hair_strands')
    curves.add_curves([POINTS] * (len(pts) // POINTS))
    curves.position_data.foreach_set('vector', pts.ravel())
    curves.attributes.new('radius', 'FLOAT', 'POINT').data.foreach_set('value', rad)
    ob = bpy.data.objects.new('hair_strands', curves)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new('HairStrands')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    hair = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    hair.parametrization = 'MELANIN'
    hair.inputs['Melanin'].default_value = 0.72
    hair.inputs['Melanin Redness'].default_value = 0.62
    hair.inputs['Roughness'].default_value = 0.27
    hair.inputs['Radial Roughness'].default_value = 0.45
    hair.inputs['Random Roughness'].default_value = 0.2
    hair.inputs['Random Color'].default_value = 0.15
    nt.links.new(hair.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    curves.materials.append(mat)
    print(f'strands: {len(pts) // POINTS}')
    return ob
