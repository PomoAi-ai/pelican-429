"""Swept, overlapping solid hair locks for the independent Grassy sculpture."""
import math
import random
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

from common import mesh


CENTER = Vector((0, .045, 2.49))


def _surface(angle, latitude, lift=0):
    nape = max(0, -math.cos(angle))**.5 * max(0, latitude-1.52)**1.2
    ear_clearance = max(0, latitude-1.47)**.8 * max(0, 1-abs(math.cos(angle))/.58)
    return Vector(((.460 + lift)*(1-.43*nape-.62*ear_clearance) * math.sin(latitude) * math.sin(angle),
                   .045 - (.400 + lift)*(1-.22*nape) * math.sin(latitude) * math.cos(angle),
                   2.49 + (.540 + lift) * math.cos(latitude)))


def _bezier(points, t):
    a, b, c, d = points
    q = 1 - t
    position = q**3 * a + 3 * q*q*t * b + 3 * q*t*t * c + t**3 * d
    tangent = 3 * q*q * (b-a) + 6*q*t * (c-b) + 3*t*t * (d-c)
    return position, tangent.normalized()


def _lock(name, points, width, depth, mat, phase, root_width=.11, sampler=None, root_spread=.18):
    """The shallow channels follow the curl and taper away with its tip."""
    points = [Vector(p) for p in points]
    points[0] = CENTER + .88 * (points[0] - CENTER)
    steps, sides = 28, 40
    ring = sides + 1
    verts, faces, uvs = [], [], []
    for i in range(steps):
        t = i / steps
        position, tangent = _bezier(points, t) if sampler is None else sampler(t)
        radial = (position - CENTER).normalized()
        across = radial.cross(tangent).normalized()
        outward = tangent.cross(across).normalized()
        twist = .14*math.sin(math.pi*t)*math.sin(phase)+.08*t
        across, outward = (across*math.cos(twist)+outward*math.sin(twist),
                           outward*math.cos(twist)-across*math.sin(twist))
        root_blend = root_width+(1-root_width)*min(1, t/root_spread)**1.2
        profile = root_blend * (.90+.16*math.sin(math.pi*t)) * (1-t)**.76
        thickness = root_blend * (.76+.24*math.sin(math.pi*t)) * (1-t)**.80
        for j in range(ring):
            a = 2*math.pi*j/sides
            # Channels are sculpted relief, so glTF preserves them without a shader.
            grooves = 1 + .004*math.cos(5*a + phase + .22*t)
            channel_phase = 2.2*math.pi*math.cos(a)+phase+.75*t+.80*math.sin(2*a+phase+.8*t)
            channel = .0007*math.cos(channel_phase)
            channel *= max(0, math.sin(a))**2 * profile
            asymmetric = math.cos(a)+.032*math.cos(2*a)*math.sin(math.pi*t+phase)
            cross = across * (asymmetric * width * profile)
            relief = outward * (math.sin(a) * depth * thickness * grooves *
                                 (1+.11*math.cos(a)*math.sin(phase+3*t)) + channel)
            verts.append(tuple(position + cross + relief))
            uvs.append((j/sides, t))
        if i:
            previous, current = (i-1)*ring, i*ring
            for j in range(sides):
                k = j+1
                faces.append((previous+j, previous+k, current+k, current+j))
    faces.append(tuple(range(sides-1, -1, -1)))
    tip = len(verts)
    verts.append(tuple(points[-1]))
    uvs.append((.5, 1))
    last = (steps-1)*ring
    for j in range(sides):
        faces.append((last+j, last+j+1, tip))
    return mesh(name, verts, faces, mat, uvs)


def _cap(mat):
    verts, faces, uvs = [tuple(_surface(0, 0))], [], [(.5, 0)]
    around, rows = 80, 24
    ring = around+1
    for row in range(1, rows+1):
        for j in range(ring):
            angle = 2*math.pi*j/around
            limit = .95 + .54*abs(math.sin(angle))**1.5
            limit += 1.27*max(0, -math.cos(angle))**1.15
            limit += .024*math.sin(13*angle)*max(0, -math.cos(angle))
            latitude = limit * row/rows
            verts.append(tuple(_surface(angle, latitude, -.008)))
            uvs.append((j/around, row/rows))
    for j in range(around):
        faces.append((0, 1+j, 1+j+1))
    for row in range(rows-1):
        start, next_row = 1+row*ring, 1+(row+1)*ring
        for j in range(around):
            k = j+1
            faces.append((start+j, next_row+j, next_row+k, start+k))
    return mesh('Hair_continuous_undercoat', verts, faces, mat, uvs)


def _swept_lock(name, angle, start, end, turn, width, depth, lift, mat, phase,
                root_width=.11, burial=.012, end_lift=.009, emerge_at=.17):
    points = [_surface(angle, start, -burial),
              _surface(angle+turn*.28, start+(end-start)*.30, lift*.95),
              _surface(angle+turn*.78, start+(end-start)*.78, lift*.80),
              _surface(angle+turn, end, end_lift)]
    def position(t):
        progress = t+.10*math.sin(math.pi*t)
        sweep_angle = angle+turn*(t+.13*math.sin(math.pi*t))
        latitude = start+(end-start)*progress
        emergence = min(1, t/emerge_at)
        emergence = emergence*emergence*(3-2*emergence)
        outward = (end_lift*t**1.7+lift*math.sin(math.pi*t)**.75)*emergence-burial*(1-emergence)
        return _surface(sweep_angle, latitude, outward)

    def sampler(t):
        p = position(t)
        tangent = position(min(1, t+.0001))-position(max(0, t-.0001))
        return p, tangent.normalized()

    return _lock(name, points, width, depth, mat, phase, root_width, sampler, .40)


def _fringe(materials, rng):
    # Different falling arcs overlap at the part instead of making one broad fan.
    paths = [
        (((-.025,-.245,2.970),(-.130,-.295,3.005),(-.270,-.241,2.996),(-.360,-.155,2.942)), .043,.062),
        (((-.106,-.276,2.912),(-.239,-.320,2.958),(-.405,-.245,2.926),(-.464,-.092,2.863)), .047,.059),
        (((-.091,-.325,2.838),(-.205,-.370,2.872),(-.353,-.310,2.797),(-.410,-.158,2.720)), .052,.067),
        (((.088,-.259,2.888),(-.130,-.382,2.888),(-.301,-.377,2.703),(-.357,-.279,2.551)), .060,.058),
        (((.124,-.258,2.884),(-.030,-.404,2.871),(-.221,-.415,2.671),(-.249,-.307,2.502)), .067,.066),
        (((.110,-.278,2.870),(.044,-.419,2.845),(-.122,-.438,2.663),(-.145,-.351,2.568)), .061,.061),
        (((.160,-.250,2.898),(.152,-.389,2.840),(.068,-.431,2.670),(.012,-.371,2.573)), .068,.064),
        (((.178,-.241,2.904),(.242,-.381,2.858),(.212,-.405,2.693),(.136,-.346,2.594)), .058,.059),
        (((.201,-.220,2.909),(.351,-.310,2.850),(.360,-.330,2.695),(.318,-.221,2.559)), .063,.062),
        (((.200,-.195,2.919),(.378,-.236,2.913),(.456,-.151,2.850),(.480,-.062,2.815)), .065,.061),
        (((.250,-.213,2.882),(.402,-.236,2.815),(.462,-.126,2.733),(.459,-.014,2.672)), .049,.049),
        (((-.180,-.253,2.869),(-.334,-.246,2.849),(-.457,-.176,2.746),(-.476,-.057,2.677)), .054,.057),
        (((-.267,-.238,2.778),(-.383,-.244,2.714),(-.425,-.182,2.572),(-.353,-.125,2.391)), .048,.046),
        (((.290,-.210,2.780),(.398,-.202,2.680),(.414,-.130,2.523),(.337,-.100,2.385)), .046,.045),
        (((-.035,-.306,2.857),(-.201,-.365,2.806),(-.335,-.316,2.670),(-.401,-.190,2.621)), .035,.041),
        (((.226,-.273,2.834),(.313,-.311,2.752),(.326,-.276,2.637),(.286,-.182,2.542)), .033,.042),
        (((.116,-.222,2.922),(.046,-.305,3.022),(-.195,-.272,3.046),(-.343,-.160,2.981)), .071,.049),
        (((.120,-.216,2.932),(.205,-.294,3.008),(.338,-.215,3.003),(.434,-.089,2.903)), .063,.046),
    ]
    objects = []
    for i, (path, width, depth) in enumerate(paths):
        fitted = []
        for j, (x, y, z) in enumerate(path):
            if j >= 2 and abs(x) < .385 and z < 2.85:
                forehead = .045-.345*math.sqrt(max(0, 1-(x/.425)**2-((z-2.50)/.43)**2))
                y = forehead-.030 if j == 3 else y*.60+(forehead-.046)*.40
            fitted.append((x,y,z))
        key = 'hair_light' if i in (1,5,9) else 'hair'
        objects.append(_lock('Hair_falling_soft_arc_%02d' % i, fitted, width, depth,
                             materials[key], rng.uniform(0,6), .12, root_spread=.28))
    return objects


def _crown(materials, rng):
    paths = [
        (((.112,-.150,2.954),(.136,-.155,3.075),(.075,-.095,3.114),(-.060,-.066,3.073)), .053,.049),
        (((.084,-.093,2.959),(-.058,-.083,3.030),(-.209,-.024,3.088),(-.303,.032,3.043)), .055,.056),
        (((.174,-.100,2.958),(.278,-.102,3.045),(.370,-.011,3.037),(.416,.070,2.966)), .057,.052),
        (((.124,.028,2.948),(.210,.085,3.015),(.156,.165,3.039),(.043,.203,3.020)), .044,.045),
        (((-.030,.058,2.979),(-.179,.104,3.052),(-.279,.116,3.031),(-.363,.125,2.984)), .046,.047),
    ]
    objects = [_lock('Hair_curved_crown_tuft_%02d' % i, path, width, depth,
                     materials['hair_light' if i == 1 else 'hair'], rng.uniform(0,6),
                     .10, root_spread=.24)
               for i,(path,width,depth) in enumerate(paths)]
    for side in (-1, 1):
        for i in range(9):
            angle = side*(1.06+1.92*(i+.4)/9)
            start = .36+.065*math.sin(i*2.3)
            objects.append(_swept_lock('Hair_crown_soft_flow_%s_%02d' % (side,i),
                                      angle,start,1.01+.065*math.sin(i),side*.22,
                                      .062,.040,.024,materials['hair'],rng.uniform(0,6),
                                      .035,.012,.035,.13))
    return objects


def _sides(materials, rng):
    objects = []
    for side in (-1,1):
        for layer,count in enumerate((7,8,8)):
            for i in range(count):
                angle = side*(.86+.90*(i+.45*(layer%2))/count+rng.uniform(-.035,.035))
                start = (.56,.94,1.34)[layer]+.065*math.sin(i*2.2+layer)
                end = start+(.66,.66,.46)[layer]+.055*math.sin(i*1.8)
                turn = side*(.53+.055*math.sin(i))
                final_angle = abs(angle+turn)
                end = min(end,1.58+.45*max(0,final_angle-1.53))
                objects.append(_swept_lock('Hair_layered_side_%s_%s_%02d' % (side,layer,i),
                                          angle,start,end,turn,.060+.006*math.sin(i),
                                          .038,(.030,.025,.011)[layer],materials['hair'],rng.uniform(0,6),
                                          .035,.013,(.046,.034,.014)[layer],.13))
        path = ((side*.319,-.046,2.682),(side*.398,-.098,2.549),
                (side*.348,-.147,2.480),(side*.303,-.115,2.413))
        objects.append(_lock('Hair_soft_temple_%s' % side,path,.036,.025,
                             materials['hair_dark'],rng.uniform(0,6),.08,root_spread=.30))
    return objects


def _back(materials, rng):
    objects = []
    for layer,count in enumerate((14,18,21,20)):
        for i in range(count):
            angle = 1.96+2.42*(i+.48*(layer%2))/count+rng.uniform(-.045,.045)
            start = (.68,1.04,1.42,1.76)[layer]+.072*math.sin(i*2.1+layer)
            side_distance = abs(angle-math.pi)/1.3
            end = start+(.61,.62,.58,.47)[layer]+.05*math.sin(i*1.9+layer)
            end = min(end,2.28-.24*side_distance**1.5)
            turn = .28*math.sin(angle-math.pi)+.07*math.sin(i*.9)
            objects.append(_swept_lock('Hair_soft_rear_%02d_%02d' % (layer,i),angle,
                                      start,end,turn,.060+.007*math.sin(i),
                                      .036,(.033,.025,.013,.001)[layer],
                                      materials['hair'],rng.uniform(0,6),.035,.013,
                                      (.049,.038,.026,.001)[layer],.13))
    return objects


def _image(name, rgba, directory, non_color=False):
    height, width = rgba.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height, alpha=True)
    image.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.filepath_raw = str(directory / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


def _strand_materials(materials):
    """Portable tangent normals and fine colour strands survive the GLB export."""
    directory = Path(__file__).resolve().parents[2] / 'assets/characters/grassy/history/model-atelier/textures'
    directory.mkdir(parents=True, exist_ok=True)
    size = 1024
    u = np.arange(size, dtype=np.float32)[None, :] / size
    v = np.arange(size, dtype=np.float32)[:, None] / size
    phase = 2*np.pi*(83*u+3.5*np.sin(6*np.pi*u))
    phase = phase + 1.70*np.sin(11*v+9*u) + .55*np.sin(27*v+11*u)
    fibre = .62*np.sin(phase) + .25*np.sin(phase*2+.8) + .13*np.sin(phase*3+2.1)
    broad = .020*np.sin(2*np.pi*9*u+1.2*np.sin(13*v))+ .012*np.sin(31*u+19*v)
    color_factor = 1 + .10*fibre + broad
    normal = np.zeros((size, size, 4), dtype=np.float32)
    dx = -.30*np.cos(phase)-.15*np.cos(phase*2+.8)-.09*np.cos(phase*3+2.1)
    dy = .018*np.sin(9*v+6*u)
    length = np.sqrt(dx*dx+dy*dy+1)
    normal[:, :, 0] = .5+.5*dx/length
    normal[:, :, 1] = .5+.5*dy/length
    normal[:, :, 2] = .5+.5/length
    normal[:, :, 3] = 1
    normal_image = _image('grassy_hair_strands_normal', normal, directory, True)
    palette = {'hair': (.244,.173,.141), 'hair_light': (.292,.210,.174),
               'hair_dark': (.221,.150,.122)}
    for key, color in palette.items():
        rgba = np.ones((size, size, 4), dtype=np.float32)
        for channel in range(3):
            rgba[:, :, channel] = color[channel]*color_factor
        color_image = _image('grassy_' + key + '_strands_color', rgba, directory)
        nodes, links = materials[key].node_tree.nodes, materials[key].node_tree.links
        shader = nodes['Principled BSDF']
        shader.inputs['Roughness'].default_value = .64
        shader.inputs['Anisotropic'].default_value = .12
        shader.inputs['Specular IOR Level'].default_value = .28
        texture = nodes.new('ShaderNodeTexImage')
        texture.name, texture.image = 'Fine longitudinal brown fibres', color_image
        links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        texture = nodes.new('ShaderNodeTexImage')
        texture.name, texture.image = 'Portable micro strand normals', normal_image
        normal_node = nodes.new('ShaderNodeNormalMap')
        normal_node.inputs['Strength'].default_value = .30
        links.new(texture.outputs['Color'], normal_node.inputs['Color'])
        links.new(normal_node.outputs['Normal'], shader.inputs['Normal'])


def build_hair(materials):
    """Return an integrated voluminous cap with layered swept solid locks."""
    rng = random.Random(42973)
    _strand_materials(materials)
    objects = ([_cap(materials['hair_dark'])] + _fringe(materials, rng)
               + _crown(materials, rng) + _sides(materials, rng) + _back(materials, rng))
    crown_scale = .168/(max(v.co.z for obj in objects for v in obj.data.vertices)-2.91)
    # The turnaround has more crown depth than the first front-based construction.
    # Deform the undercoat and locks together so their buried roots stay continuous.
    for obj in objects:
        for vertex in obj.data.vertices:
            y, z = vertex.co.y, vertex.co.z
            front = max(0, CENTER.y-y)
            back = max(0, y-CENTER.y)
            vertex.co.y += .032*(back/.45)**1.4
            vertex.co.y -= .065*(front/.42)**1.4*math.exp(-((z-2.77)/.30)**2)
            if z>2.91:
                vertex.co.z = 2.91+(z-2.91)*crown_scale
        obj.data.update()
    return objects
