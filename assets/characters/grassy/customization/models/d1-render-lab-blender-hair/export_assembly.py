"""Export a painted component study offline, retaining the frozen outfit and actions.

Run in background Blender with -- --blend <painted.blend> --output-dir <new-dir>.
The input study and public assets are never written. Height and animation-data
contracts are checked here; appearance and animation approval remain separate.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from io_scene_gltf2.io.imp.gltf2_io_binary import BinaryData
from io_scene_gltf2.io.imp.gltf2_io_gltf import glTFImporter

HERE = Path(__file__).resolve().parent
ROOT = next(path for path in HERE.parents if (path / 'package.json').is_file())
FROZEN = ROOT / 'public/characters/human/render-lab/d1-outfit-rodin-hair.web-1k.glb'
sys.path.insert(0, str(HERE))
from publish_hair import publish, read_glb


def gltf(points):
    values = np.asarray(points)
    return values[..., [0, 2, 1]] * np.array([1., 1., -1.])


def world_points(obj):
    points = np.asarray([vertex.co for vertex in obj.data.vertices], dtype=float)
    matrix = np.asarray(obj.matrix_world)
    return points @ matrix[:3, :3].T + matrix[:3, 3]


def islands(mesh):
    neighbors = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbors[a].append(b)
        neighbors[b].append(a)
    seen = np.zeros(len(neighbors), dtype=bool)
    for first in range(len(neighbors)):
        if seen[first]:
            continue
        pending, component = [first], []
        seen[first] = True
        while pending:
            vertex = pending.pop()
            component.append(vertex)
            for neighbor in neighbors[vertex]:
                if not seen[neighbor]:
                    seen[neighbor] = True
                    pending.append(neighbor)
        yield np.asarray(sorted(component))


def motion_region(obj):
    region = obj.get('region')
    if region == 'crown':
        return 'crown', 1.
    if 'braid' in obj.name.lower():
        return 'braid', 1.
    if region == 'fringe' or 'fringe' in obj.name.lower():
        return 'fringe', .8
    if region in ('side', 'side cover'):
        return 'side', .72
    if region in ('rear cover', 'inner bob', 'rear bob', 'small branch'):
        return 'bob', .68
    raise ValueError(f'{obj.name}: unknown authored hair region {region!r}')


def strand_data(obj, points, uv, guide_start):
    count = len(points)
    if 'strandTopology' in obj:
        topology = obj['strandTopology']
        if topology not in ('authored-guide', 'ordered-closed-sweep') or (
                topology == 'authored-guide' and obj.name != 'Single broad swept fringe'):
            raise ValueError(f'{obj.name}: unsupported explicit strand topology {obj["strandTopology"]!r}')
        components = list(islands(obj.data))
        if len(components) != 1:
            raise ValueError(f'{obj.name}: authored-guide requires one connected component, found {len(components)}')
        if not np.allclose(np.asarray(obj.matrix_world), np.eye(4), atol=1e-7, rtol=0):
            raise ValueError(f'{obj.name}: world-space authored guide requires an applied identity object transform')
        native = obj.data.uv_layers.get('Hair flow native')
        if native is None:
            raise ValueError(f'{obj.name}: authored-guide requires Hair flow native UVs')
        native_uv = np.asarray([loop.uv for loop in native.data])
        if not np.isfinite(native_uv).all():
            raise ValueError(f'{obj.name}: non-finite native flow UVs')
        loop_vertices = np.asarray([loop.vertex_index for loop in obj.data.loops])
        low, high = np.full(count, np.inf), np.full(count, -np.inf)
        np.minimum.at(low, loop_vertices, native_uv[:, 1])
        np.maximum.at(high, loop_vertices, native_uv[:, 1])
        if not np.isfinite(low).all() or np.max(high - low) > 1e-6:
            raise ValueError(f'{obj.name}: each vertex must have one native root-to-tip UV coordinate')
        if low.min() < 0 or high.max() > 1 or np.ptp(low) <= 1e-6:
            raise ValueError(f'{obj.name}: native root-to-tip UVs must span a nonzero interval within [0, 1]')
        serialized = obj.get('guideBlender')
        if not isinstance(serialized, str):
            raise ValueError(f'{obj.name}: authored-guide requires serialized world-space guideBlender')
        guide = np.asarray(json.loads(serialized), dtype=float)
        if guide.ndim != 2 or guide.shape[1] != 3 or len(guide) < 3 or not np.isfinite(guide).all():
            raise ValueError(f'{obj.name}: authored guide must contain at least three finite world-space points')
        distances = np.linalg.norm(np.diff(guide, axis=0), axis=1)
        if np.any(distances <= 1e-8) or np.linalg.norm(guide[-1] - guide[0]) <= 1e-8:
            raise ValueError(f'{obj.name}: authored guide has repeated points or coincident root and tip')
        arc = np.r_[0., np.cumsum(distances)]
        direction = np.gradient(guide, arc, axis=0)
        lengths = np.linalg.norm(direction, axis=1)
        if not np.isfinite(lengths).all() or np.any(lengths <= 1e-8):
            raise ValueError(f'{obj.name}: authored guide has a degenerate tangent')
        direction /= lengths[:, None]
        # Native V remains the original guide arclength after remeshing and atlas packing.
        # Renormalizing the surviving UV range would move the root's fixed motion region.
        flow = np.column_stack([np.interp(low, arc / arc[-1], direction[:, axis]) for axis in range(3)])
        lengths = np.linalg.norm(flow, axis=1)
        if not np.isfinite(lengths).all() or np.any(lengths <= 1e-8):
            raise ValueError(f'{obj.name}: interpolated authored flow is degenerate')
        region, stiffness = motion_region(obj)
        authored = dict(id=guide_start, name=f'{obj.name} / 1', region=region, stiffness=stiffness,
                        root=gltf(guide[0]).tolist(), tip=gltf(guide[-1]).tolist())
        return np.full(count, float(guide_start)), low, gltf(flow / lengths[:, None]), [authored]
    if obj.name == 'Thin scalp root bed':
        return np.full(count, -1.), np.zeros(count), np.tile([0., 0., -1.], (count, 1)), []
    region, stiffness = motion_region(obj)
    loop_vertices = np.asarray([loop.vertex_index for loop in obj.data.loops])
    low, high = np.full(count, np.inf), np.full(count, -np.inf)
    np.minimum.at(low, loop_vertices, uv[:, 1])
    np.maximum.at(high, loop_vertices, uv[:, 1])
    if not np.isfinite(low).all() or np.max(high - low) > 1e-6:
        raise ValueError(f'{obj.name}: each vertex must have one root-to-tip UV coordinate')
    ids, progress, flow, guides = np.empty(count), np.empty(count), np.empty((count, 3)), []
    for strand, component in enumerate(islands(obj.data)):
        v = low[component]
        if np.ptp(v) <= 1e-6:
            raise ValueError(f'{obj.name}: strand {strand} has no root-to-tip UV span')
        # Atlas packing changes only the scale and offset; V still identifies loft rows.
        levels, rows = np.unique(np.round((v - v.min()) / np.ptp(v), 5), return_inverse=True)
        centers = np.zeros((len(levels), 3))
        np.add.at(centers, rows, points[component])
        centers /= np.bincount(rows)[:, None]
        distances = np.linalg.norm(np.diff(centers, axis=0), axis=1)
        if len(centers) < 3 or np.any(distances <= 1e-8):
            raise ValueError(f'{obj.name}: strand {strand} has degenerate flow rows')
        arc = np.r_[0., np.cumsum(distances)]
        direction = np.gradient(centers, arc, axis=0)
        lengths = np.linalg.norm(direction, axis=1)
        if np.any(lengths <= 1e-8) or np.linalg.norm(centers[-1] - centers[0]) <= 1e-8:
            raise ValueError(f'{obj.name}: strand {strand} has a degenerate guide')
        identifier = guide_start + strand
        ids[component] = identifier
        progress[component] = (arc / arc[-1])[rows]
        flow[component] = gltf(direction / lengths[:, None])[rows]
        guides.append(dict(id=identifier, name=f'{obj.name} / {strand + 1}', region=region,
                           stiffness=stiffness, root=gltf(centers[0]).tolist(), tip=gltf(centers[-1]).tolist()))
    return ids, progress, flow, guides


def combine(objects, scene):
    if sum(obj.get('strandTopology') == 'authored-guide' for obj in objects) > 1:
        raise ValueError('Only one explicitly authored-guide component may replace the main fringe')
    vertices, faces, uvs, ids, progress, flows, guides = [], [], [], [], [], [], []
    for obj in objects:
        mesh = obj.data
        points = world_points(obj)
        uv = np.asarray([loop.uv for loop in mesh.uv_layers.active.data])
        if not np.isfinite(points).all() or not np.isfinite(uv).all():
            raise ValueError(f'{obj.name}: non-finite geometry or UV')
        strand_ids, along, flow, authored = strand_data(obj, points, uv, len(guides))
        offset = len(vertices)
        vertices.extend(points)
        faces.extend(tuple(offset + index for index in polygon.vertices) for polygon in mesh.polygons)
        uvs.extend(uv)
        ids.extend(strand_ids)
        progress.extend(along)
        flows.extend(flow)
        guides.extend(authored)
    bounds = np.asarray(vertices)
    top = float(bounds[:, 2].max())
    if not 3.08 <= top <= 3.12:
        raise ValueError(f'Hair top outside fitted head range [3.08, 3.12]: {top:.9f}; no files exported')
    mesh = bpy.data.meshes.new('Painted assembly export')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    atlas_uv = mesh.uv_layers.new(name='UVMap')
    atlas_uv.data.foreach_set('uv', np.asarray(uvs).ravel())
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    for name, values in (('_D1_STRAND_ID', ids), ('_D1_STRAND_T', progress)):
        mesh.attributes.new(name, 'FLOAT', 'POINT').data.foreach_set('value', values)
    mesh.attributes.new('_D1_HAIR_FLOW', 'FLOAT_VECTOR', 'POINT').data.foreach_set('vector', np.asarray(flows).ravel())
    mesh.materials.append(objects[0].data.materials[0])
    hair = bpy.data.objects.new('Hair', mesh)
    scene.collection.objects.link(hair)
    hair['characterPart'] = 'hair'
    hair['hairGuides'] = guides
    hair['nativeHairStage'] = 'Blender painted component assembly'
    assert len(mesh.vertices) == sum(len(obj.data.vertices) for obj in objects)
    assert np.allclose(np.linalg.norm(flows, axis=1), 1.)
    assert min(progress) >= 0 and max(progress) <= 1
    return hair, [bounds.min(0).tolist(), bounds.max(0).tolist()]


def validate_native(path, source_hair):
    doc, _ = read_glb(path)
    source, _ = read_glb(FROZEN)
    native_reader = glTFImporter(str(path), {'import_user_extensions': []})
    source_reader = glTFImporter(str(FROZEN), {'import_user_extensions': []})
    native_reader.read()
    source_reader.read()
    hair = next(node for node in doc['nodes'] if node.get('name') == 'Hair')
    frozen = next(node for node in source['nodes'] if node.get('name') == 'Hair')
    assert len(doc['meshes']) == 1 and len(doc['meshes'][hair['mesh']]['primitives']) == 1
    assert not doc.get('animations'), 'Native intermediate must export only Hair and its bind rig'
    for field in ('matrix', 'translation', 'rotation', 'scale'):
        assert hair.get(field) == frozen.get(field), f'Hair bind transform changed: {field}'
    skin = doc['skins'][hair['skin']]
    head = next(i for i, node in enumerate(skin['joints']) if doc['nodes'][node]['name'] == 'head')
    source_skin = source['skins'][frozen['skin']]
    source_head = next(i for i, node in enumerate(source_skin['joints']) if source['nodes'][node]['name'] == 'head')
    # The frozen source uses meshopt-compressed buffer views; reuse Blender's decoder.
    assert np.allclose(BinaryData.decode_accessor(native_reader, skin['inverseBindMatrices'])[head],
                       BinaryData.decode_accessor(source_reader, source_skin['inverseBindMatrices'])[source_head], atol=1e-6), 'Head bind space changed'
    primitive = doc['meshes'][hair['mesh']]['primitives'][0]
    attributes = {name: BinaryData.decode_accessor(native_reader, index) for name, index in primitive['attributes'].items()}
    count = len(attributes['POSITION'])
    for name in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0', '_D1_STRAND_ID', '_D1_STRAND_T', '_D1_HAIR_FLOW'):
        assert len(attributes[name]) == count and np.isfinite(attributes[name]).all(), f'Invalid exported {name}'
    assert np.array_equal(np.unique(attributes['POSITION'], axis=0),
                          np.unique(gltf(world_points(source_hair)).astype(np.float32), axis=0)), 'Export changed authored geometry coordinates'
    assert np.all(attributes['JOINTS_0'][:, 0] == head) and np.all(attributes['WEIGHTS_0'] == [1, 0, 0, 0])
    ids, t = attributes['_D1_STRAND_ID'][:, 0], attributes['_D1_STRAND_T'][:, 0]
    guides = hair['extras']['hairGuides']
    expected_guides = source_hair['hairGuides']
    assert len(guides) == len(expected_guides), 'Export changed authored guide count'
    for guide, expected in zip(guides, expected_guides):
        for field in ('id', 'name', 'region', 'stiffness'):
            assert guide[field] == expected[field], f'Export changed guide {field}'
        for field in ('root', 'tip'):
            assert np.allclose(guide[field], expected[field], atol=1e-7, rtol=0), f'Export changed guide {field}'
    source_attributes = source_hair.data.attributes
    expected = np.column_stack([
        gltf(world_points(source_hair)),
        [item.value for item in source_attributes['_D1_STRAND_ID'].data],
        [item.value for item in source_attributes['_D1_STRAND_T'].data],
        [item.vector[:] for item in source_attributes['_D1_HAIR_FLOW'].data],
    ]).astype(np.float32)
    exported = np.column_stack([attributes[name] for name in
                               ('POSITION', '_D1_STRAND_ID', '_D1_STRAND_T', '_D1_HAIR_FLOW')])
    # glTF duplicates vertices at UV seams; each coordinate/strand tuple must keep its motion data.
    assert np.array_equal(np.unique(exported, axis=0), np.unique(expected, axis=0)), 'Export changed strand T or flow'
    assert set(ids) == {-1, *(guide['id'] for guide in guides)}
    assert np.all((t >= 0) & (t <= 1)) and np.all(t[ids == -1] == 0)
    assert np.allclose(np.linalg.norm(attributes['_D1_HAIR_FLOW'], axis=1), 1., atol=1e-6)
    assert 3.08 <= attributes['POSITION'][:, 1].max() <= 3.12
    return dict(vertices=count, strands=len(guides), oneHairPrimitive=True,
                geometryCoordinatesPreserved=True, headBindSpacePreserved=True,
                strandAttributesPreserved=True, authoredGuidesPreserved=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blend', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    blend, destination = args.blend.resolve(), args.output_dir.resolve()
    if destination.exists() or destination.is_relative_to(ROOT / 'public'):
        raise ValueError(f'Choose a new offline output directory: {destination}')
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    scene = bpy.context.scene
    names = json.loads(scene['Hair components'])
    if not isinstance(names, list) or not names or len(names) != len(set(names)):
        raise ValueError(f'{blend}: Hair components must contain unique object names')
    objects = [bpy.data.objects[name] for name in names]
    material = objects[0].data.materials[0]
    for obj in objects:
        if obj.type != 'MESH' or not len(obj.data.vertices) or obj.data.uv_layers.active is None or len(obj.modifiers):
            raise ValueError(f'{obj.name}: expected painted mesh with flow UVs and no unapplied modifiers')
        if len(obj.data.materials) != 1 or obj.data.materials[0] != material:
            raise ValueError(f'{obj.name}: all components must share one painted material')
    rig = bpy.data.objects['D1ModularBaseRig']
    if not np.allclose(np.asarray(rig.matrix_world), np.eye(4), atol=1e-7):
        raise ValueError('Frozen rig transform must remain identity for hair-only publication')
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    hair, bounds = combine(objects, scene)
    hair.parent = rig
    hair.vertex_groups.new(name='head').add(list(range(len(hair.data.vertices))), 1., 'REPLACE')
    hair.modifiers.new('Head attachment', 'ARMATURE').object = rig
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (rig, hair):
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = hair
    destination.mkdir(parents=True)
    native = destination / 'native-hair.glb'
    bpy.ops.export_scene.gltf(filepath=str(native), export_format='GLB', use_selection=True,
                             export_extras=True, export_attributes=True, export_animations=False,
                             export_rest_position_armature=True)
    validation = validate_native(native, hair)
    output = destination / 'd1-outfit-assembly.glb'
    publication = publish(FROZEN, native, output)
    report = dict(sourceBlend=str(blend), sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),
                  frozenSource=str(FROZEN), frozenSha256=hashlib.sha256(FROZEN.read_bytes()).hexdigest(),
                  components=names, boundsBlender=bounds, validation=validation, publication=publication,
                  output=str(output), outputSha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                  visualApproval=False, animationApproval=False)
    (destination / 'export-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('ASSEMBLY_EXPORT_OK', json.dumps(report))


if __name__ == '__main__':
    main()
