"""Restore rejected source shadow colors and remove duplicate lighting on painted art."""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

HERE=Path(__file__).resolve().parent
BASE=HERE.parent
SOURCE=BASE/'fringe-junction-assembly-study-01/draft-03/Paint-Preview.blend'
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE));sys.path.insert(0,str(BASE/'paint-calibration-14'));sys.path.insert(0,str(BASE))
from png_bytes import read_png
from volume_paint import geometry_tree,raster_volume


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


def repaired_reference(paint):
    reference=paint.PaintedReference();records={}
    for view in paint.VIEWS:
        image=paint.pixels(BASE/'reference'/f'{view}-crop.png')[:,:,:3]
        raw=paint.pixels(BASE/'reference'/f'{view}-hair-mask.png')[:,:,0]>.5
        domain=paint.fill_highlight_holes(paint.close_color_gaps(raw),view)
        if view in paint.FACE_POLYGONS:domain[paint.polygon_mask(raw.shape,paint.FACE_POLYGONS[view])]=False
        for polygon in paint.EAR_POLYGONS[view]:domain[paint.polygon_mask(raw.shape,polygon)]=False
        red,green,blue=image[:,:,0],image[:,:,1],image[:,:,2]
        chroma=red-blue
        ratio=np.divide(green-blue,chroma,out=np.zeros_like(red),where=chroma>0)
        saturation=np.divide(chroma,red,out=np.zeros_like(red),where=red>0)
        brown=(red>green)&(green>blue)&(ratio>=.12)&(ratio<=.40)&(saturation>=.25)
        valid=domain&(paint.gold_palette(image)|brown)
        rows,columns=np.where(valid)
        if not len(rows):raise ValueError(f'{view}: no genuine source hair')
        tree=KDTree(len(rows))
        for index,(u,v) in enumerate(zip(columns,rows)):tree.insert((float(u),float(v),0),index)
        tree.balance();table=image.copy()
        for v,u in zip(*np.where(~valid)):
            point=tree.find(Vector((float(u),float(v),0)))[0]
            table[v,u]=image[round(point.y),round(point.x)]
        previous=reference.masks[view]
        records[view]=dict(previousValidPixels=int(previous.sum()),validPixels=int(valid.sum()),
                           restoredBrownPixels=int((valid&~previous&brown).sum()),
                           sourceBoundary='Existing closed hair mask minus unchanged explicit face/ear polygons',
                           addedColors='R>G>B, (G-B)/(R-B) .12..40, saturation>=.25; no gamma or saturation remap')
        reference.tables[view]=paint.smooth_painted_field(table)
        reference.flow_tables[view]=reference.tables[view];reference.masks[view]=valid
    source=paint.pixels(BASE/'reference/side-crop.png')[:,:,:3]
    roi=source[175:245,25:138];valid=reference.masks['side'][175:245,25:138]
    palette_source=roi[valid];luminance=palette_source@np.array([.2126,.7152,.0722])
    bands=[(.025,.065),(.16,.22),(.33,.43),(.95,.985)];palette=[]
    for low,high in bands:
        bounds=np.quantile(luminance,[low,high]);selected=palette_source[(luminance>=bounds[0])&(luminance<=bounds[1])]
        if not len(selected):raise ValueError(f'No source colors in existing palette band {low}..{high}')
        palette.append(selected.mean(axis=0))
    root_image=paint.pixels(BASE/'reference/front-crop.png')[:,:,:3][39:81,197:225]
    root_values=root_image[reference.masks['front'][39:81,197:225]]
    if not len(root_values):raise ValueError('No genuine original root color')
    root_luminance=root_values@np.array([.2126,.7152,.0722])
    root=root_values[root_luminance<=np.quantile(root_luminance,.25)].mean(axis=0)
    records['palette']=dict(previous=reference.strand_palette.tolist(),repaired=np.asarray(palette).tolist(),
                            previousRoot=reference.root_color.tolist(),repairedRoot=root.tolist(),
                            source='Same original side x25:138/y175:245 and same quantile bands; restored genuine source shadows',
                            bands=bands,pixels=len(palette_source))
    reference.strand_palette=np.asarray(palette);reference.root_color=root;reference.strand_palette_pixels=len(palette_source)
    return reference,records


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-blend',type=Path,default=SOURCE)
    parser.add_argument('--output',type=Path,default=HERE/'source-shadow-restored')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    source=args.source_blend;output=args.output
    if output.exists():raise ValueError(f'Preserved color candidate exists: {output}')
    output.mkdir()
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene
    preview=module('color_preview_helpers',BASE/'assembly-study-34/paint-preview/render_preview.py')
    frozen=preview.geometry_hash()
    helpers=module('color_atlas_helpers',BASE/'main-side-return-study-01/flow-paint/build_preview.py')
    paint=module('color_reference_functions',BASE/'assembly-study-34/paint_components.py');paint.HERE=BASE
    reference,reference_report=repaired_reference(paint)
    old_report=json.loads((source.parent/'paint-report.json').read_text())
    components=old_report['components']
    pixels=helpers.pixels(source.parent/'painted-hair-atlas.png');original=pixels.copy()
    resolution=pixels.shape[0];size=resolution//math.ceil(math.sqrt(len(components)))
    tree=geometry_tree([o for o in scene.objects if o.type=='MESH' and not o.hide_render])
    outside=np.ones(pixels.shape[:2],bool);tile_reports=[]
    for item in components:
        name=item['name'];obj=bpy.data.objects[name];cell=item['tile'];col,row=cell
        original_uv=np.asarray([loop.uv for loop in obj.data.uv_layers.active.data],dtype=np.float32)
        native=(original_uv.astype(float)*resolution-np.asarray(cell)*size-8)/(size-16)
        mapping=item['mapping']
        physical=None
        if 'actual volume 10%' in mapping or mapping.startswith('actual smooth normals'):
            physical,details=raster_volume(obj,tree,reference.strand_palette,reference.root_color,size,8,resolution,cell)
        if mapping.startswith('actual smooth normals'):
            color=physical
        else:
            for loop,value in zip(obj.data.uv_layers.active.data,native):loop.uv=value
            if 'actual volume 10%' in mapping:
                obj.name='Audit registered '+name
                projected=[]
                for view in (['front','side'] if name=='Single broad swept fringe' else ['front']):
                    paint.PROJECTED_COMPONENTS[obj.name]=view
                    tile,count,details=paint.raster_component(obj,reference,size,8);projected.append(tile)
                obj.name=name;color=.9*np.mean(projected,axis=0)+.1*physical
            else:
                color,count,details=paint.raster_component(obj,reference,size,8)
            for loop,value in zip(obj.data.uv_layers.active.data,original_uv):loop.uv=value
        assert np.array_equal(np.asarray([loop.uv for loop in obj.data.uv_layers.active.data],dtype=np.float32),original_uv),name
        region=np.s_[row*size:(row+1)*size,col*size:(col+1)*size]
        pixels[region][:,:,:3]=color;outside[region]=False
        tile_reports.append(dict(name=name,sourceMapping=mapping,tile=cell,details=details))
        print('SHADOW_COLOR_TILE',len(tile_reports),len(components),name,flush=True)
    image=bpy.data.images.new('Original shadow colors audit atlas',resolution,resolution)
    image.colorspace_settings.name='sRGB';image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw=str(output/'painted-hair-atlas.png');image.file_format='PNG';image.save();image.pack()
    saved=helpers.pixels(output/'painted-hair-atlas.png')
    assert np.array_equal(saved[outside],original[outside]),'Unused atlas pixels changed'
    names=json.loads(scene['Hair components']);old=bpy.data.objects[names[0]].active_material
    mat=old.copy();mat.name='Reference shadows pure texture emission'
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    tex=next(n for n in nodes if n.type=='TEX_IMAGE');tex.image=image
    material_output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    for link in list(material_output.inputs['Surface'].links):links.remove(link)
    emission=nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1
    links.new(tex.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs[0],material_output.inputs['Surface'])
    for name in names:
        bpy.data.objects[name].data.materials.clear();bpy.data.objects[name].data.materials.append(mat)
    assert preview.geometry_hash()==frozen
    assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output/'D1-Hair-Painted.blend'))
    centre=Vector((0,.015,2.64));scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768;scene.cycles.samples=64;scene.cycles.use_denoising=False
    for view,axis in {'front':(0,-1,0),'right':(-1,0,0),'three-quarter':(-1,-1,0)}.items():
        scene.camera.location=centre+Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(output/f'{view}.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'Paint-Preview.blend'))
    report=dict(source=str(source),sourceSHA256=source_hash,baselineGeometryUVSHA256=frozen,
                allGeometryMatricesUVExactlyFrozen=True,sourceFileUnchanged=True,unusedAtlasPixelsExactlyFrozen=True,
                calibratedGammaCorrection=False,shader='1.0 texture emission for already painted light/shadow; no additional diffuse',
                referenceSampling=reference_report,components=old_report['components'],tiles=tile_reports,visualApproval=False,exported=False)
    (output/'paint-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (output/'corrected_preview.py').write_text(Path(__file__).read_text())
    assert preview.geometry_hash()==frozen
    assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
    print('SOURCE_SHADOW_PREVIEW_COMPLETE',output,flush=True)


if __name__=='__main__':main()
