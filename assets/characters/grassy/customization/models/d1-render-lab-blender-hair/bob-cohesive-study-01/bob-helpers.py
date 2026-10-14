"""Independent rear/bob sculpture. Source head is a fitting reference, never a hair donor."""
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
from build import ROOT, ORIGIN, material, scalp, setup_render, skull_tree

STAGE = HERE / 'bob-study-19'


def unit(v):
    return v / np.linalg.norm(v)


def catmull(values, steps=10):
    values = np.asarray(values, float)
    padded = np.vstack((values[0], values, values[-1]))
    result = []
    for i in range(1, len(padded)-2):
        a, b, c, d = padded[i-1:i+3]
        for t in np.linspace(0, 1, steps, endpoint=False):
            result.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    return np.vstack((*result, values[-1]))


def transported_frames(points, side_fan=False):
    tangents = [unit(points[min(i+1,len(points)-1)]-points[max(0,i-1)]) for i in range(len(points))]
    normal = np.array([np.sign(points[-1, 0]), 0., 0.]) if side_fan else unit(points[0]-ORIGIN)
    normal -= tangents[0]*np.dot(normal,tangents[0])
    if np.linalg.norm(normal) < .1:
        normal = np.array([0.,1.,.35])-tangents[0]*np.dot([0.,1.,.35],tangents[0])
    normal = unit(normal)
    frames = []
    for i, tangent in enumerate(tangents):
        if i:
            axis = np.cross(tangents[i-1],tangent)
            sine = np.linalg.norm(axis)
            if sine > 1e-8:
                axis /= sine
                cosine = np.clip(np.dot(tangents[i-1],tangent),-1,1)
                normal = normal*cosine+np.cross(axis,normal)*sine+axis*np.dot(axis,normal)*(1-cosine)
        normal = unit(normal-tangent*np.dot(normal,tangent))
        radial = unit(points[i]-ORIGIN)
        target = radial-tangent*np.dot(radial,tangent)
        if not side_fan and np.linalg.norm(target) > .25:
            target = unit(target)
            if np.dot(normal,target) > 0:
                normal = unit(normal*.94+target*.06)
        frames.append((tangent,normal,unit(np.cross(tangent,normal))))
    return frames


def lock(name, points, width, depth, tree, collection, mat, region):
    controls = np.column_stack((points, width, depth))
    controls[0, :3] = scalp(controls[0, :3], tree, .002)
    samples = catmull(controls)
    verts, faces = [], []
    sides = 28
    side_fan = region == 'rear bob'
    frames = transported_frames(samples[:, :3], side_fan)
    distances = np.r_[0,np.cumsum(np.linalg.norm(np.diff(samples[:, :3],axis=0),axis=1))]
    distances /= distances[-1]
    bob_bundle = region in ('rear bob', 'inner bob', 'rear cover', 'side cover')
    sweep = controls[-1, :3] - controls[0, :3]
    phase = math.atan2(sweep[0], sweep[1])
    for row, sample in enumerate(samples):
        centre = sample[:3]
        tangent, normal, lateral = frames[row]
        flow = distances[row]
        if name.endswith('lower body underfold'):
            # The lower underfold is a cheek-to-nape body, not an edge-on side strip.
            target = np.array([0., -1., 0.])
            target = unit(target - tangent * np.dot(target, tangent))
            angle = math.atan2(np.dot(tangent, np.cross(normal, target)), np.dot(normal, target))
            turn = np.clip((flow - .37) / .32, 0, 1)
            turn = turn * turn * (3 - 2 * turn)
            angle *= turn
            normal = normal * math.cos(angle) + np.cross(tangent, normal) * math.sin(angle)
            lateral = unit(np.cross(tangent, normal))
        elif bob_bundle and not side_fan:
            roll = .17 * math.sin(math.pi * flow) * math.sin(flow * 3.4 + phase)
            normal, lateral = normal*math.cos(roll)+lateral*math.sin(roll), lateral*math.cos(roll)-normal*math.sin(roll)
        w, d = max(.0012, sample[3]), max(.0014, sample[4])
        for j in range(sides):
            angle = 2*math.pi*j/sides
            x = math.cos(angle)
            y = math.sin(angle)
            # Broad softly convex face, rounded shoulders, shallow inner face.
            side_width = w*(1.03 if x < 0 else .97)
            face_depth = d*(1 if y >= 0 else .68)
            p = centre+lateral*x*side_width/2+normal*y*face_depth
            if y > 0 and region != 'small branch':
                # Two shallow irregular channels keep large volumes readable as bundled hair.
                channel_a = -.28+.055*math.sin(flow*5.2)
                channel_b = .40-.07*math.sin(flow*4.1)
                amplitude = .0035
                channel_width_a, channel_width_b = .075, .07
                if bob_bundle:
                    channel_a = -.39+.09*math.sin(flow*4.8+phase)
                    channel_b = .28-.05*math.sin(flow*5.3-.6*phase)
                    amplitude = d * (.18 if side_fan else .34)
                    channel_width_a, channel_width_b = .11, .13
                groove = math.exp(-((x-channel_a)/channel_width_a)**2)+.7*math.exp(-((x-channel_b)/channel_width_b)**2)
                p -= normal*amplitude*groove*y*math.sin(math.pi*flow)**.55
            if row == 0:
                hit, root_normal, _, _ = tree.find_nearest(Vector(centre))
                root_normal = unit(np.asarray(root_normal))
                root_flow = unit(tangent-root_normal*np.dot(tangent,root_normal))
                p = scalp(centre+lateral*x*side_width/2+root_flow*y*.026, tree, -.004)
            elif row < 9:
                surface, n, _, distance = tree.find_nearest(Vector(p))
                margin = -.004+.007*min(1,row/4)
                if np.dot(p-np.asarray(surface), np.asarray(n)) < margin:
                    p = np.asarray(surface)+np.asarray(n)*margin
            verts.append(tuple(p))
    for row in range(len(samples)-1):
        for j in range(sides):
            a, b = row*sides+j, row*sides+(j+1)%sides
            faces.append((a, b, b+sides, a+sides))
    for end in (0, len(samples)-1):
        centre = controls[0, :3] if side_fan and end == 0 else np.mean(np.asarray(verts)[end*sides:(end+1)*sides], axis=0)
        centre_index = len(verts)
        verts.append(tuple(centre))
        for j in range(sides):
            a, b = end*sides+j, end*sides+(j+1)%sides
            faces.append((centre_index, b, a) if end == 0 else (centre_index, a, b))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    assert all(edge.is_manifold for edge in bm.edges), f'Open hair volume: {name}'
    assert bm.calc_volume(signed=True) > 0, f'Inside-out hair volume: {name}'
    bm.to_mesh(mesh); bm.free()
    uv = mesh.uv_layers.new(name='Hair flow')
    for polygon in mesh.polygons:
        seam = any(v < len(samples)*sides and v%sides == sides-1 for v in polygon.vertices)
        for loop_index in polygon.loop_indices:
            v = mesh.loops[loop_index].vertex_index
            if v >= len(samples)*sides:
                uv.data[loop_index].uv = (.5,0 if v == len(samples)*sides else 1)
            else:
                row, col = divmod(v,sides)
                uv.data[loop_index].uv = (1 if seam and col == 0 else col/sides, float(distances[row]))
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj['region'] = region
    obj['guideBlender'] = json.dumps(controls[:, :3].tolist())
    obj['referenceRole'] = 'New closed lobe; root fitted to frozen Head, free end individually authored'
    obj['rootDistance'] = float(tree.find_nearest(Vector(controls[0, :3]))[3])
    return obj


def make_bob(tree, collection, mat):
    result = []
    def add(name, p, w, d, region='rear bob'):
        result.append(lock(name, p, w, d, tree, collection, mat, region))
    # Narrow overlapping diagonal covers reveal different underfolds rather
    # than swallowing the lower locks beneath three broad leaf-shaped faces.
    add('Rear cover swept centre', [(.075,.20,2.95),(.065,.32,2.89),(-.015,.44,2.76),(-.11,.505,2.60),(-.145,.53,2.49),(-.18,.49,2.475)],
        [.20,.26,.275,.23,.09,.003], [.015,.028,.038,.036,.014,.002], 'rear cover')
    add('Rear cover right fold', [(-.10,.17,2.92),(-.225,.39,2.80),(-.28,.46,2.63),(-.245,.49,2.50),(-.175,.48,2.448),(-.155,.46,2.463)],
        [.18,.26,.265,.19,.07,.003], [.015,.030,.038,.028,.010,.002], 'rear cover')
    add('Rear cover left fold', [(.22,.16,2.88),(.305,.35,2.76),(.355,.425,2.61),(.365,.435,2.44),(.33,.408,2.36),(.30,.375,2.355)],
        [.18,.225,.215,.14,.045,.003], [.015,.029,.035,.023,.008,.002], 'rear cover')
    add('Rear part underfold', [(-.025,.205,2.93),(-.07,.37,2.81),(-.12,.47,2.62),(-.105,.485,2.43),(-.04,.47,2.315),(.015,.43,2.32)],
        [.13,.165,.17,.135,.045,.003], [.011,.021,.026,.023,.007,.002], 'inner bob')
    for side in (-1, 1):
        label = 'right' if side < 0 else 'left'
        def mirror(p):
            return [(side*x,y,z) for x,y,z in p]
        add(f'{label} rearward upper sweep', mirror([(.14,.045,2.94),(.295,.16,2.885),(.355,.290,2.790),(.405,.395,2.690),(.395,.440,2.652),(.375,.480,2.650)]),
            [.25,.28,.255,.16,.045,.003], [.015,.038,.049,.035,.011,.002], 'side cover')
        add(f'{label} ear-back shoulder fold', mirror([(.32,.11,2.80),(.41,.21,2.67),(.450,.300,2.610),(.455,.380,2.580),(.430,.430,2.530)]),
            [.16,.22,.18,.105,.003], [.013,.032,.034,.015,.002], 'side cover')
        p = mirror([(.12,-.055,2.97),(.190,-.020,2.973),(.295,.085,2.890),(.390,.200,2.770),(.460,.250,2.670),(.455,.315,2.590),(.420,.350,2.565)])
        add(f'{label} plait-back filling sweep', p, [.22,.22,.235,.215,.135,.045,.003], [.015,.026,.033,.034,.024,.009,.002], 'side cover')

    # Hidden short underfolds join the fans through their body; the visible
    # tips keep their separate turns instead of sharing one low hem.
    add('Nape central curl', [(0,.34,2.80),(.018,.435,2.64),(.035,.46,2.42),(.01,.45,2.28),(-.045,.415,2.19),(-.09,.39,2.18)],
        [.10,.15,.16,.135,.05,.003], [.012,.024,.029,.025,.009,.002], 'inner bob')
    add('Nape right interval undercurl', [(-.11,.285,2.80),(-.14,.43,2.61),(-.16,.48,2.40),(-.18,.49,2.24),(-.145,.445,2.14),(-.10,.42,2.12)],
        [.12,.155,.15,.095,.04,.003], [.011,.022,.027,.019,.007,.002], 'inner bob')
    add('Nape left interval undercurl', [(.125,.285,2.80),(.145,.43,2.61),(.13,.49,2.40),(.08,.48,2.26),(.045,.42,2.195),(.04,.39,2.215)],
        [.12,.16,.17,.115,.038,.003], [.011,.023,.028,.019,.007,.002], 'inner bob')
    add('right lower body underfold', [(-.24,.20,2.79),(-.39,.26,2.63),(-.43,.34,2.43),(-.365,.32,2.260),(-.30,.30,2.175),(-.275,.28,2.145)],
        [.09,.17,.12,.285,.15,.003], [.010,.022,.035,.040,.023,.002], 'inner bob')
    add('left lower body underfold', [(.22,.205,2.78),(.365,.27,2.61),(.408,.34,2.45),(.355,.32,2.295),(.30,.30,2.22),(.265,.28,2.175)],
        [.08,.16,.12,.265,.14,.003], [.010,.020,.033,.038,.022,.002], 'inner bob')

    # Seven descending fans replace the long forward curls. Side paths define
    # the sweep, while separate X paths wrap each fan around the cheek and nape.
    fans = [
        ([(79,131),(55,153),(35,182),(29,202),(27,214)], [.16,.26,.32,.345,.32], 20),
        ([(93,144),(66,168),(51,205),(51,230),(42,239)], [.24,.35,.405,.435,.42], 22),
        ([(110,151),(82,176),(68,209),(69,237),(76,252)], [.32,.42,.465,.445,.395], 25),
        ([(125,152),(97,183),(92,220),(102,250),(114,266)], [.385,.49,.505,.465,.38], 24),
        ([(145,161),(122,191),(118,229),(131,257),(143,273)], [.43,.55,.55,.50,.435], 23),
        ([(139,158),(137,184),(148,210),(158,241),(173,256),(186,264)], [.38,.47,.455,.405,.345,.31], 20),
        ([(132,177),(138,205),(165,222),(175,239),(193,251)], [.35,.425,.36,.30,.255], 13),
    ]
    width_t = np.array([0,.15,.35,.58,.78,.92,1])
    width_fraction = np.array([.3,.82,1.10,1.10,.8,.22,0])
    depth_fraction = np.array([.3,.73,1.10,.97,.70,.23,0])
    for side in (-1, 1):
        label = 'right' if side < 0 else 'left'
        for number, (pixels, xs, maximum_width) in enumerate(fans, 1):
            uv = np.asarray(pixels, float)
            xs = np.asarray(xs, float)
            if side > 0:
                xs *= .90
                if number == 7:
                    xs += [0,.006,.045,.030,.008]
                # Unequal final turns keep both front cheeks distinct.
                uv[-2:,0] += (3,-2,4,-2,3,-3,2)[number-1]
                uv[-1,1] += (-5,1,-4,-2,-3,-4,3)[number-1]
            points = np.column_stack((side*xs, .09-(uv[:,0]-152)/256.25, 2.4453+(186-uv[:,1])/256.25))
            smooth = catmull(points, steps=24)
            distance = np.r_[0,np.cumsum(np.linalg.norm(np.diff(smooth,axis=0),axis=1))]
            distance /= distance[-1]
            p = np.column_stack([np.interp(width_t,distance,smooth[:,axis]) for axis in range(3)])
            # The fitted head's chin sits lower than the ear-registered drawing.
            lower = np.clip((width_t-.4)/.6,0,1)
            p[:,2] -= .08*lower*lower*(3-2*lower)
            width = maximum_width/256.25 * width_fraction
            depth = maximum_width/256.25 * (.34,.36,.42,.42,.45,.36,.34)[number-1] * depth_fraction**.75
            add(f'{label} lower fan {number:02}', p.tolist(), width.tolist(), depth.tolist())

    return result


def main():
    if STAGE.exists(): raise ValueError(f'Preserved bob stage exists: {STAGE}')
    STAGE.mkdir(parents=True)
    (STAGE/'build-source.py').write_text(Path(__file__).read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/characters/human/render-lab/d1-outfit-rodin-hair.web-1k.glb'))
    scene = bpy.context.scene
    old = bpy.data.objects['Hair']
    old.name = 'Hidden old hair reference — not exported'
    old.hide_render = True
    old.hide_set(True)
    for obj in scene.objects:
        if obj.name == 'Icosphere':
            obj.hide_render = True
            obj.hide_set(True)
    rig = bpy.data.objects['D1ModularBaseRig']
    rig.data.pose_position = 'REST'
    head = bpy.data.objects['Head']
    frozen = np.array([v.co for v in head.data.vertices])
    tree = skull_tree(head)
    collection = bpy.data.collections.new('Independent closed bob lobes')
    scene.collection.children.link(collection)
    clay = material('Bob warm neutral clay', (.48,.33,.21))
    clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .8
    from build_bob_study_assembly21 import make_bob as previous_bob
    previous = previous_bob(tree, collection, clay)
    preserved = {obj.name: np.array([v.co for v in obj.data.vertices]) for obj in previous
                 if obj['region'] == 'rear cover' or obj.name in ('Rear part underfold', 'Nape central curl', 'Nape right interval undercurl', 'Nape left interval undercurl')}
    baseline = np.vstack([np.array([v.co for v in obj.data.vertices]) for obj in previous])
    for obj in previous:
        mesh = obj.data; bpy.data.objects.remove(obj, do_unlink=True); bpy.data.meshes.remove(mesh)
    locks = make_bob(tree, collection, clay)
    current = {obj.name:obj for obj in locks}
    for name, vertices in preserved.items():
        assert np.array_equal(vertices, np.array([v.co for v in current[name].data.vertices])), f'Upper coverage changed: {name}'
    bound = np.vstack([np.array([v.co for v in obj.data.vertices]) for obj in locks])
    face_clearances = {}
    for obj in locks:
        clearances = []
        for vertex in list(obj.data.vertices)[9*28:]:
            if vertex.co.y < .11 and vertex.co.z < 2.60:
                point, normal, _, _ = tree.find_nearest(vertex.co)
                clearances.append(float((vertex.co-point).dot(normal)))
        if clearances:
            face_clearances[obj.name] = min(clearances)
            assert min(clearances) >= -.0001, f'{obj.name}: hair enters face by {-min(clearances)}'
    for obj in locks:
        obj.parent = rig
        obj.vertex_groups.new(name='head').add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        obj.modifiers.new('Head skinning', 'ARMATURE').object = rig
    assert np.array_equal(frozen, np.array([v.co for v in head.data.vertices]))
    centre, camera = setup_render(scene, STAGE)
    centre = Vector((0,.015,2.62))
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    for name, direction in {'front':(0,-1,0), 'right':(-1,0,0), 'back':(0,1,0), 'three-quarter':(-1,-1,0)}.items():
        camera.location = centre+Vector(direction)*4
        camera.rotation_euler = (centre-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(STAGE/f'clay-{name}.png')
        bpy.ops.render.render(write_still=True)
    camera.location = centre+Vector((-4,-4,0))
    camera.rotation_euler = (centre-camera.location).to_track_quat('-Z','Y').to_euler()
    report = {'component':'rear and short bob only; front fringe and braids intentionally omitted',
              'headUnchanged':True, 'newClosedLobes':len(locks), 'sourceHairVerticesUsed':0,
              'bounds':[bound.min(0).tolist(),bound.max(0).tolist()],
              'assembly21Bounds':[baseline.min(0).tolist(),baseline.max(0).tolist()],
              'unchangedUpperComponents':list(preserved),
              'lowerComponents':[obj.name for obj in locks if obj['region'] == 'rear bob'],
              'faceClearanceMinByComponent':face_clearances,
              'rootDistances':{o.name:o['rootDistance'] for o in locks},
              'reference':{'front':'X=(u-187)/256.25, Z=2.4453+(179-v)/256.25',
                           'side':'Y=.09-(u-152)/256.25, Z=2.4453+(186-v)/256.25'},
              'status':'visual study; no whole-hair approval implied by root distances'}
    topology = {}
    for obj in locks:
        edge_faces = {}
        for polygon in obj.data.polygons:
            for edge in polygon.edge_keys:
                edge_faces[edge] = edge_faces.get(edge,0)+1
        invalid = sum(count != 2 for count in edge_faces.values())
        assert invalid == 0, f'{obj.name}: {invalid} open/nonmanifold edges'
        topology[obj.name] = {'vertices':len(obj.data.vertices),'faces':len(obj.data.polygons),
                              'openOrNonmanifoldEdges':invalid,'flowUV':len(obj.data.uv_layers['Hair flow'].data)}
    report['topology'] = topology
    (STAGE/'model-report.json').write_text(json.dumps(report, indent=2))
    recipe = bpy.data.texts.new('Build bob study.py')
    recipe.write(Path(__file__).read_text())
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'Bob-Study.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, *locks]:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = locks[0]
    bpy.ops.export_scene.gltf(filepath=str(STAGE/'bob-component.glb'), export_format='GLB', use_selection=True, export_extras=True, export_animations=False)


if __name__ == '__main__':
    main()
