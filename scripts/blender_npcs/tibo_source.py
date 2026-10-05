"""Sculpt Tibo's front-reference silhouette as a complete, editable 3D mole NPC."""
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/characters/tibo/local-sculpt'
random.seed(11)


def material(name, color, roughness=.65, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


def mesh(name, vertices, faces, mat, subdiv=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    if subdiv:
        modifier = obj.modifiers.new('Sculpted continuous surface', 'SUBSURF')
        modifier.levels = subdiv
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def ellipsoid(name, center, scale, mat, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def smooth_path(points, steps=8):
    control = [Vector(points[0]), *[Vector(p) for p in points], Vector(points[-1])]
    result = []
    for k in range(1, len(control) - 2):
        a, b, c, d = control[k - 1:k + 3]
        for j in range(steps):
            t = j / steps
            result.append(.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t
                                 + (-a+3*b-3*c+d)*t*t*t))
    return result + [control[-1]]


def strand(name, points, width, depth, mat, taper=True, sides=8, steps=6):
    path = smooth_path(points, steps)
    vertices, faces = [], []
    for i, center in enumerate(path):
        t = i / (len(path)-1)
        tangent = (path[min(i+1, len(path)-1)] - path[max(0, i-1)]).normalized()
        u = tangent.cross(Vector((0, -1, 0))).normalized()
        if u.length < .1:
            u = tangent.cross(Vector((1, 0, 0))).normalized()
        v = tangent.cross(u).normalized()
        radius = (.12 + .88 * math.sin(math.pi*t)**.6) if taper else 1
        if taper and i == len(path)-1:
            radius = .015
        for j in range(sides):
            angle = j*math.tau/sides
            vertices.append(center + radius*(u*width*math.cos(angle) + v*depth*math.sin(angle)))
    for i in range(len(path)-1):
        for j in range(sides):
            a = i*sides+j
            b = i*sides+(j+1)%sides
            faces.append((a, b, b+sides, a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)), tuple((len(path)-1)*sides+j for j in range(sides))])
    return mesh(name, vertices, faces, mat)


def loft(name, rings, mat, sides=40):
    # Each ring is z, center x, center y, half-width, half-depth.
    vertices, faces = [], []
    for z, x, y, rx, ry in rings:
        for i in range(sides):
            a = math.tau*i/sides
            vertices.append((x+rx*math.cos(a), y+ry*math.sin(a), z))
    for j in range(len(rings)-1):
        for i in range(sides):
            a = j*sides+i
            b = j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces += [tuple(range(sides-1,-1,-1)), tuple((len(rings)-1)*sides+i for i in range(sides))]
    return mesh(name, vertices, faces, mat, 2)


def build_clothes(m):
    loft('Hoodie body', [(.86,0,0,.31,.20),(.88,0,0,.37,.235),(.96,0,0,.395,.255),
         (1.12,0,.008,.41,.255),(1.31,0,.02,.405,.24),(1.46,0,.01,.445,.225),
         (1.58,0,.025,.43,.225),(1.68,0,.045,.25,.185)], m['hoodie'])
    loft('Ribbed waist', [(.845,0,0,.345,.225),(.865,0,0,.37,.24),(.91,0,0,.38,.245),
         (.94,0,0,.365,.24)],m['rib'])
    for i in range(78):
        a = math.tau*i/78
        strand('Waist knit rib',[(.369*math.cos(a),.244*math.sin(a),.855),
                    (.379*math.cos(a),.249*math.sin(a),.90)],.0025,.0025,m['knit'],False,5,2)
    for s in (-1,1):
        loft('Sleeve',[(.90,s*.58,0,.105,.115),(.99,s*.59,.005,.13,.14),
             (1.12,s*.555,.012,.135,.145),(1.26,s*.505,.014,.143,.15),
             (1.43,s*.445,.02,.16,.17),(1.56,s*.37,.035,.145,.18)],m['hoodie'])
        loft('Wrist cuff',[(.83,s*.595,-.003,.10,.107),(.855,s*.595,0,.113,.119),
             (.93,s*.587,0,.118,.12),(.95,s*.584,0,.105,.11)],m['rib'])
        for k in range(18):
            a=math.tau*k/18
            strand('Cuff knit rib',[(s*.595+.113*math.cos(a),.122*math.sin(a),.851),
                   (s*.587+.118*math.cos(a),.122*math.sin(a),.929)],.0025,.0025,m['knit'],False,5,2)
        strand('Shoulder seam',[(s*.27,-.17,1.625),(s*.39,-.196,1.535),
                   (s*.46,-.172,1.40)],.004,.004,m['knit'],False,6,6)
        loft('Jeans leg',[(.17,s*.205,.012,.151,.138),(.20,s*.205,.015,.16,.15),
             (.29,s*.205,.012,.145,.146),(.44,s*.21,.022,.144,.156),
             (.59,s*.21,.029,.16,.16),(.74,s*.185,.027,.176,.174),
             (.87,s*.18,.023,.18,.18),(.90,s*.16,.023,.175,.18)],m['jeans'])
        strand('Denim outer seam',[(s*.344,-.05,.21),(s*.35,-.065,.43),
                   (s*.372,-.05,.70),(s*.355,-.055,.85)],.0026,.0026,m['stitch'],False,5,7)
        strand('Denim inner seam',[(s*.071,-.083,.21),(s*.077,-.103,.43),
                   (s*.046,-.099,.68)],.002,.002,m['stitch'],False,5,5)
        ellipsoid('White sneaker sole',(s*.215,-.086,.055),(.184,.269,.055),m['sole'])
        ellipsoid('White sneaker upper',(s*.215,-.095,.131),(.169,.245,.107),m['shoe'])
        ellipsoid('Shoe tongue',(s*.215,-.055,.203),(.093,.144,.032),m['shoe'])
        for k in range(4):
            y=-.20+k*.047
            z=.207+(k*.002)
            strand('Cotton shoe lace',[(s*.215-.074,y,z),(s*.215,y-.007,z+.017),
                   (s*.215+.074,y,z)],.005,.004,m['sole'],False,6,4)
        strand('Toe cap seam',[(s*.215-.13,-.245,.137),(s*.215,-.316,.138),
                   (s*.215+.13,-.245,.137)],.002,.002,m['seam'],False,6,7)
    # Pocket follows the rounded abdomen rather than floating on a front-facing plane.
    loft('Kangaroo pocket',[(.98,0,-.195,.27,.058),(1.015,0,-.206,.31,.075),
         (1.13,0,-.20,.29,.064),(1.195,0,-.21,.23,.045)],m['hoodie'])
    for s in (-1,1):
        strand('Pocket opening',[(s*.235,-.25,1.184),(s*.27,-.277,1.12),
                    (s*.291,-.274,1.049)],.004,.004,m['knit'],False)
    # Sculpted hood folds around the back of the neck; its open rim frames the face.
    loft('Hood back',[(1.44,0,.10,.24,.14),(1.54,0,.11,.34,.21),
         (1.70,0,.09,.315,.245),(1.83,0,.095,.275,.235),(1.87,0,.085,.23,.20)],m['hoodie'])
    strand('Hood padded rim',[(-.30,.10,1.82),(-.332,-.06,1.72),(-.24,-.224,1.605),
          (0,-.265,1.535),(.24,-.224,1.605),(.332,-.06,1.72),(.30,.10,1.82)],
          .047,.047,m['rib'],False,12,10)
    for s in (-1,1):
        strand('Hood drawcord',[(s*.147,-.278,1.581),(s*.15,-.274,1.48),
                (s*.16,-.282,1.365)],.008,.008,m['cord'],False,8,6)
        strand('Metal drawcord aglet',[(s*.16,-.282,1.365),(s*.16,-.282,1.325)],
                .009,.009,m['silver'],False,8,3)


def build_badge(m):
    ellipsoid('Reset enamel badge',( .265,-.238,1.397),(.064,.018,.064),m['silver'])
    ellipsoid('Reset badge ivory inset',(.265,-.254,1.397),(.054,.009,.054),m['sole'])
    points=[]
    for k in range(28):
        a=math.radians(45+305*k/27)
        points.append((.265+.033*math.cos(a),-.266,1.397+.033*math.sin(a)))
    strand('Reset circular arrow',points,.006,.005,m['mint'],False,6,2)
    mesh('Reset arrowhead',[(.285,-.272,1.441),(.310,-.272,1.417),(.28,-.272,1.415)],
         [(0,1,2)],m['mint'])


def build_hands(m):
    for s in (-1,1):
        ellipsoid('Furry digging palm',(s*.605,-.009,.768),(.122,.091,.125),m['fur'])
        for k in range(3):
            x=s*(.535+k*.067)
            ellipsoid('Mole fingertip',(x,-.033,.707),(.044,.062,.065),m['fur'])
            strand('Ivory digging claw',[(x,-.037,.727),(x+s*.019,-.077,.675),
                    (x+s*.038,-.070,.63)],.024,.019,m['claw'],True,10,7)
        strand('Mole thumb claw',[(s*.522,-.035,.765),(s*.491,-.085,.72),
                (s*.479,-.073,.688)],.026,.023,m['claw'],True,10,7)


def build_head(m):
    # A pear-shaped head gives the broad cheek / pointed chin balance of the reference.
    head=loft('Mole head',[(1.73,0,.015,.19,.16),(1.78,0,0,.275,.20),
         (1.89,0,-.008,.36,.265),(2.02,0,.006,.428,.292),
         (2.20,0,.025,.436,.304),(2.36,0,.033,.40,.282),
         (2.47,0,.051,.31,.25),(2.52,0,.065,.16,.16)],m['fur'])
    head.data.materials.append(m['beard'])
    for polygon in head.data.polygons:
        p=polygon.center
        if p.z<1.915 or (p.z<2.01 and abs(p.x)>.24):
            polygon.material_index=1
    for s in (-1,1):
        ellipsoid('Small mole ear',(s*.426,.006,2.116),(.074,.041,.095),m['fur'])
        ellipsoid('Ear inner skin',(s*.453,-.029,2.12),(.042,.012,.062),m['nose'])
    # The mouth is a curved smiling recess, surrounded by the short furry muzzle.
    verts=[]
    n=40
    for lower in (False,True):
        for k in range(n+1):
            x=-.235+.47*k/n
            t=x/.235
            z=1.967+.084*t*t if not lower else 1.878+.169*t*t
            y=-.296+.088*t*t
            verts.append((x,y,z))
    faces=[(k,k+1,n+2+k,n+1+k) for k in range(n)]
    mesh('Warm smiling mouth',verts,faces,m['mouth'])
    strand('Lower smile lip',[(-.235,-.218,2.045),(-.16,-.286,1.952),
           (0,-.318,1.897),(.16,-.286,1.952),(.235,-.218,2.045)],.014,.010,m['lip'],False,8,8)
    for k in range(9):
        x=(k-4)*.042
        t=x/.235
        z=1.968+.084*t*t-.014
        tooth=ellipsoid('Friendly smile tooth',(x,-.305+.088*t*t,z),(.022,.008,.024),m['teeth'],20,12)
        tooth.rotation_euler.y=-x*.85
    for s in (-1,1):
        strand('Mustache',[(0,-.34,2.052),(s*.08,-.318,2.037),
                  (s*.17,-.271,2.063),(s*.225,-.221,2.083)],.022,.012,m['beard'],True,10,9)
        ellipsoid('Muzzle pad',(s*.063,-.278,2.076),(.10,.055,.06),m['fur'])
    ellipsoid('Pink mole nose',(0,-.365,2.124),(.091,.070,.061),m['nose'])
    for s in (-1,1):
        ellipsoid('Nostril',(s*.052,-.416,2.108),(.017,.006,.011),m['nostril'],20,12)
    strand('Nose philtrum',[(0,-.420,2.114),(0,-.409,2.087)],.0025,.002,m['lip'],False,6,3)
    # Shallow eyes and distinct lids prevent the generic bulging-sphere look.
    for s in (-1,1):
        x=s*.16
        ellipsoid('Eye white',(x,-.267,2.226),(.091,.024,.055),m['white'])
        ellipsoid('Brown iris',(x,-.289,2.226),(.037,.008,.043),m['iris'])
        ellipsoid('Iris inner',(x,-.297,2.226),(.026,.004,.032),m['iris_inner'],32,20)
        ellipsoid('Pupil',(x,-.301,2.227),(.019,.003,.026),m['pupil'],32,20)
        ellipsoid('Eye catchlight',(x-.013,-.305,2.244),(.007,.002,.009),m['white'],20,12)
        strand('Upper eyelid',[(x-.091,-.253,2.223),(x-.046,-.284,2.266),
              (x+.020,-.287,2.279),(x+.089,-.253,2.240)],.006,.005,m['beard'],False,8,8)
        strand('Lower eyelid',[(x-.091,-.253,2.223),(x,-.289,2.176),
              (x+.089,-.253,2.240)],.006,.005,m['lid'],False,8,9)
        strand('Human expressive eyebrow',[(s*.061,-.263,2.321),(s*.137,-.276,2.350),
              (s*.218,-.25,2.339),(s*.277,-.219,2.304)],.025,.012,m['hair'],True,10,9)
        for k in range(3):
            start=(s*(.117+.012*k),-.349,2.07-.018*k)
            end=(s*(.385+.03*k),-.28,2.067-.05*k)
            strand('Mole whisker',[start,(s*.275,-.344,2.08-.035*k),end],
                   .0014,.0014,m['whisker'],True,5,7)


def build_hair(m):
    # Hair is a solid cap with overlapping tapered locks, readable from every angle.
    verts,faces=[],[]
    rows,cols=18,64
    for j in range(rows+1):
        t=j/rows
        for k in range(cols):
            a=math.tau*k/cols
            front=max(0,-math.sin(a))
            edge=1.78-.78*front
            phi=.02+t*edge
            verts.append((.455*math.sin(phi)*math.cos(a),
                          .055+.329*math.sin(phi)*math.sin(a),2.246+.386*math.cos(phi)))
    for j in range(rows):
        for k in range(cols):
            a=j*cols+k;b=j*cols+(k+1)%cols
            faces.append((a,b,b+cols,a+cols))
    mesh('Full swept human hair cap',verts,faces,m['hair'])
    for k in range(12):
        t=k/11
        # Side part is on image right. Broad fringe sweeps diagonally over the forehead.
        pts=[(.17+.16*t,-.035-.12*t,2.625-.085*t),
             (.03+.16*t,-.25-.055*t,2.615-.09*t),
             (-.245+.36*t,-.319-.026*t,2.46-.05*t),
             (-.415+.38*t,-.17-.13*t,2.214+.19*t)]
        mat=m['hair_light'] if k%3==0 else m['hair']
        strand('Swept side fringe',pts,.039+.014*t,.029,mat,True,12,12)
    for k in range(11):
        t=k/10
        pts=[(.255,-.05+.03*t,2.589-.036*t),(.38,-.08+.17*t,2.49),
             (.435,-.062+.17*t,2.325),(.428,-.052+.16*t,2.197)]
        strand('Short part-side locks',pts,.039,.024,m['hair_light'] if k%4==0 else m['hair'],True,10,8)
    for k in range(24):
        a=math.pi*k/23
        x=.36*math.cos(a)
        y=.08+.27*math.sin(a)
        strand('Back swept hair locks',[(x*.48,y*.62,2.585),(x*.91,y,2.48),
              (x*1.18,y*1.06,2.29),(x*1.10,y*.92,2.118)],.043,.025,
              m['hair_light'] if k%5==0 else m['hair'],True,8,7)


def render_preview():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=900;scene.render.resolution_y=1200
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Tibo Studio')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.38,.44,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    floor=material('Studio floor',(.42,.44,.46))
    bpy.ops.mesh.primitive_plane_add(size=200)
    bpy.context.object.name='Studio floor';bpy.context.object.data.materials.append(floor)
    def aim(obj,p):obj.rotation_euler=(Vector(p)-obj.location).to_track_quat('-Z','Y').to_euler()
    for position,power,size in [((-3,-4,5),600,4),((3,-2,3),350,3),((1,3,4),700,3)]:
        bpy.ops.object.light_add(type='AREA',location=position)
        bpy.context.object.data.energy=power;bpy.context.object.data.shape='DISK'
        bpy.context.object.data.size=size;aim(bpy.context.object,(0,0,1.4))
    bpy.ops.object.camera_add(location=(0,-7,1.35))
    camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=3.03
    aim(camera,(0,0,1.32));scene.camera=camera
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(OUT/'source-front.png');bpy.ops.render.render(write_still=True)
    camera.location=(3.7,-6,2.9);aim(camera,(0,0,1.32))
    scene.render.filepath=str(OUT/'source-hero.png');bpy.ops.render.render(write_still=True)


def label_parts():
    arms={'Sleeve','Wrist cuff','Cuff knit rib','Shoulder seam','Furry digging palm',
          'Mole fingertip','Ivory digging claw','Mole thumb claw'}
    legs={'Jeans leg','Denim outer seam','Denim inner seam','White sneaker sole',
          'White sneaker upper','Shoe tongue','Cotton shoe lace','Toe cap seam'}
    torso={'Hoodie body','Ribbed waist','Waist knit rib','Kangaroo pocket',
           'Pocket opening','Hood back','Hood padded rim','Hood drawcord',
           'Metal drawcord aglet','Reset enamel badge','Reset badge ivory inset',
           'Reset circular arrow','Reset arrowhead'}
    for obj in bpy.context.scene.objects:
        name=obj.name.split('.')[0]
        x=sum((obj.matrix_world @ v.co).x for v in obj.data.vertices)/len(obj.data.vertices)
        side='L' if x>0 else 'R'
        obj['npc_part']=f'arm.{side}' if name in arms else f'leg.{side}' if name in legs else 'torso' if name in torso else 'head'


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    colors={
        'fur':(.31,.19,.117),'muzzle':(.395,.262,.164),'beard':(.15,.085,.048),
        'nose':(.64,.265,.222),'nostril':(.17,.038,.032),'lip':(.37,.102,.075),
        'mouth':(.065,.011,.011),'teeth':(.88,.83,.71),'white':(.92,.90,.82),
        'iris':(.30,.125,.035),'iris_inner':(.11,.045,.017),'pupil':(.009,.005,.004),
        'lid':(.285,.142,.075),'hair':(.052,.023,.014),'hair_light':(.095,.048,.029),
        'hair_mid':(.128,.067,.038),'hoodie':(.014,.018,.024),'rib':(.019,.022,.028),
        'knit':(.030,.034,.041),'cord':(.013,.013,.017),'jeans':(.035,.103,.235),
        'stitch':(.34,.187,.058),'shoe':(.80,.78,.71),'sole':(.92,.90,.82),
        'seam':(.52,.49,.43),'claw':(.73,.50,.27),'silver':(.57,.60,.59),
        'mint':(.026,.56,.41),'whisker':(.68,.57,.41),
    }
    m={name:material(name,color,.76 if name in ('fur','hoodie','jeans','hair') else .5)
       for name,color in colors.items()}
    m['silver'].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.65
    build_clothes(m);build_badge(m);build_hands(m);build_head(m);build_hair(m)
    label_parts()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/'source.glb'),export_format='GLB',
                             use_selection=True,export_animations=False,export_yup=True,export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source.blend'))
    render_preview()


if __name__=='__main__':
    main()
