"""Jeans as one seamless surface: pelvis and legs are unioned, voxel-rebuilt, smoothed, then folded and stitched."""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import body
import solid
from geo import add_mesh, resample, smoothstep, spline, sphere, thread, tube, unit

LEG = np.array(body.LEG_KEYS)


def leg_center(z):
    z = np.clip(z, LEG[-1, 0], LEG[0, 0])
    return spline(LEG[::-1, 0], LEG[::-1, 1], z), spline(LEG[::-1, 0], LEG[::-1, 2], z)


def _tmp_object(name, P, col, caps):
    return add_mesh(name, P, None, col, caps=caps)


def _apply(obj, mod):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def union_surface(col, Q, voxel):
    tmp = bpy.data.collections.new('tmp_jeans')
    bpy.context.scene.collection.children.link(tmp)
    pel = _tmp_object('pel', body.pelvis_grid(36, 96), tmp, (True, True))
    legs = []
    for s in (1, -1):
        L = body.leg_grid(60, 96) * np.array([s, 1, 1])
        legs.append(_tmp_object(f'leg{s}', L, tmp, (True, True)))
    for leg in legs:
        mod = pel.modifiers.new('u', 'BOOLEAN')
        mod.operation, mod.object, mod.solver = 'UNION', leg, 'EXACT'
        _apply(pel, mod)
    mod = pel.modifiers.new('r', 'REMESH')
    mod.mode, mod.voxel_size = 'VOXEL', voxel
    _apply(pel, mod)
    for leg in legs:
        bpy.data.objects.remove(leg, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(pel.data)
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for _ in range(5):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(pel.data)
    bm.free()
    tmp.objects.unlink(pel)
    bpy.data.collections.remove(tmp)
    col.objects.link(pel)
    return pel


def fold(co, nrm):
    x, y, z = co.T
    side = np.where(x >= 0, 1.0, -1.0)
    cx, cy = leg_center(z)
    cx = cx * side
    front = -(y - cy)
    inner = -(x - cx) * side
    phi = np.arctan2(front, inner)
    fr = np.maximum(np.sin(phi), 0)
    bk = np.maximum(-np.sin(phi), 0)
    leg_w = smoothstep(1.0, 0.9, z)
    creases = 0.0030 * np.sin((z - 0.47) / 0.042 * 2 * math.pi + phi * 1.5) * smoothstep(0.47, 0.5, z) \
        * (1 - smoothstep(0.62, 0.72, z)) * (0.4 + 0.6 * fr) * (0.7 + 0.3 * np.sin(phi * 5 + z * 30))
    knee = 0.007 * np.sin((z - 0.64) / 0.05 * 2 * math.pi) * np.exp(-((z - 0.64) / 0.1) ** 2) * bk
    whisk = 0.0045 * np.sin((z + 0.35 * np.cos(phi)) / 0.045 * 2 * math.pi) * np.exp(-((z - 1.03) / 0.13) ** 2) * fr
    sag = 0.004 * np.sin(z * 21 + phi * 2) * smoothstep(0.55, 0.9, z)
    band = 0.0045 * np.exp(-((z - 1.215) / 0.032) ** 2)
    belly = 0.003 * np.sin(z * 40 + x * 22) * smoothstep(1.2, 1.0, z) * smoothstep(0.9, 1.05, z)
    d = (creases + knee + whisk + sag) * leg_w + band + belly
    return co + nrm * d[:, None]


def finish_uv(obj, tile):
    me = obj.data
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    loops = len(me.loops)
    vidx = np.empty(loops, np.int32)
    me.loops.foreach_get('vertex_index', vidx)
    nf = len(me.polygons)
    pn = np.empty(nf * 3)
    me.polygons.foreach_get('normal', pn)
    pn = pn.reshape(-1, 3)
    lp = np.empty(nf, np.int32)
    me.polygons.foreach_get('loop_start', lp)
    lt = np.empty(nf, np.int32)
    me.polygons.foreach_get('loop_total', lt)
    face_of_loop = np.repeat(np.arange(nf), lt)
    n = np.abs(pn[face_of_loop])
    p = co[vidx]
    axis = np.argmax(n, 1)
    u = np.where(axis == 0, p[:, 1], p[:, 0])
    v = np.where(axis == 2, p[:, 1], p[:, 2])
    uv = np.stack([u, v], -1) / tile
    layer = me.uv_layers.new(name='UVMap')
    layer.data.foreach_set('uv', uv.astype(np.float32).ravel())


def build_jeans(M, col, Q):
    voxel = 0.0055 if Q > 0.7 else 0.006
    obj = union_surface(col, Q, voxel)
    me = obj.data
    me.update()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    nr = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('normal', nr)
    nr = nr.reshape(-1, 3)
    co = fold(co, nr)
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    if Q <= 0.7:
        solid.decimate(obj, 7000 if Q > 0.15 else 3200)
        me = obj.data
    me.materials.clear()
    me.materials.append(M["jeans"])
    finish_uv(obj, 0.30)
    me.shade_smooth()
    obj.name = 'jeans'
    return obj


class Surface:
    def __init__(self, obj):
        dg = bpy.context.evaluated_depsgraph_get()
        self.tree = BVHTree.FromObject(obj, dg)

    def cast(self, origin, direction):
        loc, nor, _, _ = self.tree.ray_cast(Vector(origin), Vector(direction))
        return None if loc is None else (np.array(loc), np.array(nor))

    def line(self, origins, direction, off):
        out = []
        for o in origins:
            h = self.cast(o, direction)
            if h is not None:
                out.append(h[0] + h[1] * off)
        return np.array(out)

    def ring(self, z, n=200, off=0.002, leg=1):
        cx, cy = leg_center(z)
        out = []
        for a in np.linspace(0, 2 * math.pi, n, endpoint=False):
            o = np.array([leg * cx + 0.27 * math.cos(a), cy + 0.27 * math.sin(a), z])
            d = np.array([leg * cx, cy, z]) - o
            h = self.cast(o, d / np.linalg.norm(d))
            if h is not None:
                out.append(h[0] + h[1] * off)
        out = np.array(out)
        return np.concatenate([out, out[:1]])
