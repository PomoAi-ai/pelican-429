"""Small UV-preserving correction of the Rodin D1 central fringe."""
from pathlib import Path

import bpy
import numpy as np

SOURCE = Path(__file__).resolve().parents[2] / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c'


def _smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def refine_hair(meshes):
    """Lift and side-sweep the extra centre tip, without touching skin or UVs."""
    image = bpy.data.images.load(str(SOURCE / 'texture_diffuse.png'), check_existing=True)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    changed = []
    minimum_normal_dot = 1.0
    for obj in meshes:
        mesh = obj.data
        before_normals = [face.normal.copy() for face in mesh.polygons]
        uv = mesh.uv_layers.active.data
        hair = set()
        for loop in mesh.loops:
            u, v = uv[loop.index].uv
            r, g, b = pixels[min(int(v * height), height - 1), min(int(u * width), width - 1), :3]
            if r > .65 and g > b * 1.35 and r > g * 1.12:
                hair.add(loop.vertex_index)
        for vertex in mesh.vertices:
            if vertex.index not in hair:
                continue
            x, y, z = vertex.co
            front = _smooth((-y - .395) / .015)
            tip = _smooth((.17 - abs(x)) / .07) * _smooth((2.78 - z) / .23) * _smooth((z - 2.45) / .06) * front
            depth = _smooth((.34 - abs(x)) / .16) * _smooth((z - 2.54) / .13) * _smooth((2.98 - z) / .16) * front
            sweep = _smooth((.23 - abs(x)) / .18) * _smooth((2.91 - z) / .26) * _smooth((z - 2.45) / .06) * front
            if tip == 0 and depth == 0 and sweep == 0:
                continue
            before = vertex.co.copy()
            vertex.co.x -= x * .2 * tip + .03 * sweep
            vertex.co.y += .005 * tip + .010 * depth
            vertex.co.z += .05 * tip
            changed.append({'vertex': vertex.index, 'before': list(before), 'after': list(vertex.co),
                            'displacement': (vertex.co - before).length})
        mesh.update()
        minimum_normal_dot = min(minimum_normal_dot, min(normal.dot(face.normal) for normal, face in zip(before_normals, mesh.polygons)))
        if minimum_normal_dot <= 0 or any(face.area < 1e-12 for face in mesh.polygons):
            raise ValueError(f'{obj.name}: fringe deformation inverted or collapsed a face')
    if not changed:
        raise ValueError('D1 fringe repair did not select any hair vertices')
    return {'recipe': 'lift-central-tip-and-reduce-front-bulk',
            'changedVertices': len(changed), 'maxDisplacement': max(v['displacement'] for v in changed),
            'affectedBoundsBefore': [[min(v['before'][i] for v in changed) for i in range(3)],
                                     [max(v['before'][i] for v in changed) for i in range(3)]],
            'topologyAndUVUnchanged': True, 'minFaceNormalDot': minimum_normal_dot, 'vertices': changed}
