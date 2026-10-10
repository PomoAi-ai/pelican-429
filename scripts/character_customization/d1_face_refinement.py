"""Small, UV-preserving lip and nose correction for the normalized D1 mesh."""
def _falloff(value, radius):
    t = max(0.0, 1.0 - abs(value) / radius)
    return t * t * (3.0 - 2.0 * t)


def refine_face(meshes):
    """Round the nose profile and give the closed mouth a subtle lower lip."""
    changes = []
    minimum_normal_dot = 1.0
    for obj in meshes:
        mesh = obj.data
        old_normals = [p.normal.copy() for p in mesh.polygons]
        uv_before = [tuple(loop.uv) for loop in mesh.uv_layers.active.data]
        for vertex in mesh.vertices:
            x, y, z = vertex.co
            # Front skin only; hair, eyes, neck and back of head remain untouched.
            if y >= -.28 or abs(x) >= .09 or not 2.275 < z < 2.45:
                continue
            before = vertex.co.copy()
            tip = _falloff(x, .060) * _falloff(z - 2.396, .041)
            wing = _falloff(abs(x) - .043, .026) * _falloff(z - 2.393, .036)
            bridge = _falloff(x, .065) * _falloff(z - 2.419, .024)
            philtrum = _falloff(x, .060) * _falloff(z - 2.354, .022)
            lower_lip = _falloff(x, .080) * _falloff(z - 2.303, .026)
            upper_lip = _falloff(x, .072) * _falloff(z - 2.324, .018)
            vertex.co.y += .010 * tip - .003 * wing - .003 * bridge + .014 * philtrum
            vertex.co.y -= .009 * lower_lip + .0025 * upper_lip
            vertex.co.z -= .004 * tip
            displacement = (vertex.co - before).length
            if displacement > 1e-7:
                changes.append({'vertex': vertex.index, 'before': list(before),
                                'after': list(vertex.co), 'displacement': displacement})
        mesh.update()
        minimum_normal_dot = min(minimum_normal_dot, min(n.dot(p.normal) for n, p in zip(old_normals, mesh.polygons)))
        if minimum_normal_dot <= 0 or any(p.area < 1e-12 for p in mesh.polygons):
            raise ValueError(f'{obj.name}: D1 facial refinement inverted or collapsed a face')
        if uv_before != [tuple(loop.uv) for loop in mesh.uv_layers.active.data]:
            raise ValueError(f'{obj.name}: D1 facial refinement changed UVs')
    if not changes:
        raise ValueError('D1 facial refinement did not select any nose or mouth vertices')
    return {'recipe': 'round-nose-tip-and-subtle-closed-lips', 'changedVertices': len(changes),
            'maxDisplacement': max(c['displacement'] for c in changes),
            'minFaceNormalDot': minimum_normal_dot, 'topologyAndUVUnchanged': True,
            'noseCenter': [0.0, -.363, 2.392], 'mouthCenter': [0.0, -.35, 2.319],
            'mouthLine': {'halfWidth': .066, 'centerZ': 2.315, 'cornerRise': .012},
            'vertices': changes}


if __name__ == '__main__':
    import json
    import sys
    from pathlib import Path
    import bpy
    from mathutils import Vector

    root = Path(__file__).resolve().parents[2]
    source = root / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c'
    output = source / 'inspection/face-study'
    output.mkdir(exist_ok=True)
    sys.path.insert(0, str(root / 'scripts/blender_grassy_opus55'))
    import scene as studio

    bpy.ops.wm.open_mainfile(filepath=str(source / 'refined/d1-refined.blend'))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
    scene.cycles.use_denoising = True
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    def render_detail(view, path):
        target = Vector((0, -.32, 2.37))
        camera = scene.camera
        camera.data.type = 'ORTHO'; camera.data.ortho_scale = .48
        camera.location = target + studio.VIEWS[view] * 8
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.resolution_x = scene.render.resolution_y = 800
        scene.cycles.samples = 16; scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)

    for view in ('front', 'right'):
        render_detail(view, output / f'before-{view}.png')
    report = refine_face(meshes)
    for view in ('front', 'right'):
        render_detail(view, output / f'after-{view}.png')
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'face-refined.blend'))
    print(json.dumps({k: v for k, v in report.items() if k != 'vertices'}))
