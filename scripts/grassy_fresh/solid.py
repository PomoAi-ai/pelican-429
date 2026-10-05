"""Boolean-union capped grids into one watertight surface, rebuilt on a voxel grid and relaxed."""
import bmesh
import bpy

from geo import add_mesh


def union(name, parts, col, voxel, smooth=6):
    """parts: [(grid, caps)]; the first part receives the others."""
    tmp = bpy.data.collections.new('tmp_' + name)
    bpy.context.scene.collection.children.link(tmp)
    objs = [add_mesh(f'{name}_{i}', P, None, tmp, caps=caps) for i, (P, caps) in enumerate(parts)]
    base = objs[0]
    bpy.context.view_layer.objects.active = base
    for other in objs[1:]:
        mod = base.modifiers.new('u', 'BOOLEAN')
        mod.operation, mod.object, mod.solver = 'UNION', other, 'EXACT'
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = base.modifiers.new('r', 'REMESH')
    mod.mode, mod.voxel_size = 'VOXEL', voxel
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for o in objs[1:]:
        bpy.data.objects.remove(o, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(base.data)
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(base.data)
    bm.free()
    tmp.objects.unlink(base)
    bpy.data.collections.remove(tmp)
    col.objects.link(base)
    base.name = name
    base.data.materials.clear()
    base.data.shade_smooth()
    return base


def decimate(obj, target):
    """Collapse-decimate to roughly `target` triangles (no-op when already below)."""
    obj.data.calc_loop_triangles()
    have = len(obj.data.loop_triangles)
    if have <= target:
        return
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('d', 'DECIMATE')
    mod.ratio = target / have
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
