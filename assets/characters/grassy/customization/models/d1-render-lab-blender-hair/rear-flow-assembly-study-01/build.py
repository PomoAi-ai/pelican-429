"""One assembly: ten rear/ear-cover volumes and only their native-flow paint tiles."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
SOURCE = BASE / 'compact-bob-assembly-study-01/painted/D1-Hair-Painted.blend'
CONTRACT_PATH = BASE / 'crown-flow-rebuild-study-01/draft-02/merge-contract.json'
SELECTED_NAMES = None
sys.dont_write_bytecode = True
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / 'reference-color-audit-01'))
from build import skull_tree


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def render_three(scene, prefix, samples, denoise):
    centre = Vector((0, .015, 2.64))
    scene.camera.data.ortho_scale = 1.5
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    for view, axis in {'front': (0, -1, 0), 'right': (-1, 0, 0), 'three-quarter': (-1, -1, 0)}.items():
        scene.camera.location = centre + Vector(axis) * 4
        scene.camera.rotation_euler = (centre - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(HERE / f'{prefix}{view}.png')
        bpy.ops.render.render(write_still=True)


def main():
    if (HERE / 'D1-Hair-Painted.blend').exists() or (HERE / 'painted-hair-atlas.png').exists():
        raise ValueError(f'Preserved rear-flow assembly exists: {HERE}')
    contract = json.loads(CONTRACT_PATH.read_text())
    candidate_source = Path(contract['candidateScene'])
    assert hashlib.sha256(candidate_source.read_bytes()).hexdigest() == contract['candidateSHA256']
    names = contract['groups']['rearAndEarCoverCandidate'] if SELECTED_NAMES is None else SELECTED_NAMES
    assert set(names).issubset(contract['changedComponents'])
    source_paths = [SOURCE, SOURCE.parent / 'paint-report.json', SOURCE.parent / 'painted-hair-atlas.png',
        candidate_source, CONTRACT_PATH]
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_paths}
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    helpers = module('rear_merge_helpers', BASE / 'main-side-return-study-01/flow-paint/build_preview.py')
    paint = module('rear_flow_paint', BASE / 'assembly-study-34/paint_components.py')
    paint.HERE = BASE
    color = module('rear_reference_palette', BASE / 'reference-color-audit-01/corrected_preview.py')
    check = module('rear_closed_geometry_check', BASE / 'bob-cohesive-study-02/build_second.py')
    frozen = {o.name: helpers.mesh_hash(o) for o in scene.objects if o.type == 'MESH' and o.name not in names}
    report = json.loads((SOURCE.parent / 'paint-report.json').read_text())
    components = {c['name']: c for c in report['components']}
    pixels = helpers.pixels(SOURCE.parent / 'painted-hair-atlas.png')
    original = pixels.copy()
    resolution = pixels.shape[0]
    size = resolution // math.ceil(math.sqrt(len(components)))
    assert resolution == contract['atlasSize'] and size == contract['tileSize']
    native_uv = {}
    merged = {}
    for name in names:
        old = bpy.data.objects[name]
        original_material = old.active_material
        old.name = 'Preserved source placement ' + name
        with bpy.data.libraries.load(str(candidate_source)) as (library, loaded):
            assert name in library.objects
            loaded.objects = [name]
        candidate = loaded.objects[0]
        assert not candidate.modifiers and not candidate.constraints
        assert np.array_equal(np.asarray(old.matrix_world), np.asarray(candidate.matrix_world))
        native = np.asarray([l.uv for l in candidate.data.uv_layers[contract['nativeUVLayer']].data], dtype=np.float32)
        assert np.isfinite(native).all() and native.min() >= 0 and native.max() <= 1
        assert components[name]['tile'] == contract['tiles'][name]
        old.data = candidate.data.copy()
        for key in candidate.keys():
            old[key] = candidate[key]
        bpy.data.objects.remove(candidate, do_unlink=True)
        old.name = name
        old.data.materials.clear()
        old.data.materials.append(original_material)
        atlas = old.data.uv_layers[contract['activeUVLayer']]
        old.data.uv_layers.active = atlas
        atlas.active_render = True
        cell = components[name]['tile']
        for loop, value in zip(atlas.data, native):
            loop.uv = (np.asarray(cell) * size + 8 + value * (size - 16)) / resolution
        native_uv[name] = native
        merged[name] = helpers.mesh_hash(old)
    head = skull_tree(bpy.data.objects['Head'])
    body = bpy.data.objects['Body']
    neck = BVHTree.FromPolygons([body.matrix_world @ v.co for v in body.data.vertices], [tuple(f.vertices) for f in body.data.polygons])
    geometry = {name: check.audit(bpy.data.objects[name], head, neck) for name in names}
    assert all(c['closed'] and c['volume'] > 0 and c['selfIntersections']['exactCrossings'] == 0
        and c['bodyVertexMinimum'] > 0 and c['bodyFaceMinimum'] > 0 for c in geometry.values())
    reference, palette_report = color.repaired_reference(paint)
    outside = np.ones(pixels.shape[:2], dtype=bool)
    tile_reports = {}
    for name in names:
        obj = bpy.data.objects[name]
        atlas = obj.data.uv_layers.active
        original_uv = np.asarray([l.uv for l in atlas.data], dtype=np.float32)
        for loop, value in zip(atlas.data, native_uv[name]):
            loop.uv = value
        paint.PAINTED_FLOW_COMPONENTS.add(name)
        piece, _, profile, start, end = paint.FLOW_COMPONENTS[name]
        paint.FLOW_COMPONENTS[name] = (piece, 28, profile, start, end)
        motion_region = obj['region']
        # The new crown is also a closed ring. Its export motion region remains
        # crown; only painting selects the existing circular-section rule.
        if motion_region == 'crown':
            obj['region'] = 'rear cover'
        tile, count, mapping = paint.raster_component(obj, reference, size, 8)
        obj['region'] = motion_region
        assert mapping['mapping'] == 'authored-longitudinal'
        for loop, value in zip(atlas.data, original_uv):
            loop.uv = value
        assert helpers.mesh_hash(obj) == merged[name]
        col, row = components[name]['tile']
        region = np.s_[row * size:(row + 1) * size, col * size:(col + 1) * size]
        before = helpers.color_metrics(original[region])
        pixels[region][:, :, :3] = tile
        outside[region] = False
        tile_reports[name] = dict(tile=components[name]['tile'], paintedPixels=count,
            sourceMapping=components[name]['mapping'], mapping=mapping,
            motionRegionExactlyPreserved=motion_region,
            before=before, after=helpers.color_metrics(pixels[region]))
        components[name].update(mapping='authored-longitudinal', flowUV='new closed circumference and actual guide arclength',
            sourcePalette='Same repaired original hair shadow/light palette', palette=reference.strand_palette.tolist())
        print('REAR_FLOW_TILE_READY', name, flush=True)
    assert all(helpers.mesh_hash(bpy.data.objects[n]) == h for n, h in {**frozen, **merged}.items())
    image = bpy.data.images.new('D1 selected rear/crown circular-flow tiles', resolution, resolution)
    image.colorspace_settings.name = 'sRGB'
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(HERE / 'painted-hair-atlas.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    saved = helpers.pixels(HERE / 'painted-hair-atlas.png')
    assert np.array_equal(saved[outside], original[outside]), 'Unselected atlas pixels changed'
    material = bpy.data.objects[names[0]].active_material.copy()
    material.name = 'Rear flow assembly; source material response preserved'
    next(n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE').image = image
    hair_names = json.loads(scene['Hair components'])
    for name in hair_names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(material)
    report.pop('allOther36TilesAndUnusedPixelsExactlyFrozen', None)
    report.pop('topFourCrownExactlyFrozen', None)
    report.update(source=str(SOURCE), selectedGeometrySource=str(candidate_source), sourceHashes=hashes,
        changedComponents=names, changedAtlasTiles=tile_reports, otherGeometryMatricesUVExactlyFrozen=frozen,
        mergedGeometryUVHashes=merged, allUnselectedTilesAndUnusedPixelsExactlyFrozen=True,
        unselectedAtlasTileCount=len(components)-len(names), frozenMeshCount=len(frozen),
        retainedTopCrownNames=[n for n in contract['groups']['topCrownNotVisuallyApproved'] if n not in names],
        latestMainGeometryUVAndTileExactlyFrozen=True,
        referenceSampling=palette_report, localGeometryChecks=geometry,
        nativeUVLayer='Hair flow native', guideProperties=['guideBlender', 'path'], sectionSize=28, guideSamples=81,
        materialResponseUnchanged='Same pure texture-emission source shader, sRGB and source color management',
        neighbourAONote='Braid and all unselected tiles intentionally frozen; neighbouring contact AO not rebaked in this bounded study',
        visualApproval=False, animationApproval=False, exported=False)
    (HERE / 'paint-report.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'D1-Hair-Painted.blend'))
    print('REAR_FLOW_ASSEMBLY_READY', HERE, flush=True)
    render_three(scene, '', 64, False)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'Paint-Preview.blend'))
    clay = bpy.data.materials.new('Rear-flow neutral grey geometry inspection')
    clay.use_nodes = True
    shader = next(n for n in clay.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.40, .40, .40, 1)
    shader.inputs['Roughness'].default_value = .75
    for name in hair_names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(clay)
    render_three(scene, 'clay-', 32, True)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'Clay-Preview.blend'))
    # A separate export source exposes baseColorTexture without changing the
    # calibrated emission response of the actual color previews.
    pbr = bpy.data.materials.new('Rear-flow export atlas PBR')
    pbr.use_nodes = True
    shader = next(n for n in pbr.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = .85
    tex = pbr.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    pbr.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    for name in hair_names:
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(pbr)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'PBR-Export.blend'))
    assert all(helpers.mesh_hash(bpy.data.objects[n]) == h for n, h in {**frozen, **merged}.items())
    assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest() == h for p, h in hashes.items())
    print('REAR_FLOW_ASSEMBLY_COMPLETE', HERE, flush=True)


if __name__ == '__main__':
    main()
