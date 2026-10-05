"""Calibrate Rodin's existing UV material and bake portable glTF PBR maps.

The changes are intentionally local and mild: preserve face/hair detail, reduce
warm skin saturation and cloudy cloth contrast, and add fine woven relief.
"""
import json
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'assets/characters/grassy/history/model-rodin-refined/material-evidence'


def apply(ob):
    """Apply to the normalized, UV-preserved Rodin mesh; return map paths."""
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    mat = ob.data.materials[0].copy()
    mat.name = 'Rodin calibrated fabric and skin'
    ob.data.materials[0] = mat
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    source = bsdf.inputs['Base Color'].links[0].from_socket
    rough = bsdf.inputs['Roughness'].links[0].from_socket
    original_normal = bsdf.inputs['Normal'].links[0].from_socket

    def node(kind, name):
        n = nodes.new(kind)
        n.label = n.name = name
        return n

    def connect(socket, value):
        if isinstance(value, (float, int, tuple)):
            socket.default_value = value
        else:
            links.new(value, socket)

    def math(op, a, b):
        n = node('ShaderNodeMath', op)
        n.operation = op
        connect(n.inputs[0], a)
        connect(n.inputs[1], b)
        return n.outputs[0]

    def mix(a, b, fac, name):
        n = node('ShaderNodeMixRGB', name)
        connect(n.inputs[0], fac)
        connect(n.inputs[1], a)
        connect(n.inputs[2], b)
        return n.outputs[0]

    def smooth(a, low, high):
        n = node('ShaderNodeMapRange', 'Soft color boundary')
        n.interpolation_type = 'SMOOTHSTEP'
        connect(n.inputs['Value'], a)
        n.inputs['From Min'].default_value = low
        n.inputs['From Max'].default_value = high
        return n.outputs[0]

    sep = node('ShaderNodeSeparateColor', 'Original linear RGB')
    links.new(source, sep.inputs[0])
    r, g, b = sep.outputs[:3]
    geo = node('ShaderNodeNewGeometry', 'Surface region')
    xyz = node('ShaderNodeSeparateXYZ', 'Surface XYZ')
    links.new(geo.outputs['Position'], xyz.inputs[0])
    z = xyz.outputs['Z']
    red = smooth(math('SUBTRACT', r, math('MULTIPLY', g, 4.0)), -0.04, 0.04)
    shirt = math('MULTIPLY', red, math('LESS_THAN', z, 2.03))
    shirt = math('MULTIPLY', shirt, math('GREATER_THAN', z, 1.14))
    denim = smooth(math('SUBTRACT', b, r), 0.015, 0.055)
    denim = math('MULTIPLY', denim, math('LESS_THAN', z, 1.3))
    denim = math('MULTIPLY', denim, math('GREATER_THAN', z, 0.25))
    skin = math('MULTIPLY', smooth(r, 0.18, 0.32),
                smooth(math('SUBTRACT', g, b), 0.015, 0.04))
    skin = math('MULTIPLY', skin, math('SUBTRACT', 1.0, shirt))
    skin = math('MULTIPLY', skin, math('GREATER_THAN', z, 0.80))
    hsv = node('ShaderNodeHueSaturation', 'Skin saturation 0.90')
    hsv.inputs['Saturation'].default_value = 0.90
    hsv.inputs['Value'].default_value = 1.005
    links.new(source, hsv.inputs['Color'])
    color = mix(source, hsv.outputs['Color'], skin, 'Keep eyes and hair original')
    color = mix(color, (0.61, 0.026, 0.030, 1), math('MULTIPLY', shirt, 0.30), 'Soften red baked mottling')
    color = mix(color, (0.085, 0.235, 0.43, 1), math('MULTIPLY', denim, 0.22), 'Soften denim baked mottling')
    cloth = math('MAXIMUM', shirt, denim)
    texco = node('ShaderNodeTexCoord', 'Cloth weave coordinates')
    waves = []
    for direction, scale in [('X', 38.0), ('Z', 43.0)]:
        wave = node('ShaderNodeTexWave', f'Fine warp {direction}')
        wave.wave_type = 'BANDS'
        wave.bands_direction = direction
        wave.inputs['Scale'].default_value = scale
        wave.inputs['Distortion'].default_value = 0.12
        links.new(texco.outputs['Object'], wave.inputs['Vector'])
        waves.append(wave.outputs['Fac'])
    weave = math('MULTIPLY', waves[0], waves[1])
    bump = node('ShaderNodeBump', 'Submillimetre cloth relief')
    bump.inputs['Distance'].default_value = 0.0012
    connect(bump.inputs['Strength'], math('MULTIPLY', cloth, 0.22))
    links.new(weave, bump.inputs['Height'])
    links.new(original_normal, bump.inputs['Normal'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    links.new(color, bsdf.inputs['Base Color'])
    new_rough = mix(rough, (0.92, 0.92, 0.92, 1), math('MULTIPLY', cloth, 0.55), 'Soft textile roughness')
    links.new(new_rough, bsdf.inputs['Roughness'])

    # Blender's glTF exporter cannot carry procedural shaders. Bake the actual
    # node output to the original UV atlas before replacing it with PBR nodes.
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    emission = node('ShaderNodeEmission', 'Bake color without studio lighting')
    paths = {}
    baked = {}
    for name, output, colorspace, mode in [
        ('base-color', color, 'sRGB', 'EMIT'),
        ('roughness', new_rough, 'Non-Color', 'EMIT'),
        ('normal', None, 'Non-Color', 'NORMAL'),
    ]:
        image = bpy.data.images.new(f'rodin-refined-{name}', width=2048, height=2048, alpha=False)
        image.colorspace_settings.name = colorspace
        target = node('ShaderNodeTexImage', f'Baked {name}')
        target.image = image
        nodes.active = target
        target.select = True
        if output is not None:
            links.new(output, emission.inputs['Color'])
            links.new(emission.outputs[0], out.inputs['Surface'])
        else:
            links.new(bsdf.outputs[0], out.inputs['Surface'])
        bpy.ops.object.bake(type=mode)
        path = EVIDENCE / f'rodin-refined-{name}.png'
        image.filepath_raw = str(path)
        image.file_format = 'PNG'
        image.save()
        image.pack()
        paths[name] = str(path)
        baked[name] = image
    # Build only the portable material; original maps remain packed in the
    # Blender file for comparison and the source blend is never overwritten.
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs[0], out.inputs['Surface'])
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = 0.7
    for name, input_name in [('base-color', 'Base Color'), ('roughness', 'Roughness')]:
        n = nodes.new('ShaderNodeTexImage')
        n.image = baked[name]
        links.new(n.outputs['Color'], bsdf.inputs[input_name])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = baked['normal']
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(tex.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    note = {'source': 'Rodin original UV and PBR atlas', 'maps': paths,
            'skin_saturation': 0.90, 'shirt_tint_mix': 0.30, 'denim_tint_mix': 0.22,
            'cloth_roughness_mix': 0.55, 'cloth_bump_distance': 0.0012,
            'lighting_baked': False, 'geometry_changed': False}
    (EVIDENCE / 'material-calibration.json').write_text(json.dumps(note, ensure_ascii=False, indent=2) + '\n')
    print('RODIN_MATERIALS_BAKED', json.dumps(note))
    return paths
