"""Editable ceramic flight equipment fitted to the retained Rodin surface.

All coordinates use the character's rest space: -Y front, +Z up. The
equipment is rigidly attached to the existing bones, retaining body UVs.
"""
import math

import bpy
from mathutils import Matrix, Vector

from equipment_keyboard import build_keyboard


def material(name, color, metallic=0, roughness=.3, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    mat.diffuse_color = (*color, 1)
    return mat


def finish(obj, mat, parts, parent=None):
    obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    if parent:
        obj.parent = parent
    parts.append(obj)
    return obj


def rounded(name, location, size, mat, parts, parent=None, radius=.025, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new('Manufactured curved edges', 'BEVEL')
    bevel.width, bevel.segments = radius, segments
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    normal = obj.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    bpy.ops.object.modifier_apply(modifier=normal.name)
    return finish(obj, mat, parts, parent)


def ring(name, location, major, minor, mat, parts, parent=None, rotation=None, segments=32):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=8,
        location=location, major_radius=major, minor_radius=minor)
    obj = bpy.context.object
    obj.name = name
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, mat, parts, parent)


def shell(name, levels, mat, parts, parent, segments, start=0, end=math.tau, thickness=.014):
    """A closed curved shell with rounded shoulders, not a scaled cylinder."""
    vertices, faces = [], []
    for inset in (0, thickness):
        for z, rx, ry in levels:
            for i in range(segments+1):
                angle = start+(end-start)*i/segments
                vertices.append(((rx-inset)*math.cos(angle), (ry-inset)*math.sin(angle), z))
    stride = segments+1
    half = stride*len(levels)
    for side in range(2):
        for j in range(len(levels)-1):
            for i in range(segments):
                a = side*half+j*stride+i
                face = (a, a+1, a+1+stride, a+stride)
                faces.append(face if side == 0 else face[::-1])
    for j in (0,len(levels)-1):
        for i in range(segments):
            a = j*stride+i
            faces.append((a,a+half,a+half+1,a+1))
    for i in (0,segments):
        for j in range(len(levels)-1):
            a = j*stride+i
            faces.append((a,a+stride,a+stride+half,a+half))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, mat, parts, parent)


def ribbon(name, points, width, depth, mat, parts, parent, segments):
    """Flattened Bezier sweep for fitted harness webbing and ceramic trims."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.resolution_u = '3D', segments
    curve.bevel_depth, curve.bevel_resolution = depth, 2
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for point, coordinate in zip(spline.bezier_points,points):
        point.co = coordinate
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    # The harness runs in YZ; flatten the sweep in its thickness direction.
    center = sum(p[0] for p in points)/len(points)
    for vertex in obj.data.vertices:
        vertex.co.x = center+(vertex.co.x-center)*(width/(2*depth))
    return finish(obj,mat,parts,parent)


def empty(name, location, parts, parent=None):
    obj = bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.parent, obj.location = parent, location
    parts.append(obj)
    return obj


def attach(root, rig, bone_name, world):
    root.parent, root.parent_type, root.parent_bone = rig, 'BONE', bone_name
    # Blender's BONE parent origin is at the bone tail.
    bone = rig.data.bones[bone_name]
    parent_world = rig.matrix_world @ bone.matrix_local @ Matrix.Translation((0,bone.length,0))
    root.matrix_parent_inverse = parent_world.inverted()
    root.matrix_basis = world


def build_equipment(rig,tier):
    parts = []
    detail = {'detailed':(64,5), 'game':(32,3), 'light':(20,2)}[tier]
    radial, bevel = detail
    ceramic = material('Flight / pearl ceramic',(.72,.78,.82),.32,.24)
    graphite = material('Flight / graphite titanium',(.025,.041,.052),.7,.3)
    titanium = material('Flight / brushed titanium',(.23,.3,.34),.8,.26)
    rubber = material('Flight / woven harness',(.018,.026,.031),0,.78)
    cyan = material('Flight / ion cyan',(.015,.62,1),.35,.2,2.8)
    dark = material('Flight / deep nozzle',(.006,.014,.019),.45,.37)

    for side,sign in (('L',1),('R',-1)):
        wrist = empty('FlightCuff_'+side,(0,0,0),parts)
        a = Vector((sign*.475,-.07,1.50))
        b = Vector((sign*.575,-.085,1.20))
        center = a.lerp(b,.50)
        direction = (a-b).normalized()
        orientation = Vector((0,0,1)).rotation_difference(direction).to_matrix().to_4x4()
        shell('Cuff inner sleeve '+side,[(-.155,.117,.115),(-.14,.126,.12),(.14,.142,.128),(.16,.134,.121)],
            rubber,parts,wrist,radial)
        shell('Cuff titanium chassis '+side,[(-.145,.136,.126),(-.12,.149,.142),(.115,.161,.15),(.15,.149,.138)],
            graphite,parts,wrist,radial)
        # Two shells leave visible machined seams on either side of the arm.
        for panel,(start,end) in enumerate(((-math.pi+.14,-.12),(.14,math.pi-.12))):
            shell('Cuff ceramic panel '+side+str(panel),[(-.117,.15,.144),(-.09,.168,.156),(.09,.177,.163),(.13,.157,.146)],
                ceramic,parts,wrist,radial//2,start,end)
        for z,radius in ((-.135,.139),(.143,.147)):
            trim=ring('Cuff cyan seal '+side,(0,0,z),radius,.008,cyan,parts,wrist,segments=radial)
            trim.scale.y=.94
        # Wrist-side exhaust bezel and dark annular throat remain open around the sleeve.
        ring('Cuff nozzle bezel '+side,(0,0,-.16),.135,.021,titanium,parts,wrist,segments=radial)
        ring('Cuff nozzle throat '+side,(0,0,-.17),.126,.016,dark,parts,wrist,segments=radial)
        ring('Cuff ion emitter '+side,(0,0,-.183),.127,.007,cyan,parts,wrist,segments=radial)
        for s in (-1,1):
            plate=rounded('Cuff side stabilizer '+side+str(s),(s*.181,0,.015),(.036,.16,.23),ceramic,parts,wrist,.016,bevel)
            plate.rotation_euler.y=s*-.20
            rounded('Cuff fin inlay '+side+str(s),(s*.202,-.013,.02),(.009,.09,.13),graphite,parts,wrist,.004,bevel)
        rounded('Cuff face inset '+side,(0,-.166,.037),(.09,.015,.105),graphite,parts,wrist,.014,bevel)
        rounded('Cuff face power '+side,(0,-.176,.037),(.013,.006,.072),cyan,parts,wrist,.004,bevel)
        if tier != 'light':
            for x in (-.087,.087):
                for z in (-.06,.085):
                    screw=rounded('Cuff recessed fastener '+side,(x,-.139,z),(.013,.007,.013),titanium,parts,wrist,.004,2)
        outlet=(sign*.178,0,-.157)
        ring('Cuff outboard thrust collar '+side,outlet,.047,.012,titanium,parts,wrist,segments=radial)
        ring('Cuff outboard thrust light '+side,(outlet[0],0,-.173),.041,.007,cyan,parts,wrist,segments=radial)
        empty('fx_wrist_'+side,(outlet[0],0,-.177),parts,wrist)
        attach(wrist,rig,'forearm.'+side,Matrix.Translation(center)@orientation)

    pack = empty('FlightHarness',(0,0,0),parts)
    rounded('Backpack contoured chassis',(0,.248,1.68),(.47,.17,.54),graphite,parts,pack,.075,bevel)
    rounded('Backpack ceramic cover',(0,.336,1.68),(.40,.065,.47),ceramic,parts,pack,.06,bevel)
    rounded('Backpack magnetic keyboard dock',(0,.383,1.64),(.19,.035,.22),titanium,parts,pack,.035,bevel)
    for sign in (-1,1):
        rounded('Backpack light rail',(sign*.176,.374,1.69),(.012,.012,.26),cyan,parts,pack,.006,bevel)
        for z in (1.52,1.57,1.62):
            rounded('Backpack vent',(sign*.135,.374,z),(.055,.008,.012),dark,parts,pack,.005,bevel)
        points=[(sign*.23,.27,1.45),(sign*.225,.275,1.84),(sign*.245,.12,1.96),
                (sign*.255,-.11,1.93),(sign*.235,-.247,1.78),(sign*.23,-.255,1.45)]
        ribbon('Padded shoulder harness',points,.078,.02,rubber,parts,pack,8 if tier!='light' else 5)
        # White shoulder covers preserve a fabric gap at the chest and abdomen.
        ribbon('Ceramic shoulder bridge',points[1:5],.048,.012,ceramic,parts,pack,8 if tier!='light' else 5)
        rounded('Harness adjustment clasp',(sign*.237,-.266,1.66),(.089,.028,.059),titanium,parts,pack,.01,bevel)
        rounded('Harness clasp insert',(sign*.237,-.283,1.66),(.057,.008,.027),rubber,parts,pack,.007,bevel)
    rounded('Chest webbing bridge',(0,-.268,1.76),(.46,.027,.043),rubber,parts,pack,.015,bevel)
    rounded('Chest quick release buckle',(0,-.294,1.76),(.14,.043,.075),ceramic,parts,pack,.022,bevel)
    rounded('Chest cyan status',(0,-.32,1.76),(.082,.009,.021),cyan,parts,pack,.009,bevel)
    # Two compact waist pods keep the back clear for the diagonal keyboard.
    for side,sign in (('L',1),('R',-1)):
        pod=empty('FlightPod_'+side,(sign*.35,.27,1.38),parts,pack)
        shell('Pod graphite core '+side,[(-.15,.082,.088),(-.12,.115,.117),(.12,.12,.12),(.17,.078,.085)],graphite,parts,pod,radial)
        shell('Pod ceramic cowl '+side,[(-.10,.119,.12),(-.06,.133,.132),(.10,.134,.131),(.15,.096,.102)],ceramic,parts,pod,radial)
        ring('Pod nozzle collar '+side,(0,.035,-.128),.09,.022,titanium,parts,pod,(.30,0,0),radial)
        ring('Pod thrust light '+side,(0,.042,-.151),.083,.010,cyan,parts,pod,(.30,0,0),radial)
        bpy.ops.mesh.primitive_cylinder_add(vertices=radial,radius=.074,depth=.012,location=(0,.039,-.14))
        throat=finish(bpy.context.object,dark,parts,pod)
        throat.name='Pod recessed nozzle '+side
        throat.rotation_euler.x=.30
        lens=ring('Pod outer cyan halo '+side,(sign*.124,0,.015),.077,.011,cyan,parts,pod,(0,math.pi/2,0),radial)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=radial,ring_count=12,location=(sign*.12,0,.015))
        lens=finish(bpy.context.object,graphite,parts,pod)
        lens.name='Pod outer lens '+side
        lens.scale=(.032,.065,.065)
        empty('fx_pack_'+side,(0,.047,-.163),parts,pod).rotation_euler.x=.30
    attach(pack,rig,'chest',Matrix.Identity(4))
    parts.extend(build_keyboard(tier))
    bpy.context.view_layer.update()
    return parts
