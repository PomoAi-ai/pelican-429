"""Rebuild independent, rooted hair grooms from authored sweep curves.

Run with Blender: --background --python scripts/character_hair/export.py --
    --profile grassy --output output/hair-rebuild
Coordinates in the design functions are model-space Y-up, facing +Z.
"""
import argparse
import json
import math
import random
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
TEXTURES = ROOT / 'assets/characters/grassy/history/model-reference-fit/textures'
PROFILES = {
    'grassy': ((0,2.46,-.035),(.397,.48,.365)),
    'sam-monster': ((0,2.24,.005),(.325,.36,.34)),
    'sam-human': ((0,2.27,-.015),(.34,.37,.34)),
    'tibo-monster': ((-.01,2.21,-.005),(.355,.38,.335)),
    'tibo-human': ((0,2.21,-.035),(.365,.39,.35)),
}


def point(value):
    x, y, z = value
    return Vector((x, -z, y))


def smooth(value):
    value = min(1, max(0, value))
    return value * value * (3 - 2 * value)


def material(name, color_file, normal, profile):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes['Principled BSDF']
    shader.inputs['Roughness'].default_value = .49
    shader.inputs['Specular IOR Level'].default_value = .34
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(TEXTURES / color_file), check_existing=True)
    tint = nodes.new('ShaderNodeMixRGB')
    tint.blend_type = 'MULTIPLY'
    tint.inputs[0].default_value = 1
    tint.inputs[2].default_value = {'grassy':(1.20,1.05,.95,1), 'sam':(1.65,1.31,1.08,1),
                                    'tibo':(1.36,1.12,.97,1)}[profile.split('-')[0]]
    links.new(texture.outputs['Color'], tint.inputs[1])
    links.new(tint.outputs[0], shader.inputs['Base Color'])
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = normal
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = .28
    links.new(texture.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])
    return mat


def mesh_object(name, vertices, faces, uv_faces, materials, indices):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for mat in materials:
        mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name='Hair strands')
    for polygon, coords, index in zip(mesh.polygons, uv_faces, indices):
        polygon.use_smooth = True
        polygon.material_index = index
        for loop, value in zip(polygon.loop_indices, coords):
            uv.data[loop].uv = value
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def cap(profile,materials):
    boundary=json.loads((ROOT/'assets/characters/hair-design/scalp-boundaries.json').read_text())[profile]
    center,radii=PROFILES[profile]
    vertices,faces,uvs=[],[],[]
    rows,sides=20,96
    for row in range(rows+1):
        t=.001+.999*row/rows
        for side in range(sides+1):
            segment=side/sides*len(boundary)
            index=int(segment)%len(boundary)
            edge=Vector(boundary[index]).lerp(Vector(boundary[(index+1)%len(boundary)]),segment-int(segment))
            latitude=math.acos(max(-.98,min(.98,(edge.y-center[1])/radii[1])))
            radial=math.sin(t*latitude)/math.sin(latitude)
            angle=math.atan2(edge.x-center[0],edge.z-center[2])
            oval=Vector((center[0]+radii[0]*math.sin(t*latitude)*math.sin(angle),
                         center[1]+radii[1]*math.cos(t*latitude),
                         center[2]+radii[2]*math.sin(t*latitude)*math.cos(angle)))
            fitted=Vector((center[0]+(edge.x-center[0])*radial,oval.y,
                           center[2]+(edge.z-center[2])*radial))
            position=oval.lerp(fitted,smooth((t-.90)/.10))
            if profile=='grassy':
                ear=math.exp(-((position.y-2.28)/.125)**4-((position.z+.015)/.14)**4)
                position.x*=1-.32*ear
            vertices.append(point(position))
    for row in range(rows):
        for side in range(sides):
            a=row*(sides+1)+side
            faces.append((a,a+sides+1,a+sides+2,a+1))
            u,v,un,vn=side/sides,row/rows,(side+1)/sides,(row+1)/rows
            uvs.append(((u,v),(u,vn),(un,vn),(un,v)))
    return mesh_object('HairCap',vertices,faces,uvs,materials,[2]*len(faces))


def arc_position(path, distances, fraction):
    target = distances[-1]*fraction
    for i in range(1,len(path)):
        if distances[i] >= target:
            return path[i-1].lerp(path[i], (target-distances[i-1])/(distances[i]-distances[i-1]))
    return path[-1].copy()


def bind(root, mesh, weights, skeleton, locks):
    armature = bpy.data.armatures.new('HairSkeleton')
    rig = bpy.data.objects.new('HairSkeleton',armature)
    bpy.context.collection.objects.link(rig)
    rig.parent = root
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    anchor = armature.edit_bones.new('HairAnchor')
    anchor.head, anchor.tail = (0,0,0),(0,0,.1)
    metadata = []
    for index, ((start,middle,end),lock) in enumerate(zip(skeleton,locks)):
        mid_name, tip_name = f'Hair_{index:02d}_Mid',f'Hair_{index:02d}_Tip'
        mid = armature.edit_bones.new(mid_name)
        mid.head,mid.tail,mid.parent = start,middle,anchor
        tip = armature.edit_bones.new(tip_name)
        tip.head,tip.tail,tip.parent = middle,end,mid
        tip.use_connect = True
        metadata.append({'mid':mid_name,'tip':tip_name,'region':lock['region'],
                         'phase':index*2.399963229728653,'maxBend':lock.get('maxBend', .13 if lock['region']=='front' else .11)})
    bpy.ops.object.mode_set(mode='OBJECT')
    groups = {'HairAnchor':mesh.vertex_groups.new(name='HairAnchor')}
    for data in metadata:
        for name in (data['mid'],data['tip']):
            groups[name] = mesh.vertex_groups.new(name=name)
    for vertex,(index,anchor_weight,mid_weight,tip_weight) in enumerate(weights):
        for name,weight in [('HairAnchor',anchor_weight),(metadata[index]['mid'],mid_weight),(metadata[index]['tip'],tip_weight)]:
            if weight:
                groups[name].add([vertex],weight,'REPLACE')
    modifier = mesh.modifiers.new('Rooted strand skeleton','ARMATURE')
    modifier.object = rig
    mesh.parent = rig
    root['version'],root['coordinateSpace'],root['strands'] = 1,'model',metadata


def reference_groom(profile, materials, style='soft'):
    if profile == 'grassy':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from grassy_groom import build
        return build(materials, cap, mesh_object, style)
    sys.path.insert(0,str(ROOT/'scripts/grassy_atelier'))
    sys.path.insert(0,str(ROOT/'scripts/grassy_reference_fit'))
    import hair_fit
    palette=dict(zip(('hair','hair_light','hair_dark'),materials))
    rng=random.Random(42973)
    groups=[hair_fit._fringe(palette,rng),hair_fit._crown(palette,rng),
            hair_fit._sides(palette,rng),hair_fit._back(palette,rng)]
    cap_mesh=cap(profile,materials)
    cap_mesh.name='HairCap'
    if profile.startswith('sam'):
        for obj in groups[0]:
            bpy.data.objects.remove(obj,do_unlink=True)
        front=[]
        for layer,count in enumerate((9,7)):
            for i in range(count):
                x=-.32+.64*i/(count-1)
                lean=-.13+.03*math.sin(i*1.7)
                root=2.73+layer*.095+.025*math.sin(i*1.9)
                peak=2.97+.045*math.sin(i*2.0+layer)
                points=[(x,-.40+layer*.04,root),
                        (x-.04,-.40+layer*.065,root+.105),
                        (x+lean,-.36+layer*.09,peak+.03),
                        (x+lean-.025,-.25+layer*.11,peak-.035)]
                front.append(hair_fit._lock('Sam short swept front',points,
                        .051+.006*math.sin(i),.050,materials[1 if i in (1,6) else 0],i,.65,root_spread=.20))
        groups[0]=front


    records=[(obj,region,36,32,True) for objects,region in
             zip(groups,('front','crown','rear','rear')) for obj in objects]
    def fit(value,region):
        if profile.startswith('sam') and region=='front':
            value.y=-.29+(value.y+.29)*.64
            value.z=2.76+(value.z-2.76)*.66
        value.x *= .89
        value.y = .035+(value.y-.045)*.93
        if value.z>2.91:
            value.z=2.91+(value.z-2.91)*.57
        if region=='front' and not profile.startswith('sam'):
            front_weight=min(1,max(0,(-value.y-.10)/.20))
            lower_weight=min(1,max(0,(2.94-value.z)/.20))
            value.y-=.105*front_weight*lower_weight
            value.z-=.025*front_weight*lower_weight
        if profile=='grassy' and region=='rear' and value.z<2.28:
            value.z-=.055*min(1,(2.28-value.z)/.14)
        if profile!='grassy':
            center,radii=PROFILES[profile]
            if profile.startswith('tibo') and region=='front':
                lower=min(1,max(0,(2.95-value.z)/.4))
                value.x-=.075*lower
                value.z+=.10*value.x
            value.x=center[0]+value.x*radii[0]/.397
            value.y=-center[2]+(value.y-.035)*radii[2]/.365
            value.z=center[1]+(value.z-2.46)*radii[1]/.48
            if profile.startswith('sam') and region=='front':
                value.y+=.070
            if profile.startswith('sam') and region=='rear':
                value.z-=.07*min(1,max(0,(2.27-value.z)/.24))
        return value
    cap_mesh.name='HairCap'
    vertices,faces,uvs,indices,weights,skeleton,locks=[],[],[],[],[],[],[]
    for obj,region,source_rows,source_sides,extra_tip in records:
        index=len(locks)
        locks.append({'region':region})
        source=[fit(v.co.copy(),region) for v in obj.data.vertices]
        if profile=='grassy' and obj.name.startswith('Hair_curved_crown_tuft_00'):
            for value in source:
                if value.z>2.94:
                    value.z=2.94+(value.z-2.94)*.45
        stride=source_sides+1 if extra_tip else source_sides
        path=[sum(source[r*stride:r*stride+source_sides],Vector())/source_sides for r in range(source_rows)]
        if extra_tip:
            path.append(source[-1])
        distances=[0.]
        for before,after in zip(path,path[1:]):
            distances.append(distances[-1]+(after-before).length)
        skeleton.append(tuple(arc_position(path,distances,t) for t in (.2,.6,1)))
        offset=len(vertices)
        rows=sorted(set([*range(0,source_rows,max(1,source_rows//12)),source_rows-1]))
        side_step=max(1,source_sides//8)
        sides=[*range(0,source_sides,side_step),source_sides]
        for row in rows:
            t=distances[row]/distances[-1]
            if t<=.2:
                weight=(1.,0.,0.)
            elif t<=.6:
                blend=smooth((t-.2)/.4)
                weight=(1-blend,blend,0.)
            else:
                blend=smooth((t-.6)/.4)
                weight=(0.,1-blend,blend)
            for side in sides:
                vertices.append(source[row*stride+side%source_sides])
                weights.append((index,*weight))
        ring=len(sides)
        material_index=materials.index(obj.data.materials[0])
        for row in range(len(rows)-1):
            for side in range(ring-1):
                a=offset+row*ring+side
                faces.append((a,a+1,a+ring+1,a+ring))
                u,un=sides[side]/source_sides,sides[side+1]/source_sides
                v,vn=rows[row]/source_rows,rows[row+1]/source_rows
                uvs.append(((u,v),(un,v),(un,vn),(u,vn)))
                indices.append(material_index)
        tip=len(vertices)
        vertices.append(path[-1])
        weights.append((index,0.,0.,1.))
        last=offset+(len(rows)-1)*ring
        for side in range(ring-1):
            faces.append((last+side,last+side+1,tip))
            uvs.append(((sides[side]/source_sides,(source_rows-1)/source_rows),
                        (sides[side+1]/source_sides,(source_rows-1)/source_rows),(.5,1)))
            indices.append(material_index)
        bpy.data.objects.remove(obj,do_unlink=True)
    mesh=mesh_object('HairStrands',vertices,faces,uvs,materials,indices)
    return cap_mesh,mesh,weights,skeleton,locks


def export(profile, directory, style='soft'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    normal = bpy.data.images.load(str(TEXTURES/'grassy_hair_strands_normal.png'),check_existing=True)
    normal.colorspace_settings.name = 'Non-Color'
    materials = [material('Chestnut hair', 'grassy_hair_strands_color.png',normal,profile),
                 material('Warm hair highlights', 'grassy_hair_light_strands_color.png',normal,profile),
                 material('Root undercoat', 'grassy_hair_dark_strands_color.png',normal,profile)]
    if profile == 'grassy':
        for mat in materials:
            shader = mat.node_tree.nodes['Principled BSDF']
            shader.inputs['Roughness'].default_value = .58 if style == 'tousled' else .63
            shader.inputs['Specular IOR Level'].default_value = .27 if style == 'tousled' else .24
            if style == 'tousled':
                next(node for node in mat.node_tree.nodes if node.type == 'MIX_RGB').inputs[2].default_value = (.83,.62,.46,1)
    root = bpy.data.objects.new('HairRoot',None)
    bpy.context.collection.objects.link(root)
    hair_cap,hair_mesh,weights,skeleton,locks=reference_groom(profile,materials,style)
    hair_cap.parent=root
    bind(root,hair_mesh,weights,skeleton,locks)
    directory.mkdir(parents=True,exist_ok=True)
    name = f'{profile}-tousled' if style == 'tousled' else profile
    destination = directory/f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',export_yup=True,
                              export_animations=False,export_extras=True,export_skins=True)
    triangles = sum(len(p.vertices)-2 for obj in (hair_cap,hair_mesh) for p in obj.data.polygons)
    bounds = [list(min(v.co[axis] for obj in (hair_cap,hair_mesh) for v in obj.data.vertices) for axis in range(3)),
              list(max(v.co[axis] for obj in (hair_cap,hair_mesh) for v in obj.data.vertices) for axis in range(3))]
    report={'profile':profile,'strands':len(locks),'triangles':triangles,'blenderBounds':bounds,
            'file':str(destination.relative_to(ROOT))}
    (directory/f'{name}.json').write_text(json.dumps(report,indent=2)+'\n')
    print('HAIR_EXPORT',json.dumps(report),flush=True)


def render_views(body, directory, profile, style='soft'):
    import numpy as np
    bpy.ops.import_scene.gltf(filepath=str(body))
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.render.resolution_x=scene.render.resolution_y=560
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Preview studio')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.30,.32,.31,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
    for name,location,energy,size in [('Key',(-3,-4,6),420,4),('Fill',(3,-2,4),260,4),('Rim',(0,3,5),350,3)]:
        data=bpy.data.lights.new(name,'AREA')
        data.energy,data.shape,data.size=energy,'DISK',size
        lamp=bpy.data.objects.new(name,data)
        bpy.context.collection.objects.link(lamp)
        lamp.location=location
        lamp.rotation_euler=(Vector((0,0,2.5))-lamp.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Review camera')
    data.type,data.ortho_scale='ORTHO',1.3
    camera=bpy.data.objects.new('Review camera',data)
    bpy.context.collection.objects.link(camera)
    scene.camera=camera
    height=2.62 if profile=='grassy' else 2.27
    tiles=[]
    name = f'{profile}-tousled' if style == 'tousled' else profile
    for label,location in [('front',(0,-5,height)),('side',(5,0,height)),('back',(0,5,height))]:
        camera.location=location
        camera.rotation_euler=(Vector((0,0,height))-camera.location).to_track_quat('-Z','Y').to_euler()
        filename=directory/f'{name}-{label}.png'
        scene.render.filepath=str(filename)
        bpy.ops.render.render(write_still=True)
        image=bpy.data.images.load(str(filename),check_existing=False)
        pixels=np.empty(560*560*4,dtype=np.float32)
        image.pixels.foreach_get(pixels)
        tiles.append(pixels.reshape(560,560,4))
    combined=bpy.data.images.new(f'{profile} three views',width=1680,height=560,alpha=True)
    combined.pixels.foreach_set(np.concatenate(tiles,axis=1).ravel())
    combined.filepath_raw=str(directory/f'{name}-three-views.png')
    combined.file_format='PNG'
    combined.save()


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--profile',required=True,choices=[*PROFILES,'all'])
    parser.add_argument('--output',type=Path,default=ROOT/'output/hair-rebuild')
    parser.add_argument('--render-body',type=Path)
    parser.add_argument('--style',choices=['soft','tousled'],default='soft')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if args.style == 'tousled' and args.profile != 'grassy':
        parser.error('--style tousled is only available for --profile grassy')
    for profile in PROFILES if args.profile=='all' else [args.profile]:
        export(profile,args.output.resolve(),args.style)
        if args.render_body:
            render_views(args.render_body.resolve(),args.output.resolve(),profile,args.style)
