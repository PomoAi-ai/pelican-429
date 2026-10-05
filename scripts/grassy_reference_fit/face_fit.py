"""Reference-constrained rounded face with embedded eyes and soft ear anatomy."""
import math

import bpy
from mathutils import Vector

from common import activate, assign, curve, ellipsoid, linear_color, mesh


EYE_X, EYE_Z = .161, 2.391
EYE_RX, EYE_RZ, EYE_DEPTH = .100, .105, .070
EYE_OFFSET = .073
PROFILE = [
    (2.078, .004, .007, .009, -.155),
    (2.088, .065, .100, .105, -.163),
    (2.108, .140, .175, .167, -.113),
    (2.155, .211, .219, .222, -.067),
    (2.215, .270, .283, .290, -.020),
    (2.275, .308, .335, .335, .010),
    (2.345, .322, .335, .365, .018),
    (2.425, .324, .330, .388, .027),
    (2.510, .323, .323, .395, .032),
    (2.600, .340, .291, .375, .033),
    (2.700, .305, .261, .333, .031),
    (2.800, .238, .207, .258, .027),
    (2.880, .137, .120, .150, .024),
    (2.930, .003, .003, .003, .021),
]


def _gauss(x, z, cx, cz, sx, sz):
    return math.exp(-((x - cx) / sx) ** 2 - ((z - cz) / sz) ** 2)


def _profile(z):
    for i, (a, b) in enumerate(zip(PROFILE, PROFILE[1:])):
        if z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            before, after = PROFILE[max(0, i - 1)], PROFILE[min(len(PROFILE) - 1, i + 2)]
            result = []
            for k in range(1, 5):
                m0 = (b[k] - before[k]) / (b[0] - before[0])
                m1 = (after[k] - a[k]) / (after[0] - a[0])
                result.append((2*t**3 - 3*t*t + 1)*a[k] + (t**3 - 2*t*t + t)*(b[0]-a[0])*m0
                              + (-2*t**3 + 3*t*t)*b[k] + (t**3 - t*t)*(b[0]-a[0])*m1)
            return result
    return PROFILE[-1][1:]


def _relief(x, z):
    bridge = .009 * _gauss(x, z, 0, 2.335, .032, .043)
    alae = sum(.014 * _gauss(x, z, s*.034, 2.288, .025, .023) for s in (-1, 1))
    radial = (x/.043)**2 + ((z-2.308)/.035)**2
    tip = .057*math.sqrt(max(0, 1-radial))-.010
    surround = bridge + alae
    blend = max(0, .020-abs(tip-surround))/.020
    nose = max(tip, surround) + .005*blend*blend
    nose -= .008 * _gauss(x, z, 0, 2.386, .039, .040)
    nose -= sum(.0025*_gauss(x, z, s*.025, 2.282, .008, .0045) for s in (-1, 1))
    cheeks = sum(.024 * _gauss(x, z, s*.226, 2.279, .113, .080) for s in (-1, 1))
    muzzle = .003 * _gauss(x, z, 0, 2.224, .116, .049)
    chin = .007 * _gauss(x, z, 0, 2.137, .137, .042)
    sockets = sum(.009 * _gauss(x, z, s*EYE_X, EYE_Z+.013, .108, .105) for s in (-1, 1))
    brow_pad = sum(.006*_gauss(x, z, s*.164, 2.503, .100, .036) for s in (-1, 1))
    under_eye = sum(.007*_gauss(x, z, s*.165, 2.287, .087, .026) for s in (-1, 1))
    return nose + cheeks + muzzle + chin + brow_pad + under_eye - sockets


def _face_y(x, z):
    width, front, _, center = _profile(z)
    c = math.sqrt(max(0, 1 - (x / width) ** 2))
    return center - front*c - _relief(x, z)*c**4


def colored_mesh(obj, colors, mat, layer_name):
    layer = obj.data.color_attributes.new(layer_name, 'FLOAT_COLOR', 'POINT')
    for entry, color in zip(layer.data, colors):
        entry.color = color
    node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    node.layer_name = layer_name
    mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])


def skin_color(point):
    x, y, z = point
    base, blush = linear_color('fac4a9'), linear_color('f29b8a')
    amount = sum(_gauss(x, z, s*.236, 2.293, .105, .070) for s in (-1, 1))*.48
    amount += .64*_gauss(x, z, 0, 2.310, .060, .040)
    amount *= min(1, max(0, (-y - .145) / .13))
    color = tuple(a*(1-amount) + b*amount for a, b in zip(base, blush))
    nostril = sum(.44*_gauss(x, z, s*.025, 2.282, .007, .0045) for s in (-1, 1))
    nostril *= min(1, max(0, (-y-.30)/.04))
    warm_shadow = linear_color('d18570')
    return tuple(a*(1-nostril)+b*nostril for a, b in zip(color, warm_shadow)) + (1,)


def _skin_materials(mats):
    plain = mats['skin'].copy()
    plain.name = 'Grassy warm skin'
    shader = plain.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*linear_color('fac4a9'), 1)
    shader.inputs['Roughness'].default_value = .46
    shader.inputs['Subsurface Weight'].default_value = .08
    shader.inputs['Subsurface Scale'].default_value = .035
    shader.inputs['Specular IOR Level'].default_value = .28
    plain.diffuse_color = shader.inputs['Base Color'].default_value
    tinted = plain.copy()
    tinted.name = 'Grassy continuous warm skin blush'
    return plain, tinted


def _skin_uv(obj):
    uv = obj.data.uv_layers.new(name='SkinSurface')
    for loop in obj.data.loops:
        point = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((point.x+.40)/.80, (point.z-2.0)/.95)


def _nose_roughness(head, material):
    # A continuous roughness field avoids a visible material island on the nose.
    size = 256
    texture = bpy.data.images.new('Grassy continuous nose skin roughness', size, size, alpha=False)
    texture.colorspace_settings.name = 'Non-Color'
    pixels = []
    for j in range(size):
        z = 2.0+.95*(j+.5)/size
        for i in range(size):
            x = -.40+.80*(i+.5)/size
            roughness = .46-.14*_gauss(x, z, 0, 2.312, .047, .034)
            pixels.extend((roughness, roughness, roughness, 1))
    texture.pixels = pixels
    texture.update()
    texture.pack()
    _skin_uv(head)
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.name = 'Continuous nose roughness'
    node.image = texture
    material.node_tree.links.new(node.outputs['Color'], material.node_tree.nodes['Principled BSDF'].inputs['Roughness'])


def sculpt_head(mats):
    plain, tinted = _skin_materials(mats)
    rows, sides = 208, 320
    verts, faces = [], []
    for j in range(rows + 1):
        z = PROFILE[0][0] + (PROFILE[-1][0]-PROFILE[0][0])*j/rows
        width, front, back, center = _profile(z)
        for i in range(sides):
            a = math.tau*i/sides
            c = math.cos(a)
            x = width*math.sin(a)
            y = center - (front if c >= 0 else back)*c
            if c > 0:
                y -= _relief(x, z)*c**4
            verts.append((x, y, z))
    for j in range(rows):
        for i in range(sides):
            a, b = j*sides+i, j*sides+(i+1)%sides
            faces.append((a, b, b+sides, a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple(rows*sides+i for i in range(sides))])
    head = mesh('Face • rounded cheeks small chin and sculpted nose', verts, faces, tinted)
    for side in (-1, 1):
        center_y = _face_y(side*EYE_X, EYE_Z)
        contour = [_aperture(side, math.tau*i/128) for i in range(128)]
        cutter_verts = [(side*EYE_X+x, y, EYE_Z+z)
                        for y in (-.75, center_y+.150) for x, z in contour]
        cutter_faces = [tuple(range(128)), tuple(reversed(range(128, 256)))]
        cutter_faces.extend((i, 128+i, 128+(i+1)%128, (i+1)%128) for i in range(128))
        tool = mesh('Eye socket tool', cutter_verts, cutter_faces, plain)
        activate([head])
        modifier = head.modifiers.new('Shallow anatomical eye socket', 'BOOLEAN')
        modifier.operation, modifier.object = 'DIFFERENCE', tool
        modifier.solver = 'MANIFOLD'
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(tool, do_unlink=True)
    assign(head, tinted)
    for polygon in head.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True
    colors = [skin_color(v.co) for v in head.data.vertices]
    colored_mesh(head, colors, tinted, 'SkinBlush')
    _nose_roughness(head, tinted)
    neck = ellipsoid('Neck • short soft transition', (0, .025, 2.036), (.104, .104, .112), plain)
    return head, neck, plain, tinted


def _globe_y(side, dx, dz):
    center = _face_y(side*EYE_X, EYE_Z) + EYE_OFFSET
    c = math.sqrt(max(0, 1-(dx/EYE_RX)**2-(dz/EYE_RZ)**2))
    return center + side*.50*dx + .12*dz - EYE_DEPTH*c


def _aperture(side, a, outer=0):
    sine, cosine = math.sin(a), math.cos(a)
    rx = .082 + outer*.020
    height = (.075 if sine >= 0 else .058) + outer*(.020 if sine >= 0 else .013)
    dx = rx*cosine
    dz = math.copysign(height*abs(sine)**.80, sine) + side*.004*cosine
    return dx, dz


def _lid(side, label, head_mat):
    verts, faces, colors = [], [], []
    segments, rows = 128, 8
    for j in range(rows + 1):
        t = j/rows
        ease = t*t*(3-2*t)
        for i in range(segments):
            a = math.tau*i/segments
            dx, dz = _aperture(side, a, t)
            ix, iz = _aperture(side, a)
            x, z = side*EYE_X+dx, EYE_Z+dz
            inner_y = _globe_y(side, ix, iz)-.0012
            outer_y = _face_y(x, z)-.0005
            # A shallow skin fold masks the globe instead of outlining a white disc.
            fold = (.0038 if math.sin(a) > 0 else .0012)*math.sin(math.pi*t)
            y = inner_y*(1-ease)+outer_y*ease-fold
            radial = (dx/EYE_RX)**2+(dz/EYE_RZ)**2
            if radial < 1:
                y = min(y, _globe_y(side, dx, dz)-.0010)
            verts.append((x, y, z))
            color = skin_color((x, y, z))
            edge = linear_color('e6a391')
            amount = (1-t)**3*.16
            colors.append(tuple(c*(1-amount)+e*amount for c, e in zip(color[:3], edge))+(1,))
    for j in range(rows):
        for i in range(segments):
            n = (i+1)%segments
            a, b = j*segments+i, j*segments+n
            faces.append((a, a+segments, b+segments, b))
    obj = mesh('Eyelids '+label+' • skin over inset globe', verts, faces, head_mat)
    colored_mesh(obj, colors, head_mat, 'SkinBlush')
    return obj


def _iris(side, label, mat, pupil=False):
    center_dz, radius = .005, .042 if pupil else .062
    verts = [(side*EYE_X, _globe_y(side, 0, center_dz)-(.0014 if pupil else .0007), EYE_Z+center_dz)]
    colors = [(*linear_color('24170f'), 1)]
    sides, rings = 128, 16
    for j in range(1, rings+1):
        r = j/rings
        for i in range(sides):
            a = math.tau*i/sides
            dx, dz = radius*r*math.cos(a), center_dz+radius*1.08*r*math.sin(a)
            y = _globe_y(side, dx, dz)-(.0014 if pupil else .0007)
            verts.append((side*EYE_X+dx, y, EYE_Z+dz))
            fiber = .5+.5*math.sin(a*63 + r*11 + .55*math.sin(a*31))
            amber = linear_color('865032')
            brown = linear_color('17100d')
            border = .15+.85*(1-r**14)
            amount = (.28+.24*fiber)*border*(.44-.35*math.sin(a))
            colors.append(tuple(c*(1-amount)+b*amount for c, b in zip(brown, amber))+(1,))
    faces = [(0, 1+i, 1+(i+1)%sides) for i in range(sides)]
    for j in range(rings-1):
        for i in range(sides):
            a, b = 1+j*sides+i, 1+j*sides+(i+1)%sides
            faces.append((a, a+sides, b+sides, b))
    obj = mesh(('Pupil ' if pupil else 'Iris ')+label+' • rounded glassy eye', verts, faces, mat)
    if not pupil:
        colored_mesh(obj, colors, mat, 'IrisFibers')
    return obj


def eyes_and_brows(mats, plain_skin, tinted):
    objects = []
    iris_mat = mats['iris'].copy()
    iris_mat.name = 'Grassy warm brown iris fibers'
    pupil_mat = mats['pupil'].copy()
    pupil_mat.name = 'Grassy deep brown glossy pupil'
    lid_mat = tinted.copy()
    lid_mat.name = 'Grassy warm thin eyelid skin'
    lid_mat.node_tree.nodes.remove(lid_mat.node_tree.nodes['Continuous nose roughness'])
    lid_mat.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value = .015
    for mat in (iris_mat, pupil_mat):
        shader = mat.node_tree.nodes['Principled BSDF']
        shader.inputs['Roughness'].default_value = .13
        shader.inputs['Specular IOR Level'].default_value = .30
        shader.inputs['Coat Weight'].default_value = .25
        shader.inputs['Coat Roughness'].default_value = .14
    for side, label in [(-1, 'L'), (1, 'R')]:
        cy = _face_y(side*EYE_X, EYE_Z)+EYE_OFFSET
        globe = ellipsoid('Eyeball '+label+' • embedded scleral globe',
                          (side*EYE_X, cy, EYE_Z), (EYE_RX, EYE_DEPTH, EYE_RZ), mats['white'], 80, 56)
        for vertex in globe.data.vertices:
            vertex.co.y += side*.50*vertex.co.x + .12*vertex.co.z
        globe.data.update()
        objects.extend([globe, _iris(side, label, iris_mat), _iris(side, label, pupil_mat, True),
                        _lid(side, label, lid_mat)])
        lash = []
        for i in range(65):
            a = math.pi*i/64
            dx, dz = _aperture(side, a)
            lash.append((side*EYE_X+dx, _globe_y(side, dx, dz)-.0020, EYE_Z+dz,
                         .30+.70*math.sin(a)**.5))
        objects.append(curve('Upper eyelash '+label+' • tapered lash root', lash, .0060, mats['lash'], 2))
        for index, (dx, dz, radius) in enumerate([(-.019, .029, .0085), (.023, -.017, .0032)]):
            y = _globe_y(side, dx, dz)-.0034
            objects.append(ellipsoid(f'Eye {label} soft catchlight {index}',
                                     (side*EYE_X+dx, y, EYE_Z+dz), (radius, .0022, radius), mats['white'], 32, 20))
        objects.extend(_brow(side, label, mats['brow']))
    return objects


def _brow(side, label, mat):
    verts, faces = [], []
    rows, sides = 40, 16
    for j in range(rows+1):
        t = j/rows
        x = side*(.069+.174*t)
        z = 2.509+.026*math.sin(math.pi*t)-.008*t
        width = .018*(.80+.20*math.sin(math.pi*t))*(1-t*t)**.55
        width *= min(1, t/.085)
        width *= 1+.035*math.sin(47*t)+.025*math.sin(81*t)
        for i in range(sides):
            a = math.tau*i/sides
            verts.append((x, _face_y(x, z)-.003 - .0045*math.sin(a)*math.sin(math.pi*t)**.4,
                          z+width*math.cos(a)))
    for j in range(rows):
        for i in range(sides):
            a, b = j*sides+i, j*sides+(i+1)%sides
            face = (a, b, b+sides, a+sides)
            faces.append(tuple(reversed(face)) if side < 0 else face)
    brow = mesh('Eyebrow '+label+' • full inner arch with tapered tail', verts, faces, mat)
    fibers = []
    for i in range(30):
        t = .08+.84*i/29+.005*math.sin(i*2.399)
        x = side*(.069+.174*t)
        z = 2.509+.026*math.sin(math.pi*t)-.008*t
        height = .014*(1-t*t)**.55*(.87+.13*math.sin(i*3.71))
        points = [(x-side*.002, _face_y(x, z)-.0075, z-height*.52, .30),
                  (x, _face_y(x, z)-.0080, z, .80),
                  (x+side*(.006+.0018*math.sin(i*1.7)), _face_y(x, z)-.0068, z+height*.72, .16)]
        fibers.append(curve('Brow '+label+f' individual fiber {i:02}', points, .00065, mat, 2))
    return [brow, *fibers]


def _ear(side, label, tinted):
    center = Vector((side*.358, .085, 2.329))
    across = Vector((.72, side*.69, 0))
    normal = Vector((side*.69, -.72, 0))
    verts, faces, colors = [tuple(center-normal*.022)], [], []
    colors.append((*linear_color('eea18b'), 1))
    rows, sides = 36, 112
    for j in range(1, rows+1):
        r = j/rows
        for i in range(sides):
            a = math.tau*i/sides
            v = .108*r*math.sin(a)
            u = .091*r*math.cos(a)*(.91+.09*math.sin(a))+side*.013*v/.104
            bowl = -.012*(1-r*r)
            helix = .023*math.exp(-((r-.80)/.18)**2)*(.76+.24*math.tanh(side*u/.025))
            lobe = .015*math.exp(-((a-1.5*math.pi)/.58)**2)*r**3
            ridge = .007+.023*((v+.007)/.080)**2
            antihelix = .018*math.exp(-((side*u-ridge)/.014)**2-((v-.010)/.071)**4)
            antihelix += .014*_gauss(u, v, -side*.012, .047, .019, .023)
            concha = -.014*_gauss(u, v, -side*.012, -.018, .024, .033)
            point = center + across*u + Vector((0, 0, v)) + normal*(bowl+helix+lobe+antihelix+concha)
            verts.append(tuple(point))
            base, flush = linear_color('fac4a9'), linear_color('ed9988')
            amount = .24+.45*(1-r)**.6+.15*_gauss(u, v, -side*.015, -.010, .027, .039)
            colors.append(tuple(c*(1-amount)+f*amount for c, f in zip(base, flush))+(1,))
    faces.extend((0, 1+i, 1+(i+1)%sides) for i in range(sides))
    for j in range(rows-1):
        for i in range(sides):
            a, b = 1+j*sides+i, 1+j*sides+(i+1)%sides
            faces.append((a, a+sides, b+sides, b))
    back = len(verts)
    verts.append(tuple(center-normal*.041))
    colors.append((*linear_color('fac4a9'), 1))
    last = 1+(rows-1)*sides
    faces.extend((back, last+(i+1)%sides, last+i) for i in range(sides))
    ear = mesh('Ear '+label+' • thick soft helix and sculpted concha', verts, faces, tinted)
    colored_mesh(ear, colors, tinted, 'SkinBlush')
    _skin_uv(ear)
    return ear, center, across, normal


def mouth_and_ears(mats, plain_skin, tinted):
    objects, smile, lip = [], [], []
    for i in range(49):
        t = i/48
        x = -.089+.178*t
        z = 2.240+.020*(x/.089)**2
        radius = .28+.72*math.sin(math.pi*t)**.55
        smile.append((x, _face_y(x, z)-.0018, z, radius))
        lip.append((x*.85, _face_y(x*.85, z-.0055)-.0016, z-.0055, radius*.70))
    objects.append(curve('Mouth • short warm lifted smile', smile, .0023, mats['lip'], 2))
    lip_mat = plain_skin.copy()
    lip_mat.name = 'Grassy soft lower lip'
    lip_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*linear_color('f3b7a0'), 1)
    objects.append(curve('Lower lip • subtle rounded ridge', lip, .0018, lip_mat, 2))
    for side, label in [(-1, 'L'), (1, 'R')]:
        ear, center, across, normal = _ear(side, label, tinted)
        objects.append(ear)
    return objects
