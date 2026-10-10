"""Refine the downloaded D1 in place in UV space; preserve the source asset."""
import colorsys
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/characters/grassy/customization/models/d1-rodin-6e73423c'
OUTPUT = SOURCE / 'refined'
PUBLIC = ROOT / 'public/characters/human/customization'
sys.path.insert(0, str(ROOT / 'scripts/blender_grassy_opus55'))
sys.path.insert(0, str(Path(__file__).parent))
import scene as studio

OUTPUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'inspection/d1-inspection.blend'))
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
assert len(meshes) == 1, 'D1 source mesh changed; review region classification'
obj = meshes[0]
mesh = obj.data
original = obj.data.materials[0]
source_images = {Path(n.image.filepath).name: n.image for n in original.node_tree.nodes
                 if n.type == 'TEX_IMAGE'}
image = source_images['texture_diffuse.png']
pixels = np.array(image.pixels[:]).reshape(image.size[1], image.size[0], 4)
uv = mesh.uv_layers.active.data
before_uv = hashlib.sha256(np.array([tuple(v.uv) for v in uv]).tobytes()).hexdigest()
before_co = np.array([tuple(v.co) for v in mesh.vertices])

# Classification only chooses shader recipes; all original UV coordinates are retained.
def sample_face(face):
    coords = [uv[i].uv for i in face.loop_indices]
    samples = coords + [sum(coords, Vector((0, 0))) / len(coords)]
    return np.median([pixels[min(int(v.y * image.size[1]), image.size[1]-1),
                            min(int(v.x * image.size[0]), image.size[0]-1), :3] for v in samples], axis=0)

regions = []
for face in mesh.polygons:
    r, g, b = sample_face(face)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    z = sum(mesh.vertices[i].co.z for i in face.vertices) / len(face.vertices)
    if z > 2.05 and .055 < h < .16 and s > .22:
        regions.append('hair')
    elif (h < .065 or h > .97) and .08 < s < .6 and v > .35:
        regions.append('skin')
    elif .52 < h < .73 and s > .45:
        regions.append('blue')
    else:
        regions.append('detail')
assert regions.count('hair') > 3000 and regions.count('skin') > 1500, 'Source material regions no longer match D1'


def tex(nodes, im):
    n = nodes.new('ShaderNodeTexImage'); n.image = im
    return n


def corrected_material():
    mat = original.copy(); mat.name = 'D1 calibrated PBR'
    nt = mat.node_tree; nodes = nt.nodes; links = nt.links
    bsdf = nodes['Principled BSDF']
    base = next(n for n in nodes if n.type == 'TEX_IMAGE' and n.image == image)
    source = base.outputs['Color']
    hsv = nodes.new('ShaderNodeSeparateColor'); hsv.mode = 'HSV'; links.new(source, hsv.inputs[0])

    def ramp(socket, lo, hi, a=0., b=1.):
        n = nodes.new('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP'
        links.new(socket, n.inputs['Value'])
        for name, value in [('From Min',lo),('From Max',hi),('To Min',a),('To Max',b)]: n.inputs[name].default_value = value
        return n.outputs[0]

    def multiply(a, b):
        n = nodes.new('ShaderNodeMath'); n.operation = 'MULTIPLY'; links.new(a,n.inputs[0])
        if isinstance(b,float): n.inputs[1].default_value = b
        else: links.new(b,n.inputs[1])
        return n.outputs[0]

    def mix(a,b,factor):
        n=nodes.new('ShaderNodeMixRGB');n.blend_type='MIX';links.new(a,n.inputs[1])
        if isinstance(b,tuple): n.inputs[2].default_value=b
        else: links.new(b,n.inputs[2])
        links.new(factor,n.inputs[0]);return n.outputs[0]

    # Soft per-texel masks avoid polygon-shaped seams through eyes, lips and embroidery.
    red = nodes.new('ShaderNodeMath'); red.operation = 'MAXIMUM'
    links.new(ramp(hsv.outputs[0],.025,.045,1.,0.),red.inputs[0])
    links.new(ramp(hsv.outputs[0],.92,.98),red.inputs[1])
    skin = multiply(red.outputs[0],ramp(hsv.outputs[1],.04,.18))
    skin = multiply(skin,ramp(hsv.outputs[2],.035,.12))
    skin = multiply(skin,ramp(hsv.outputs[1],.62,.80,1.,0.))
    color = mix(source,studio.srgb('#ffede5'),multiply(skin,.48))
    geometry=nodes.new('ShaderNodeNewGeometry');xyz=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Position'],xyz.inputs[0])
    hair = multiply(ramp(hsv.outputs[0],.035,.053),ramp(hsv.outputs[0],.14,.18,1.,0.))
    hair = multiply(hair,ramp(hsv.outputs[1],.16,.38))
    hair = multiply(hair,ramp(xyz.outputs['Z'],2.0,2.15))
    curve=nodes.new('ShaderNodeRGBCurve')
    anchors=[((.87,.92),(.953,.985),(.98,.997)),((.565,.58),(.643,.73),(.68,.80)),((.286,.31),(.365,.475),(.423,.575))]
    linear=lambda x:x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4
    for channel,pairs in enumerate(anchors):
        for x,y in pairs: curve.mapping.curves[channel].points.new(linear(x),linear(y))
        for point in curve.mapping.curves[channel].points: point.handle_type='VECTOR'
    curve.mapping.update();links.new(source,curve.inputs['Color']);color=mix(color,curve.outputs[0],hair)
    def math_node(operation, a, b=None):
        n=nodes.new('ShaderNodeMath');n.operation=operation
        for i,value in enumerate((a,b)):
            if value is None: continue
            if isinstance(value,(int,float)): n.inputs[i].default_value=value
            else: links.new(value,n.inputs[i])
        return n.outputs[0]

    def oval(cx,cy,cz,sx,sy,sz):
        sub=nodes.new('ShaderNodeVectorMath');sub.operation='SUBTRACT'
        links.new(geometry.outputs['Position'],sub.inputs[0]);sub.inputs[1].default_value=(cx,cy,cz)
        div=nodes.new('ShaderNodeVectorMath');div.operation='DIVIDE';links.new(sub.outputs[0],div.inputs[0]);div.inputs[1].default_value=(sx,sy,sz)
        length=nodes.new('ShaderNodeVectorMath');length.operation='LENGTH';links.new(div.outputs[0],length.inputs[0])
        return ramp(length.outputs['Value'],.35,1.,1.,0.)

    # Paint the small mouth on the surface before deformation, with feathered edges.
    mouth_patch=oval(0,-.345,2.317,.105,.075,.034)
    color=mix(color,studio.srgb('#ffdacd'),mouth_patch)
    lip=oval(0,-.345,2.307,.058,.075,.011)
    color=mix(color,studio.srgb('#ecaba2'),multiply(lip,.28))
    x=xyz.outputs['X'];z=xyz.outputs['Z']
    curve_z=math_node('ADD',2.314,multiply(math_node('POWER',math_node('DIVIDE',x,.066),2.),.010))
    distance=math_node('ABSOLUTE',math_node('SUBTRACT',z,curve_z))
    line=multiply(ramp(distance,.0007,.0030,1.,0.),ramp(math_node('ABSOLUTE',x),.050,.072,1.,0.))
    line=multiply(line,ramp(xyz.outputs['Y'],-.32,-.29,1.,0.))
    color=mix(color,studio.srgb('#a86760'),multiply(line,.80))
    nose_patch=oval(0,-.37,2.374,.023,.075,.016)
    color=mix(color,studio.srgb('#ffd6c8'),multiply(nose_patch,.94))
    for cheek_x in (-.20,.20):
        cheek=oval(cheek_x,-.29,2.38,.095,.17,.055)
        color=mix(color,studio.srgb('#ed9c94'),multiply(multiply(cheek,skin),.10))
    blue=multiply(ramp(hsv.outputs[0],.52,.57),ramp(hsv.outputs[0],.71,.76,1.,0.))
    blue=multiply(blue,ramp(hsv.outputs[1],.3,.6))
    hue=nodes.new('ShaderNodeHueSaturation');hue.inputs['Hue'].default_value=.525;hue.inputs['Value'].default_value=.87
    links.new(source,hue.inputs['Color']);color=mix(color,hue.outputs[0],blue)
    links.new(color,bsdf.inputs['Base Color'])
    # The old mouth crease also exists in the tangent normal, not only its color.
    normal_map=next(n for n in nodes if n.type=='NORMAL_MAP')
    old_normal=normal_map.inputs['Color'].links[0].from_socket
    normal_mask=math_node('MAXIMUM',mouth_patch,nose_patch)
    corrected_normal=mix(old_normal,(.5,.5,1.,1.),normal_mask)
    corrected_normal.node.name='D1 corrected tangent normal'
    return mat,color

materials={'calibrated':corrected_material()}
mesh.materials.clear();mesh.materials.append(materials['calibrated'][0])
for face in mesh.polygons:face.material_index=0

# Bake the authored color shader, not the light rig, into a standard base-color atlas.
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 1
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
baked_images={}
for channel, space in [('base-color','sRGB'),('normal','Non-Color')]:
    atlas=bpy.data.images.new('D1 calibrated '+channel,width=2048,height=2048,alpha=False)
    atlas.colorspace_settings.name=space
    for mat,color in materials.values():
        nt=mat.node_tree
        output=color if channel=='base-color' else nt.nodes['D1 corrected tangent normal'].outputs[0]
        emission=nt.nodes.new('ShaderNodeEmission');nt.links.new(output,emission.inputs['Color'])
        nt.links.new(emission.outputs[0],nt.nodes['Material Output'].inputs['Surface'])
        target=tex(nt.nodes,atlas);nt.nodes.active=target
    scene.render.bake.margin=12
    bpy.ops.object.bake(type='EMIT')
    atlas.filepath_raw=str(OUTPUT/(channel+'.png'));atlas.file_format='PNG';atlas.save()
    baked_images[channel]=atlas
baked=baked_images['base-color']
for mat,_ in materials.values():
    nt=mat.node_tree
    nt.links.new(nt.nodes['Principled BSDF'].outputs['BSDF'],nt.nodes['Material Output'].inputs['Surface'])
    nt.links.new(tex(nt.nodes,baked).outputs['Color'],nt.nodes['Principled BSDF'].inputs['Base Color'])
    normal_map=next(n for n in nt.nodes if n.type=='NORMAL_MAP')
    nt.links.new(tex(nt.nodes,baked_images['normal']).outputs['Color'],normal_map.inputs['Color'])

# Region-specific normal strengths share one continuous color atlas.
base_material = materials['calibrated'][0]
materials = {}
mesh.materials.clear()
for region in ('detail','skin','hair','blue'):
    mat = base_material.copy(); mat.name = 'D1 refined ' + region
    normal = next(n for n in mat.node_tree.nodes if n.type == 'NORMAL_MAP')
    normal.inputs['Strength'].default_value = {'skin':.45,'hair':.65}.get(region,1.)
    mesh.materials.append(mat); materials[region] = (mat,None)
for face,region in zip(mesh.polygons,regions): face.material_index=list(materials).index(region)

from d1_hair_refinement import refine_hair
hair_report = refine_hair(meshes)
from d1_face_refinement import refine_face
face_report = refine_face(meshes)

after_uv = hashlib.sha256(np.array([tuple(v.uv) for v in uv]).tobytes()).hexdigest()
assert before_uv == after_uv, 'Refinement changed source UVs'
after_co = np.array([tuple(v.co) for v in mesh.vertices])
assert abs(after_co[:,2].max()-3.1)<.001 and abs(after_co[:,2].min())<.001
assert len(mesh.polygons)==19568 and len(mesh.vertices)==19529

scene.cycles.use_denoising = True; scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
scene.view_settings.view_transform = 'Standard'; scene.render.film_transparent = True
views = [('front','full'),('right','full'),('back','full'),('front','head'),('right','head')]
if '--quick' in sys.argv: views = [('front','head'),('front','full')]
for view, focus in views: studio.render(view, focus, OUTPUT / f'{view}-{focus}.png', 16)

# Keep a no-light diagnostic for separating base color from scene shading.
for mat, _ in materials.values():
    nt=mat.node_tree;em=nt.nodes.new('ShaderNodeEmission');nt.links.new(tex(nt.nodes,baked).outputs[0],em.inputs['Color']);nt.links.new(em.outputs[0],nt.nodes['Material Output'].inputs['Surface'])
studio.render('front','full',OUTPUT/'albedo-front-full.png',1)
for mat, _ in materials.values():
    nt=mat.node_tree;nt.links.new(nt.nodes['Principled BSDF'].outputs[0],nt.nodes['Material Output'].inputs['Surface'])

bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'d1-rodin-refined.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'d1-refined.blend'))
report={'reference':'exec-3b9e21f6-95d5-4f67-be0e-c374e655d709.png','regions':{r:regions.count(r) for r in set(regions)},'uvUnchanged':before_uv==after_uv,'vertices':len(mesh.vertices),'faces':len(mesh.polygons),'hair':hair_report,'face':face_report,'maxVertexDisplacement':float(np.linalg.norm(after_co-before_co,axis=1).max()),'height':float(after_co[:,2].max()-after_co[:,2].min()),'skinMix':.48,'normalStrength':{'skin':.45,'hair':.65,'detail':1.0},'notes':['No rig or facial animation.','Source files preserved.','Shared scene lighting unchanged.']}
(OUTPUT/'refinement-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('D1 refinement complete: UV unchanged,', hair_report['changedVertices'], 'hair vertices refined')
