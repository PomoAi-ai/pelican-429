"""Thin closed flowing regions on one shared short-bob surface envelope."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent;BASE=HERE.parent
SOURCE=BASE/'parting-wrap-assembly-study-01/draft-03/D1-Hair-Painted.blend'
NAMES=[f'{side} lower fan {i:02}' for side in ('right','left') for i in range(1,8)]+[f'{side} lower body underfold' for side in ('right','left')]
ORIGIN=np.asarray([0.,.035,2.54])
ROWS=89;COLUMNS=32;SIDES=64
spec=importlib.util.spec_from_file_location('surface_bob_existing_helpers',BASE/'joint-crown-fringe-sculpt-study-01/build.py')
joint=importlib.util.module_from_spec(spec);spec.loader.exec_module(joint)


def smoothstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)


def radius(z):
    heights=np.asarray([2.08,2.14,2.25,2.40,2.56,2.72,2.85])
    # The rear depth and lateral width belong to one enclosing mass, not to
    # sixteen independent bevelled shoulders.
    return np.asarray([np.interp(z,heights,[.41,.46,.57,.605,.54,.46,.39]),
                       np.interp(z,heights,[.31,.38,.55,.575,.49,.405,.32])])


RECIPES={
 1:dict(zroot=2.71,ztip=2.355,theta=[160,161,160,157,164],width=.18,role='short rear surface layer',tipRadial=-.007),
 2:dict(zroot=2.76,ztip=2.205,theta=[151,149,147,144,151],width=.43,role='rear primary continuous turn',tipRadial=-.033),
 3:dict(zroot=2.72,ztip=2.285,theta=[142,140,137,137,131],width=.19,role='embedded middle short layer',tipRadial=.012),
 4:dict(zroot=2.78,ztip=2.18,theta=[132,129,127,123,127],width=.46,role='middle primary cheek-wrapping turn',tipRadial=-.025),
 5:dict(zroot=2.73,ztip=2.145,theta=[122,119,116,108,94],width=.39,role='ear-back primary, inward lower finish',tipRadial=-.028),
 6:dict(zroot=2.65,ztip=2.25,theta=[116,116,113,109,106],width=.19,role='embedded ear-back surface layer',tipRadial=.010),
 7:dict(zroot=2.625,ztip=2.195,theta=[114,112,110,104,87],width=.16,role='small inner nape finishing layer',tipRadial=.007),
 0:dict(zroot=2.84,ztip=2.195,theta=[139,137,133,124,115],width=.64,role='continuous hidden inner support',tipRadial=-.035),
}


def recipe_for(name):
    number=int(name[-2:]) if 'lower fan' in name else 0
    value=json.loads(json.dumps(RECIPES[number]))
    # Reflection describes placement only. End heights and turning directions
    # differ mildly rather than making two rows of identical curls.
    positive=name.startswith('left')
    value['sign']=1 if positive else -1
    value['number']=number
    if positive:
        value['ztip'] += {0:.009,1:.015,2:-.005,3:.014,4:.008,5:.012,6:-.010,7:.005}[number]
        value['theta'][-1]+={0:-2,1:3,2:-3,3:2,4:-2,5:2,6:-3,7:2}[number]
    return value


def surface_point(sign,theta,z,radial_shift):
    rx,ry=radius(z)
    rx*=1.015 if sign<0 else .965
    return np.asarray([sign*math.sin(theta)*(rx+radial_shift),
                       .035-math.cos(theta)*(ry+radial_shift),z])


def make_region(name,head):
    recipe=recipe_for(name);number=recipe['number'];major=number in (2,4,5)
    root=recipe['zroot'];tip=recipe['ztip'];sign=recipe['sign']
    rings=[]
    angles=[]
    for row,t in enumerate(np.linspace(0,1,ROWS)):
        z=root+(tip-root)*t
        theta=math.radians(float(joint.smooth_controls(np.asarray(recipe['theta']),t)))
        taper=1-smoothstep(.72,1,t)
        width=recipe['width']*(.40+.60*smoothstep(0,.22,t))*taper+.004*(1-taper)
        # Keep the common mass behind the ear until its lower third. The
        # existing temple forelocks remain the frontmost ear-side strands.
        ear_limit=math.radians(float(np.interp(z,[2.15,2.28,2.36,2.43,2.62,2.85],[72,91,104,110,110,108])))
        theta=max(theta,ear_limit+width/2)
        release=smoothstep(.72,1,t)
        shift=recipe['tipRadial']*release
        if number==0:shift-=.028
        elif not major:shift-=.007*(1-release)
        thickness=(.013 if major else .0075)*(1-release)+.0016*release
        lift=(.010 if major else .0025)*(1-release)
        root_blend=smoothstep(.025,.20,t)
        section=[]
        # Both faces are sampled from the same curved support. Their borders
        # connect with finite thickness, not two freely standing round tubes.
        for outer,indices in [(True,range(COLUMNS+1)),(False,range(COLUMNS-1,0,-1))]:
            for col in indices:
                u=col/COLUMNS
                angle=theta+(u-.5)*width
                angle+=math.radians(2.0)*math.sin(math.pi*t)*math.sin(math.pi*u)
                point=surface_point(sign,angle,z,shift)
                outward=np.asarray([sign*math.sin(angle),-math.cos(angle),0.])
                dome=math.sin(math.pi*u)**1.2
                if outer:point+=outward*lift*dome
                else:point-=outward*thickness
                direction=point-ORIGIN;direction/=np.linalg.norm(direction)
                skin,normal,_,_=head.ray_cast(Vector(ORIGIN+direction*2),Vector(-direction),4)
                if skin is None:
                    raise ValueError(f'No actual Head under {name} root support {row}/{col}')
                # Only the rooted upper fifth uses Head as its surface.
                # The lower envelope can leave the face and turn into short bob.
                rooted=np.asarray(skin,float)+direction*(.006 if outer else .001)
                point=rooted*(1-root_blend)+point*root_blend
                section.append(point)
        assert len(section)==SIDES
        rings.append(section);angles.append(theta)
    return np.asarray(rings),dict(**recipe,rootTransitionProgress=[.025,.20],
                                 bodyThickness=.013 if major else .0075,
                                 outerBodyDome=.010 if major else .0025,
                                 support='same elliptical ear-back envelope; finite thin closed patch; final quarter releases/tapers',
                                 centreAnglesDegrees=np.degrees(angles).tolist())


def atlas_uv(obj,origin,scale,head):
    mesh=obj.data;native=mesh.uv_layers.active;native.name='Hair flow native'
    packed=mesh.uv_layers.new(name='Hair flow')
    for n,p in zip(native.data,packed.data):p.uv=origin+np.asarray(n.uv)*scale
    mesh.uv_layers.active=packed;packed.active_render=True
    guide=np.asarray(json.loads(obj['guideBlender']))
    contacts=[]
    for vertex in mesh.vertices[:8*SIDES]:
        if abs(joint.audit_helper.signed_distance(head,vertex.co))<.012:
            contacts.append(vertex.index)
    if not contacts:raise ValueError(f'Root field not connected on {obj.name}')
    obj['rootContactVertexIndices']=contacts
    obj['strandTopology']='ordered-closed-sweep'
    obj['flowProfile']='cosine'
    obj['surfacePatch']=True
    progress=mesh.attributes.new('_D1_STRAND_T','FLOAT','POINT')
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(guide,axis=0),axis=1))];arc/=arc[-1]
    for index,datum in enumerate(progress.data):
        datum.value=float(arc[index//SIDES]) if index<len(guide)*SIDES else float(index>len(guide)*SIDES)


def image_hashes():
    return {image.name:hashlib.sha256(np.asarray(image.pixels,dtype='<f4').tobytes()).hexdigest()
            for image in bpy.data.images if image.type!='RENDER_RESULT' and image.size[0]}


def main():
    out=HERE/'draft-01';out.mkdir(exist_ok=True)
    if (out/'Bob-Surface.blend').exists():raise ValueError('Preserved complete candidate already exists')
    source_sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    atlas_path=SOURCE.parent/'painted-hair-atlas.png';atlas_sha=hashlib.sha256(atlas_path.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    frozen={o.name:joint.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name not in NAMES}
    assert len(frozen)==37
    pixels=image_hashes();head=joint.skull_tree(bpy.data.objects['Head'])
    originals={name:bpy.data.objects[name] for name in NAMES};metadata={}
    for name,obj in originals.items():
        uv=np.asarray([d.uv for d in obj.data.uv_layers.active.data])
        metadata[name]=dict(matrix=obj.matrix_world.copy(),material=obj.active_material,region=obj['region'],
                            uvOrigin=uv.min(axis=0),uvScale=uv.max(axis=0)-uv.min(axis=0))
    geometry={name:make_region(name,head) for name in NAMES}
    for obj in originals.values():bpy.data.objects.remove(obj,do_unlink=True)
    results=[]
    body=bpy.data.objects['Body']
    neck=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[tuple(p.vertices) for p in body.data.polygons])
    for name,(rings,recipe) in geometry.items():
        meta=metadata[name]
        obj,guide=joint.helper.closed_object(name,rings,meta['material'],meta['matrix'],meta['region'])
        obj['referenceRole']=recipe['role'];atlas_uv(obj,meta['uvOrigin'],meta['uvScale'],head)
        result=joint.inspect(obj,head,recipe)
        neck_points=[v.co for v in obj.data.vertices if v.co.z<2.3]
        result['bodyNeckSampleVertexCount']=len(neck_points)
        result['bodyNeckMin']=min(joint.audit_helper.signed_distance(neck,p) for p in neck_points) if neck_points else None
        results.append(result)
        print('SURFACE_BOB_COMPONENT',name,result['selfIntersection']['exactCrossings'],flush=True)
    for name,digest in frozen.items():assert joint.mesh_hash(bpy.data.objects[name])==digest,name
    assert image_hashes()==pixels
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_sha
    assert hashlib.sha256(atlas_path.read_bytes()).hexdigest()==atlas_sha
    report=dict(source=str(SOURCE),sourceSHA256=source_sha,changedObjects=NAMES,other37MeshHashes=frozen,
                allSourceImagePixelHashes=pixels,atlasSHA256=atlas_sha,allAtlasFrozen=True,
                sharedEnvelope=dict(heights=[2.08,2.14,2.25,2.40,2.56,2.72,2.85],
                                    radiusX=[.41,.46,.57,.605,.54,.46,.39],radiusY=[.31,.38,.55,.575,.49,.405,.32]),
                components=results,structurePass=all(r['closed'] and r['signedVolume']>0 and r['selfIntersection']['exactCrossings']==0 for r in results),
                geometryOnly=True,artisticApproval=False,published=False,exported=False)
    (out/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (out/'build.py').write_text(Path(__file__).read_text())
    text=bpy.data.texts.new('Shared surface bob recipe.py');text.write(Path(__file__).read_text())
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Bob-Surface.blend'))
    print('SURFACE_BOB_BLEND_READY',out,'structure',report['structurePass'],flush=True)
    grey=bpy.data.materials.new('Shared surface bob clay');grey.use_nodes=True
    shader=grey.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.42,.42,.42,1)
    shader.inputs['Roughness'].default_value=.76
    for name in json.loads(scene['Hair components']):
        obj=bpy.data.objects[name];obj.data.materials.clear();obj.data.materials.append(grey)
    centre=Vector((0,.015,2.64));scene.camera.data.ortho_scale=1.5
    scene.render.resolution_x=scene.render.resolution_y=768;scene.cycles.samples=24;scene.cycles.use_denoising=True
    for view,axis in [('front',(0,-1,0)),('right',(-1,0,0)),('three-quarter',(-1,-1,0))]:
        scene.camera.location=centre+Vector(axis)*4
        scene.camera.rotation_euler=(centre-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/(view+'.png'));bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'Bob-Surface-Clay.blend'))
    print('SURFACE_BOB_COMPLETE',out,flush=True)


if __name__=='__main__':main()
