"""Paint only the returned fringe's own flow tile in the frozen assembled atlas."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
BASE = HERE.parent.parent
SOURCE = BASE/'assembly-study-34/volume-paint'
CANDIDATE = HERE.parent/'Single-Lock.blend'
NAME = 'Single broad swept fringe'
sys.dont_write_bytecode = True
sys.path.insert(0,str(BASE))


def module(name,path):
    spec = importlib.util.spec_from_file_location(name,path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def pixels(path):
    image = bpy.data.images.load(str(path),check_existing=False)
    result = np.asarray(image.pixels[:],dtype=np.float32).reshape(image.size[1],image.size[0],4).copy()
    bpy.data.images.remove(image)
    return result


def mesh_hash(obj):
    digest = hashlib.sha256()
    digest.update(np.asarray(obj.matrix_world,dtype=np.float64).tobytes())
    digest.update(np.asarray([vertex.co for vertex in obj.data.vertices],dtype=np.float64).tobytes())
    digest.update(np.asarray([index for face in obj.data.polygons for index in [len(face.vertices),*face.vertices]],dtype=np.int32).tobytes())
    for layer in obj.data.uv_layers:
        digest.update(layer.name.encode())
        digest.update(np.asarray([loop.uv for loop in layer.data],dtype=np.float64).tobytes())
    return digest.hexdigest()


def color_metrics(tile):
    rgb = tile[:,:,:3].reshape((-1,3))
    high,low = rgb.max(axis=1),rgb.min(axis=1)
    luma = rgb@np.asarray([.2126,.7152,.0722])
    saturation = np.divide(high-low,high,out=np.zeros_like(high),where=high>0)
    return dict(meanRGB=rgb.mean(axis=0).tolist(),luminanceMean=float(luma.mean()),
                luminanceP05=float(np.quantile(luma,.05)),luminanceP95=float(np.quantile(luma,.95)),
                meanSaturation=float(saturation.mean()))


def main():
    if (HERE/'D1-Hair-Painted.blend').exists() or (HERE/'painted-hair-atlas.png').exists():
        raise ValueError(f'Preserved paint study exists: {HERE}')
    source_paths = [SOURCE/name for name in ['D1-Hair-Painted.blend','painted-hair-atlas.png','paint-report.json','preview-report.json']]
    source_hashes = {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in [*source_paths,CANDIDATE]}
    paint = module('frozen_main_flow_painter',BASE/'assembly-study-34/paint_components.py')
    paint.HERE = BASE
    del paint.PROJECTED_COMPONENTS[NAME]
    reference = paint.PaintedReference()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'D1-Hair-Painted.blend'))
    scene = bpy.context.scene;obj = bpy.data.objects[NAME]
    frozen = {other.name:mesh_hash(other) for other in scene.objects if other.type=='MESH' and other != obj}
    original_uv = np.asarray([loop.uv for loop in obj.data.uv_layers.active.data])
    original_faces = [tuple(face.vertices) for face in obj.data.polygons]
    original_transform = np.asarray(obj.matrix_world)
    obj.name = 'Source material main before flow sampling'
    with bpy.data.libraries.load(str(CANDIDATE)) as (source,target):
        target.objects = [NAME]
    local = target.objects[0]
    assert local.name == NAME
    local['flowProfile'] = 'cosine'
    assert np.array_equal(original_transform,np.asarray(local.matrix_world))
    assert original_faces == [tuple(face.vertices) for face in local.data.polygons]
    replacement = np.asarray([vertex.co for vertex in local.data.vertices])
    if len(replacement) != len(obj.data.vertices):
        raise ValueError('Returned fringe differs from the existing atlas mesh topology')
    for vertex,point in zip(obj.data.vertices,replacement):
        vertex.co = point
    obj.data.update()
    obj['guideBlender'] = local['guideBlender']
    obj['flowProfile'] = 'cosine'
    report = json.loads((SOURCE/'paint-report.json').read_text())
    component = next(item for item in report['components'] if item['name']==NAME)
    old = pixels(SOURCE/'painted-hair-atlas.png');new = old.copy()
    resolution = old.shape[0]
    tile_size = resolution//math.ceil(math.sqrt(len(report['components'])))
    padding = 8
    tile,painted_pixels,mapping = paint.raster_component(local,reference,tile_size,padding)
    assert mapping['mapping']=='flow' and mapping['profile']=='cosine'
    col,row = component['tile']
    region = np.s_[row*tile_size:(row+1)*tile_size,col*tile_size:(col+1)*tile_size]
    new[region][:,:,:3] = tile
    local_uv = np.asarray([loop.uv for loop in local.data.uv_layers.active.data],dtype=np.float64)
    expected_uv = (np.asarray([col,row])*tile_size+padding+local_uv*(tile_size-padding*2))/resolution
    assert np.array_equal(original_uv,expected_uv.astype(np.float32)), 'Original main atlas UV differs from native flow UV'
    bpy.data.objects.remove(local,do_unlink=True)
    obj.name = NAME
    assert np.array_equal(original_uv,np.asarray([loop.uv for loop in obj.data.uv_layers.active.data]))
    assert np.array_equal(replacement,np.asarray([vertex.co for vertex in obj.data.vertices]))
    for name,digest in frozen.items():
        assert mesh_hash(bpy.data.objects[name]) == digest, f'Other geometry or UV changed: {name}'
    image = bpy.data.images.new('D1 returned fringe own flow atlas',resolution,resolution)
    image.colorspace_settings.name = 'sRGB';image.pixels.foreach_set(new.ravel())
    image.filepath_raw = str(HERE/'painted-hair-atlas.png');image.file_format = 'PNG'
    image.save();image.pack()
    material = obj.active_material
    texture = next(node for node in material.node_tree.nodes if node.type=='TEX_IMAGE')
    texture.image = image
    saved = pixels(HERE/'painted-hair-atlas.png')
    changed_tiles = []
    for item in report['components']:
        cell_x,cell_y = item['tile']
        cell = np.s_[cell_y*tile_size:(cell_y+1)*tile_size,cell_x*tile_size:(cell_x+1)*tile_size]
        if not np.array_equal(old[cell],saved[cell]):
            changed_tiles.append(item['name'])
    assert changed_tiles == [NAME], changed_tiles
    outside = np.ones(old.shape[:2],dtype=bool);outside[region] = False
    assert np.array_equal(old[outside],saved[outside]), 'Pixels outside the main atlas tile changed'
    before_metrics,after_metrics = color_metrics(old[region]),color_metrics(saved[region])
    component.update(mapping,paintedPixels=painted_pixels,meanColor=tile.mean(axis=(0,1)).tolist())
    (HERE/'paint-report.json').write_text(json.dumps(report,indent=2)+'\n')
    study = dict(source=str(SOURCE),candidate=str(CANDIDATE),sourceHashes=source_hashes,
                 changedGeometry=[NAME],otherGeometryAndUVExactlyFrozen=frozen,mainGeometryExactlyCandidate=True,
                 mainAtlasUVExactlyFrozen=True,changedAtlasTiles=changed_tiles,allOtherPixelsExactlyFrozen=True,
                 mapping=mapping,mainBefore=before_metrics,mainAfter=after_metrics,
                 previewResponse='0.75 emission + 0.25 diffuse, identical to assembly34 volume-paint',
                 geometry01DecisionRetained='Rejected by original frozen frontal boundary scope; this is a separate overall look study',
                 visualApproval=False,exported=False)
    (HERE/'comparison.json').write_text(json.dumps(study,indent=2)+'\n')
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'D1-Hair-Painted.blend'))
    print('SIDE_RETURN_FLOW_PAINT_READY',json.dumps({key:value for key,value in study.items() if key!='otherGeometryAndUVExactlyFrozen'}),flush=True)
    preview = module('frozen_flow_preview',BASE/'assembly-study-34/paint-preview/render_preview.py')
    preview.HERE = HERE;preview.SOURCE = HERE/'D1-Hair-Painted.blend';preview.main()
    old_preview = json.loads((SOURCE/'preview-report.json').read_text())
    new_preview = json.loads((HERE/'preview-report.json').read_text())
    assert old_preview['camera']==new_preview['camera']
    assert old_preview['hairMaterial']==new_preview['hairMaterial']
    assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest for path,digest in source_hashes.items())
    study['cameraAndPreviewResponseExactlyFrozen'] = True
    study['sourceFilesExactlyFrozen'] = True
    (HERE/'comparison.json').write_text(json.dumps(study,indent=2)+'\n')
    print('SIDE_RETURN_FLOW_PREVIEW_OK; only main geometry and its own atlas tile replaced',flush=True)


if __name__ == '__main__':
    main()
