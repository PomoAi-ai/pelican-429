"""Fit the D1 central nose/lip/chin surface; keep source eye geometry and UVs."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
MODULAR = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c/modular'
OUT = MODULAR / 'nose-mouth-fit'
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
import scene as studio


def smoothstep(value):
    value = min(1., max(0., value))
    return value * value * (3 - 2 * value)


def profile_at(tree, z):
    point, _, _, _ = tree.ray_cast(Vector((0, -2, z)), Vector((0, 1, 0)))
    if point is None:
        raise ValueError(f'D1 face has no central surface at height {z}')
    return point.y


def refine_nose_lips(face):
    """Apply a continuous localized deformation, preserving all source UV corners."""
    original = [v.co.copy() for v in face.data.vertices]
    tree = BVHTree.FromPolygons(original, [p.vertices[:] for p in face.data.polygons])
    before_count = len(original)
    bpy.context.view_layer.objects.active = face
    mod = face.modifiers.new('Continuous facial control surface', 'SUBSURF')
    mod.subdivision_type = 'SIMPLE'
    mod.levels = 1
    mod.uv_smooth = 'PRESERVE_BOUNDARIES'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    control_positions = [v.co.copy() for v in face.data.vertices]
    uv_before = [tuple(loop.uv) for loop in face.data.uv_layers.active.data]
    root = profile_at(tree, 2.462)
    changed = []
    for vertex in face.data.vertices:
        x, y, z = vertex.co
        if y >= -.23 or abs(x) >= .145 or not 2.225 < z < 2.478:
            continue
        old = vertex.co.copy()
        boundary = (smoothstep((.145 - abs(x)) / .035)
                    * smoothstep((z - 2.225) / .015)
                    * smoothstep((2.478 - z) / .03))
        tip_height = .0265 - .0035 * math.tanh((z - 2.394) / .015)
        tip = .017 * math.exp(-((x / .028)**2 + ((z - 2.394) / tip_height)**2))
        bridge = .007 * math.exp(-((x / .022)**2 + ((z - 2.422) / .032)**2))
        chin = .008 * math.exp(-((x / .075)**2 + ((z - 2.256) / .024)**2))
        seam = 2.316 + .009 * (abs(x) / .068)**2
        mouth_width = math.exp(-(x / .068)**6)
        crease = .0015 * math.exp(-((z - seam) / .0040)**2) * mouth_width
        lower = .0015 * math.exp(-((z - (seam - .007)) / .006)**2) * mouth_width
        vertex.co.y += (-tip - bridge - chin + crease - lower) * boundary
        mouth = math.exp(-((z - 2.318) / .024)**4) * math.exp(-(x / .088)**6)
        vertex.co.x *= 1 - .12 * mouth * boundary
        vertex.co.z -= .0035 * math.exp(-(x / .024)**2 - ((z - 2.318) / .018)**4) * boundary
        distance = (vertex.co - old).length
        if distance > 1e-6:
            changed.append(distance)
    face.data.update()
    for polygon in face.data.polygons:
        polygon.use_smooth = True
    assert face.data.uv_layers.active, 'Nose/lip repair lost the source UV map'
    assert uv_before == [tuple(loop.uv) for loop in face.data.uv_layers.active.data], 'Facial deformation changed UV coordinates'
    protected = [i for i, p in enumerate(control_positions)
                 if p.y >= -.23 or abs(p.x) >= .145 or not 2.225 < p.z < 2.478]
    assert all((face.data.vertices[i].co - control_positions[i]).length < 1e-9
               for i in protected), 'Nose/lip fit moved the eyes or outer head'
    assert all(all(math.isfinite(c) for c in v.co) for v in face.data.vertices), 'Non-finite facial coordinates'
    assert max(changed) < .05, 'Nose/lip correction exceeded the bounded facial region'
    return {'verticesBefore': before_count, 'verticesAfter': len(face.data.vertices),
            'changedVertices': len(changed), 'maximumDisplacement': max(changed),
            'profileDepthAnchor': root, 'noseTipCenter': 2.394, 'mouthSeamCenter': 2.316,
            'unchangedProtectedVertices': len(protected), 'uvCoordinatesUnchangedAfterSubdivision': True,
            'preserved': ['original eye geometry', 'source UV coordinates', 'skin material', 'head boundary'],
            'separateLipStrip': False}


def render(view, filename, scale=.95):
    scene = bpy.context.scene
    camera = studio._camera()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = scale
    target = Vector((0, -.14, 2.51))
    direction = {'front': Vector((0, -1, 0)), 'right': Vector((-1, 0, 0)),
                 'three-quarter': Vector((-.707, -.707, 0))}[view]
    camera.location = target + direction * 8
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 16
    scene.render.filepath = str(OUT / filename)
    bpy.ops.render.render(write_still=True)


def main():
    OUT.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(OUT / 'baseline/head.blend'))
    # The frozen .blend was copied out of its source directory; resolve its
    # relative images there so missing roughness maps cannot change the look.
    for image in bpy.data.images:
        if image.source == 'FILE' and image.filepath.startswith('//'):
            path = (MODULAR / image.filepath[2:]).resolve()
            if not path.is_file():
                raise FileNotFoundError(f'D1 baseline texture missing: {path}')
            image.filepath = str(path)
            image.reload()
    scene = bpy.context.scene
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    with bpy.data.libraries.load(str(MODULAR / 'hair.blend'), link=False) as (source, loaded):
        loaded.objects = [name for name in source.objects if name.startswith('D1_Hair')]
    for obj in loaded.objects:
        bpy.context.collection.objects.link(obj)
    for view in ('front', 'right', 'three-quarter'):
        render(view, f'before-{view}.png')
    face = bpy.data.objects['D1_Head_SourceFace']
    report = refine_nose_lips(face)
    for view in ('front', 'right', 'three-quarter'):
        render(view, f'candidate-{view}.png')
    for obj in loaded.objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'candidate.blend'))
    (OUT / 'candidate-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('D1_NOSE_MOUTH_CANDIDATE', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
