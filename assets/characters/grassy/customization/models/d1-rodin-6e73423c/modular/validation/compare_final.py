"""Read-only silhouette QA; run with Blender from the repository root.

The scene is never saved. Each input silhouette is registered by its bbox height
and center for shape diagnostics, not for an absolute dimensional-fit claim.
"""
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix,Vector

OUT=Path(__file__).resolve().parent

def mask_stats(mask):
    ys,xs=np.nonzero(mask)
    assert len(xs),'Empty diagnostic silhouette'
    return {'bbox':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],
            'width':int(xs.max()-xs.min()+1),'height':int(ys.max()-ys.min()+1),
            'centroid':[float(xs.mean()),float(ys.mean())]}

def register(mask):
    b=mask_stats(mask)['bbox'];crop=mask[b[1]:b[3],b[0]:b[2]]
    scale=380/crop.shape[0];h=380;w=round(crop.shape[1]*scale)
    assert w<620,'Candidate silhouette is too wide for diagnostic registration'
    ys=np.minimum((np.arange(h)/scale).astype(int),crop.shape[0]-1)
    xs=np.minimum((np.arange(w)/scale).astype(int),crop.shape[1]-1)
    result=np.zeros((640,640),dtype=bool);left=(640-w)//2
    result[130:510,left:left+w]=crop[ys[:,None],xs]
    return result

def save_overlay(path,reference,candidate):
    rgb=np.zeros((640,640,4),dtype=np.float32);rgb[:,:,3]=1
    rgb[reference,:3]=(.05,.8,.95);rgb[candidate,:3]=(.95,.35,.04)
    rgb[reference&candidate,:3]=(.2,.8,.3)
    im=bpy.data.images.new(path.stem,640,640,alpha=True)
    im.pixels.foreach_set(rgb[::-1].ravel());im.filepath_raw=str(path);im.file_format='PNG';im.save()

bpy.ops.wm.open_mainfile(filepath=str(OUT.parent/'d1-modular.blend'))
scene=bpy.context.scene
for obj in scene.objects:
    if obj.type=='ARMATURE':
        obj.animation_data.action=None
        for track in obj.animation_data.nla_tracks:track.mute=True
        for bone in obj.pose.bones:bone.matrix_basis=Matrix.Identity(4)
scene.frame_set(0)
mat=bpy.data.materials.new('QA flat silhouette');mat.use_nodes=True
nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value=(1,1,1,1);mat.node_tree.links.new(em.outputs[0],out.inputs[0])
for obj in scene.objects:
    if obj.type=='MESH':
        obj.hide_render=obj.get('characterPart') not in ('head','hair')
        if not obj.hide_render:
            obj.data.materials.clear();obj.data.materials.append(mat)
            for face in obj.data.polygons:face.material_index=0
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.cycles.device='CPU'
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
cam=scene.camera;cam.data.type='ORTHO';cam.data.ortho_scale=1.5
report={'schema':'d1-head-fit.v1','status':'diagnostic only','registration':'independent uniform head-height normalization and bbox-centering; no absolute center/size pass inferred',
        'limitations':['Reference views are AI illustrations with inconsistent width/depth relationships.',
                      'Candidate includes upper neck support inside head; reference mask excludes neck manually.',
                      'Head-top camera in reference is not proven orthographic.',
                      'Flat emission silhouette ignores color and lighting; beauty colors are not adjusted.'], 'views':{}}
for view,direction in [('front',(0,-1,0)),('side',(-1,0,0)),('back',(0,1,0)),('top',(0,0,1))]:
    target=Vector((0,0,2.59));cam.location=target+Vector(direction)*7
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    path=OUT/f'candidate-{view}-silhouette.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    im=bpy.data.images.load(str(path),check_existing=False)
    pix=np.array(im.pixels[:]).reshape(700,700,4)[::-1];candidate=pix[:,:,3]>.5
    reference=np.load(OUT/f'reference-{view}-mask.npy')
    refstats=mask_stats(reference);canstats=mask_stats(candidate)
    r,c=register(reference),register(candidate)
    refaspect=refstats['width']/refstats['height'];canaspect=canstats['width']/canstats['height']
    rep={'reference':refstats,'candidate':canstats,'referenceAspect':refaspect,'candidateAspect':canaspect,
         'aspectRelativeError':canaspect/refaspect-1,'registeredSilhouetteIoU':float((r&c).sum()/(r|c).sum()),
         'registeredCentroidDriftPx':list(np.array(mask_stats(c)['centroid'])-np.array(mask_stats(r)['centroid']))}
    report['views'][view]=rep;save_overlay(OUT/f'{view}-overlay.png',r,c)
r=report['views'];expected=r['front']['referenceAspect']/r['side']['referenceAspect']
report['referenceConsistency']={'widthDepthFromFrontSide':expected,'widthDepthFromTop':r['top']['referenceAspect'],'relativeConflict':r['top']['referenceAspect']/expected-1}
(OUT/'multiview-fit-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
