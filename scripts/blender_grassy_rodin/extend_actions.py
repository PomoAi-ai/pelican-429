"""Bake the final Grassy locomotion, keyboard combat and flight action set.

The retained Rodin surface, UVs and materials are never regenerated. Equipment
is authored by equipment.py and all movement is baked into the deliverable GLB.
"""
import argparse
import json
import heapq
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import animate as base

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/characters/grassy/history/model-rodin-refined'
BLENDS = ROOT / 'assets/characters/grassy/model-equipped'
OUT = ROOT / 'public/characters/human/models-equipped'
EVIDENCE = BLENDS / 'evidence'
FPS = 30
CYCLING = json.loads((BLENDS / 'ride-contract.json').read_text())
CLIPS = {
    'idle': (96, True), 'walk': (36, True), 'run': (24, True), 'sprint': (18, True),
    'ride': (round(CYCLING['seconds'] * FPS), True),
    'jump': (48, False), 'keyboard_smash': (60, False), 'codex_attack': (48, False),
    'bug_attack': (60, False), 'server_overload': (96, False),
    'takeoff': (36, False), 'hover': (72, True),
    'fly_forward': (36, True), 'land': (36, False),
}
ATTACKS = ('keyboard_smash', 'codex_attack', 'bug_attack', 'server_overload')
PHASES = {
    'jump': {'anticipation': [0,.20], 'airborne': [.20,.79], 'landing': [.79,1]},
    'keyboard_smash': {'draw': [0,.22], 'windup': [.22,.30], 'strikes': [[.30,22/60],[.60,42/60]], 'impacts': [22/60,42/60], 'recovery': [.70,.80], 'stow': [.80,1]},
    'codex_attack': {'draw': [0,.27], 'fire': [.38,.68], 'stow': [.75,1]},
    'bug_attack': {'draw': [0,.27], 'fire': [.42,.65], 'stow': [.75,1]},
    'server_overload': {'draw': [0,.27], 'charge': [.38,.72], 'release': .73, 'stow': [.75,1]},
    'takeoff': {'crouch': [0,.18], 'boost': [.18,.80], 'hover': [.80,1]},
    'land': {'descent': [.18,.70], 'impact': .70, 'settle': [.70,1]},
}
R = base.rotation


def ease(t):
    t = min(1, max(0, t))
    return t * t * (3 - 2 * t)


def curve(t, keys):
    for (a, av), (b, bv) in zip(keys, keys[1:]):
        if t <= b:
            return av + (bv - av) * ease((t - a) / (b - a))
    return keys[-1][1]


def mix(a, b, t):
    return a + (b - a) * t


def reset_rig(rig):
    rig.animation_data_clear()
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
        bone.rotation_mode = 'QUATERNION'


def repair_arm_partition(ob):
    """Separate adjacent fingers and jeans by their surface connectivity.

    The original spatial-only partition mistakes inward fingers for hip/leg
    vertices and outer jeans for the hand. Keep the shoulder transition while
    correcting both directions below the waist.
    """
    points = base.mesh_coordinates(ob.data)
    unique, inverse = np.unique(np.round(points, 6), axis=0, return_inverse=True)
    loop_indices = np.empty(len(ob.data.loops), dtype=np.int32)
    ob.data.loops.foreach_get('vertex_index', loop_indices)
    triangles = inverse[loop_indices.reshape(-1, 3)]
    edges = np.unique(np.sort(np.concatenate((triangles[:,[0,1]], triangles[:,[1,2]], triangles[:,[2,0]])), axis=1), axis=0)
    adjacency = [[] for _ in unique]
    lengths = np.linalg.norm(unique[edges[:,0]] - unique[edges[:,1]], axis=1)
    for (a,b), length in zip(edges, lengths):
        adjacency[a].append((int(b), float(length)))
        adjacency[b].append((int(a), float(length)))

    def distances(seeds):
        distance = np.full(len(unique), np.inf)
        queue=[]
        for seed in seeds:
            index=int(np.argmin(np.linalg.norm(unique-np.asarray(seed),axis=1)))
            distance[index]=0
            heapq.heappush(queue,(0,index))
        while queue:
            value,index=heapq.heappop(queue)
            if value>distance[index]:
                continue
            for neighbor,length in adjacency[index]:
                cost=value+length
                if cost<distance[neighbor]:
                    distance[neighbor]=cost
                    heapq.heappush(queue,(cost,neighbor))
        return distance[inverse]

    body=distances(((0,-.24,1.5),(0,.23,1.5),(0,-.08,1.92),(.23,-.10,.85),(-.23,-.10,.85)))
    arm=distances(((.58,-.10,1.12),(-.58,-.10,1.12),(.49,-.08,1.48),(-.49,-.08,1.48)))
    body_reachable,arm_reachable=np.isfinite(body),np.isfinite(arm)
    finite=body_reachable&arm_reachable
    difference=np.zeros(len(points))
    difference[finite]=body[finite]-arm[finite]
    desired=base.smooth(.05,.32,difference)
    desired[arm_reachable&~body_reachable]=1
    desired*=1-base.smooth(1.65,1.83,points[:,2])
    names=list(base.JOINTS)
    groups=[ob.vertex_groups[name] for name in names]
    arm_names={name for name in names if name.startswith(('clavicle.','upper_arm.','forearm.','hand.'))}
    count=0
    for vertex in ob.data.vertices:
        # A disconnected island without either seed keeps its spatial binding.
        if not (body_reachable[vertex.index] or arm_reachable[vertex.index]):
            continue
        z=points[vertex.index,2]
        target=float(desired[vertex.index])
        current={ob.vertex_groups[g.group].name:g.weight for g in vertex.groups}
        amount=sum(w for name,w in current.items() if name in arm_names)
        if target<amount:
            target=amount+(target-amount)*(1-float(base.smooth(1.25,1.35,z)))
        if abs(target-amount)<=.001:
            continue
        side='L' if points[vertex.index,0]>0 else 'R'
        hand=1-float(base.smooth(1.13,1.26,z))
        forearm=(1-float(base.smooth(1.40,1.60,z)))*(1-hand)
        values={name:w*(1-target)/(1-amount) for name,w in current.items() if name not in arm_names}
        values[f'hand.{side}']=target*hand
        values[f'forearm.{side}']=target*forearm
        values[f'upper_arm.{side}']=target*(1-hand-forearm)
        kept=sorted(values.items(),key=lambda item:item[1],reverse=True)[:4]
        total=sum(w for name,w in kept)
        for group in groups:
            group.remove([vertex.index])
        for name,weight in kept:
            if weight>0:
                ob.vertex_groups[name].add([vertex.index],weight/total,'REPLACE')
        count+=1
    print('ARM_PARTITION_REPAIRED',count,flush=True)


def limb_target(hip, ankle, side):
    knee = base.solve_knee(hip, ankle, side)
    return {
        f'thigh.{side}': base.segment_deform(f'thigh.{side}', hip, knee),
        f'shin.{side}': base.segment_deform(f'shin.{side}', knee, ankle),
    }


def sole_ankle(side, soles, y, clearance, pitch, spread=0):
    ankle = Vector(base.JOINTS[f'foot.{side}'][0])
    relative = soles[side] - np.asarray(ankle)
    ankle.y += y
    ankle.x += spread
    ankle.z = clearance - float((relative[:, 1] * math.sin(pitch) + relative[:, 2] * math.cos(pitch)).min())
    return ankle, R('X', pitch)


def running_foot(t, soles, side, sprint=False):
    u = t % 1
    if sprint and u < .30:
        y, lift = -.40 + .86 * u / .30, 0
        pitch = -.10 + .55 * ease((u-.08) / .22)
    elif sprint:
        v = (u - .30) / .70
        y = curve(v, ((0,.46),(.25,.30),(.58,-.14),(.85,-.42),(1,-.40)))
        lift = curve(v, ((0,0),(.28,.57),(.55,.39),(.83,.12),(1,0)))
        pitch = curve(v, ((0,.45),(.28,1.07),(.55,.30),(.85,-.16),(1,-.10)))
    elif u < .34:
        y, lift = -.36 + .76 * u / .34, 0
        pitch = -.11 + .43 * ease((u-.10) / .24)
    else:
        v = (u - .34) / .66
        # Recover the heel behind the body before bringing the knee forward.
        y = curve(v, ((0,.40),(.25,.28),(.58,-.12),(.85,-.38),(1,-.36)))
        lift = curve(v, ((0,0),(.28,.48),(.55,.33),(.83,.10),(1,0)))
        pitch = curve(v, ((0,.32),(.28,.95),(.55,.26),(.85,-.14),(1,-.11)))
    return sole_ankle(side, soles, y, lift, pitch)


def attack_amount(t):
    return curve(t, ((0, 0), (.27, 1), (.75, 1), (1, 0)))


def smash_turn(t):
    return curve(t, ((0,0),(.22,-.28),(.30,-.42),(22/60,.38),(.43,.44),(.60,.40),(42/60,-.38),(.76,-.44),(.80,-.20),(1,0)))


def keyboard_pose(clip, t, body):
    """The take-out path skirts the right side of the torso, not through it."""
    back = Vector((0, .475, 1.62))
    held = Vector((0, -.48, 1.40))
    back_q = (R('Y', math.radians(-32)) @ R('X', math.radians(-90))).to_quaternion()
    held_q = R('X', math.radians(10)).to_quaternion()
    if clip not in ATTACKS:
        return Matrix.Translation(body @ back) @ (body.to_quaternion() @ back_q).to_matrix().to_4x4()
    if clip == 'keyboard_smash':
        angle = curve(t, ((0,-1.15),(.22,-1.15),(.30,-1.30),(22/60,1.10),(.43,1.32),(.60,1.22),(42/60,-1.14),(.76,-1.28),(.80,-.75),(1,-.75)))
        direction = Vector((math.sin(angle), -math.cos(angle), 0))
        held_q = (R('Z',angle-math.pi/2) @ R('X',.98*math.sin(angle))).to_quaternion()
        # The right wrist owns the near short end; the far end swings beyond it.
        wrist = Vector(base.JOINTS['upper_arm.R'][0]) + direction*.56 + Vector((0,0,-.11))
        held = wrist - held_q @ Vector((-.60,0,.045))
        if .22 <= t <= .80:
            point, q = held, held_q
        else:
            u = ease(t/.22) if t < .22 else ease((1-t)/.20)
            p1, p2 = Vector((-.90,.48,1.52)), Vector((-.88,-.55,1.52))
            point = back*(1-u)**3 + p1*3*(1-u)**2*u + p2*3*(1-u)*u*u + held*u**3
            q = back_q.slerp(held_q,u)
        return Matrix.Translation(body @ point) @ (body.to_quaternion() @ q).to_matrix().to_4x4()
    u = attack_amount(t)
    p1, p2 = Vector((-.90, .48, 1.72)), Vector((-.88, -.55, 1.62))
    point = back * (1-u)**3 + p1 * 3*(1-u)**2*u + p2 * 3*(1-u)*u*u + held * u**3
    q = back_q.slerp(held_q, u)
    if .27 < t < .75:
        point.z += .006 * math.sin(t * math.tau * 5)
    return Matrix.Translation(body @ point) @ (body.to_quaternion() @ q).to_matrix().to_4x4()


def two_bone_elbow(shoulder, wrist, side):
    upper = f'upper_arm.{side}'
    forearm = f'forearm.{side}'
    rest_upper = Vector(base.JOINTS[upper][1]) - Vector(base.JOINTS[upper][0])
    rest_forearm = Vector(base.JOINTS[forearm][1]) - Vector(base.JOINTS[forearm][0])
    a, b = rest_upper.length, rest_forearm.length
    direction = wrist - shoulder
    distance = direction.length
    if distance >= a+b or distance <= abs(a-b):
        raise RuntimeError(f'{side} arm target outside reach: {distance:.4f}, {a+b:.4f}')
    axis = direction.normalized()
    outward = Vector((1 if side == 'L' else -1, .12, -.35))
    bend = (outward - axis * outward.dot(axis)).normalized()
    along = (a*a-b*b+distance*distance)/(2*distance)
    return shoulder + axis*along + bend*math.sqrt(max(0, a*a-along*along))


def attack_arm(deforms, side, clip, t, weapon):
    sign = 1 if side == 'L' else -1
    amount = attack_amount(t)
    body = deforms['chest']
    upper, forearm, hand = (f'{part}.{side}' for part in ('upper_arm', 'forearm', 'hand'))
    shoulder = body @ Vector(base.JOINTS[upper][0])
    rest_wrist = body @ Vector(base.JOINTS[hand][0])
    rest_tip = body @ Vector(base.JOINTS[hand][1])
    # During transit the right hand follows the board from its outboard corner.
    if side == 'R' and (t < .27 or t > .75):
        grab = weapon @ Vector((-.20, .02, .05))
        wrist_goal = grab + Vector((-.10, .08, .10))
        tip_goal = grab
        reaching = min(1, amount * 2.5)
    else:
        if side == 'L':
            wrist_goal = body @ Vector((.43, -.45, 1.34))
            tip_goal = body @ Vector((.23, -.49, 1.35))
        else:
            pulse = .5 + .5 * math.sin(t * math.tau * (7 if clip == 'server_overload' else 5))
            if clip == 'bug_attack':
                pulse += 2 * math.sin(math.pi * min(1,max(0,(t-.36)/.29)))**2
            strike = curve(t, ((0, 0), (.62, 0), (.68, .16), (.73, -.04), (.78, 0), (1, 0))) if clip == 'server_overload' else 0
            wrist_goal = body @ Vector((-.17, -.36, 1.65 + .025*pulse + strike))
            tip_goal = body @ Vector((-.10, -.52, 1.44 + .020*pulse + strike))
        reaching = amount
    wrist = mix(rest_wrist, wrist_goal, reaching)
    tip = mix(rest_tip, tip_goal, reaching)
    # Rest arm is almost straight; retain a tiny anatomical elbow bend at rest.
    reach = wrist - shoulder
    limit = .679
    if reach.length > limit:
        wrist = shoulder + reach.normalized() * limit
        tip += wrist - mix(rest_wrist, wrist_goal, reaching)
    elbow = two_bone_elbow(shoulder, wrist, side)
    deforms[upper] = base.segment_deform(upper, shoulder, elbow)
    deforms[forearm] = base.segment_deform(forearm, elbow, wrist)
    deforms[hand] = base.segment_deform(hand, wrist, tip)


def smash_arm(deforms, side, t, weapon):
    """Keep one short end in the right palm and the left hand behind for balance."""
    upper, forearm, hand = (f'{part}.{side}' for part in ('upper_arm','forearm','hand'))
    body = deforms['chest']
    shoulder = body @ Vector(base.JOINTS[upper][0])
    rest_wrist = body @ Vector(base.JOINTS[hand][0])
    rest_tip = body @ Vector(base.JOINTS[hand][1])
    amount = curve(t, ((0,0),(.22,1),(.80,1),(1,0)))
    if side == 'R':
        wrist_goal = weapon @ Vector((-.60,0,.045))
        tip_goal = weapon @ Vector((-.36,0,.045))
    else:
        wrist_goal = body @ Vector((.84,.25,1.58))
        tip_goal = body @ Vector((1.00,.29,1.41))
    if side == 'R' and (t < .22 or t > .80):
        # The right hand draws from the reachable inner corner of the dock.
        transit = 1-amount
        wrist_goal += weapon.to_quaternion() @ Vector((.58*transit,0,.03*transit))
        tip_goal += weapon.to_quaternion() @ Vector((.42*transit,0,.03*transit))
        amount = min(1,amount*2)
    wrist, tip = mix(rest_wrist,wrist_goal,amount), mix(rest_tip,tip_goal,amount)
    reach = wrist-shoulder
    if t < .22 or t > .80:
        if reach.length > .679:
            adjusted = shoulder+reach.normalized()*.679
            tip += adjusted-wrist
            wrist = adjusted
    elbow = two_bone_elbow(shoulder,wrist,side)
    deforms[upper] = base.segment_deform(upper,shoulder,elbow)
    deforms[forearm] = base.segment_deform(forearm,elbow,wrist)
    deforms[hand] = base.segment_deform(hand,wrist,tip)
    if side == 'R':
        direction = (tip-wrist).normalized()
        palm = deforms[hand].to_quaternion() @ Vector((1,0,0))
        palm = (palm-direction*palm.dot(direction)).normalized()
        down = weapon.to_quaternion() @ Vector((0,0,-1))
        down = (down-direction*down.dot(direction)).normalized()
        roll = Matrix.Identity(4).to_quaternion().slerp(palm.rotation_difference(down),amount).to_matrix().to_4x4()
        deforms[hand] = Matrix.Translation(wrist) @ roll @ Matrix.Translation(-wrist) @ deforms[hand]


def body_parameters(clip, t):
    phase = math.tau * t
    if clip == 'run':
        # Compress after contact; the high point belongs to the flight phase.
        drop = curve((t % .5)*2, ((0,-.10),(.24,-.17),(.66,-.09),(.84,-.025),(1,-.10)))
        return drop, .15, .055*math.sin(phase), 0
    if clip == 'sprint':
        drop = curve((t % .5)*2, ((0,-.12),(.20,-.20),(.60,-.105),(.82,-.045),(1,-.12)))
        return drop, .40+.025*math.sin(phase*2), .07*math.sin(phase), 0
    if clip == 'jump':
        root = curve(t, ((0,0),(.14,-.20),(.27,.35),(.46,.62),(.64,.36),(.79,0),(.86,-.16),(1,0)))
        lean = curve(t, ((0,0),(.14,.14),(.30,-.03),(.60,.04),(.86,.12),(1,0)))
        return root, lean, 0, 0
    if clip == 'keyboard_smash':
        root = curve(t, ((0,0),(.22,-.10),(.30,-.08),(22/60,-.14),(.48,-.10),(.60,-.08),(42/60,-.14),(.80,-.08),(1,0)))
        lean = curve(t, ((0,0),(.22,.05),(.30,.02),(22/60,.13),(.48,.05),(.60,.02),(42/60,.13),(.80,.05),(1,0)))
        return root,lean,smash_turn(t),0
    if clip in ATTACKS:
        amount = attack_amount(t)
        if clip == 'server_overload':
            charge = curve(t, ((0,0),(.35,.07),(.66,.10),(.74,-.045),(.85,.025),(1,0)))
            return -.045*amount, charge, -.035*amount, 0
        return -.045*amount, .025*amount, (.045 if clip == 'bug_attack' else -.035)*amount, 0
    if clip == 'takeoff':
        altitude = curve(t, ((0,0),(.18,-.12),(.42,.08),(.80,.52),(1,.52)))
        readiness = curve(t, ((0,0),(.65,1),(1,1)))
        return altitude, -.025*readiness, 0, readiness
    if clip == 'land':
        altitude = curve(t, ((0,.52),(.18,.52),(.70,0),(.82,-.12),(1,0)))
        readiness = curve(t, ((0,1),(.48,1),(1,0)))
        return altitude, -.025*readiness, 0, readiness
    if clip == 'hover':
        return .52+.025*math.sin(phase), -.025, .008*math.sin(phase), 1
    if clip == 'fly_forward':
        return .52+.016*math.sin(phase), .25, .012*math.sin(phase), 1
    raise RuntimeError(f'Unknown extended clip: {clip}')


def riding_pedal(side, t):
    """Use dimensions exported by the shared game bicycle's real geometry."""
    sign = 1 if side == 'L' else -1
    shape = CYCLING['blender']
    angle = CYCLING['crankOffset'] - math.tau * t * CYCLING['crankRevolutions'] + (math.pi if side == 'L' else 0)
    contact = Vector(shape['bottomBracket'])
    contact.x = sign * shape['pedalHalfSpan']
    contact.y -= shape['crankRadius'] * math.cos(angle)
    contact.z += shape['crankRadius'] * math.sin(angle) + shape['pedalHalfThickness']
    return contact, .035 * math.cos(angle)


def riding_pose(rig, t, soles):
    """Lock seat, palm and shoe-ball contacts while pedalling opposite cranks."""
    seat = Vector(CYCLING['blender']['saddleCenter'])
    pelvis = seat + Vector((0, 0, .162))
    d = {'root': Matrix.Translation(pelvis - Vector(base.JOINTS['hips'][0]))}
    d['hips'] = d['root']
    d['spine'] = d['hips'] @ base.local_edit('spine', R('X', .33))
    d['chest'] = d['spine'] @ base.local_edit('chest', R('X', .005 * math.sin(math.tau * t)))
    neck = Vector(base.JOINTS['neck'][0])
    d['neck'] = Matrix.Translation(d['chest'] @ neck - neck)
    d['head'] = d['neck']
    for side, sign in (('L', 1), ('R', -1)):
        pedal, pitch = riding_pedal(side, t)
        foot = f'foot.{side}'
        rest_ankle = Vector(base.JOINTS[foot][0])
        contact = Vector((sign * .32, -.19, float(soles[side][:, 2].min())))
        rotation = R('X', pitch)
        ankle = pedal - rotation @ (contact - rest_ankle)
        hip = d['hips'] @ Vector(base.JOINTS[f'thigh.{side}'][0])
        d.update(limb_target(hip, ankle, side))
        d[foot] = Matrix.Translation(ankle) @ rotation @ Matrix.Translation(-rest_ankle)
        d[f'toe.{side}'] = d[foot]

        upper, forearm, hand = (f'{part}.{side}' for part in ('upper_arm', 'forearm', 'hand'))
        shoulder = d['chest'] @ Vector(base.JOINTS[upper][0])
        grip = Vector(CYCLING['blender']['gripLeft' if side == 'L' else 'gripRight'])
        wrist = grip + Vector((0, .12, .07))
        tip = grip + Vector((0, -.08, -.07))
        elbow = two_bone_elbow(shoulder, wrist, side)
        d[f'clavicle.{side}'] = d['chest']
        d[upper] = base.segment_deform(upper, shoulder, elbow)
        d[forearm] = base.segment_deform(forearm, elbow, wrist)
        d[hand] = base.segment_deform(hand, wrist, tip)
        direction = (tip - wrist).normalized()
        palm = d[hand].to_quaternion() @ Vector((-sign, 0, 0))
        palm = (palm - direction * palm.dot(direction)).normalized()
        down = Vector((0, 0, -1))
        down = (down - direction * down.dot(direction)).normalized()
        roll = palm.rotation_difference(down).to_matrix().to_4x4()
        d[hand] = Matrix.Translation(wrist) @ roll @ Matrix.Translation(-wrist) @ d[hand]
    poses = {name: d[name] @ rig.data.bones[name].matrix_local for name in base.JOINTS}
    for name, (_, _, parent) in base.JOINTS.items():
        rest = rig.data.bones[name].matrix_local
        inherited = poses[parent] @ rig.data.bones[parent].matrix_local.inverted() @ rest if parent else rest
        rig.pose.bones[name].matrix_basis = inherited.inverted() @ poses[name]
    return keyboard_pose('ride', t, d['chest'])


def apply_pose(rig, clip, t, soles):
    if clip == 'ride':
        return riding_pose(rig, t, soles)
    if clip in ('idle', 'walk'):
        base.frame_pose(rig, clip, t, soles)
        bpy.context.view_layer.update()
        body = rig.pose.bones['chest'].matrix @ rig.data.bones['chest'].matrix_local.inverted()
        return keyboard_pose(clip, t, body)
    phase = math.tau * t
    z, lean, twist, flying = body_parameters(clip, t)
    d = {'root': Matrix.Translation((0,0,z))}
    d['hips'] = d['root'] @ base.local_edit('hips', R('Z', twist))
    d['spine'] = d['hips'] @ base.local_edit('spine', R('X', lean))
    d['chest'] = d['spine'] @ base.local_edit('chest', R('Z', -twist*1.25))
    if clip == 'keyboard_smash':
        shift = curve(t, ((0,0),(.22,-.04),(.30,-.08),(22/60,.09),(.48,.06),(.60,.08),(42/60,-.09),(.80,-.04),(1,0)))
        d['root'] = Matrix.Translation((shift,0,z))
        d['hips'] = d['root'] @ base.local_edit('hips',R('Z',twist*.38))
        d['spine'] = d['hips'] @ base.local_edit('spine',R('Z',twist*.62) @ R('X',lean))
        d['chest'] = d['spine']
    neck_origin = Vector(base.JOINTS['neck'][0])
    neck_position = d['chest'] @ neck_origin
    d['neck'] = Matrix.Translation(neck_position) @ R('X', lean*.28) @ Matrix.Translation(-neck_origin)
    if clip == 'keyboard_smash':
        d['neck'] = Matrix.Translation(neck_position) @ R('Z',twist*.28) @ R('X',lean*.28) @ Matrix.Translation(-neck_origin)
    d['head'] = d['neck']
    weapon = keyboard_pose(clip, t, d['chest'])
    for side, offset, sign in (('L',0,1),('R',.5,-1)):
        limb_phase = phase + offset*math.tau
        d[f'clavicle.{side}'] = d['chest']
        upper, forearm = f'upper_arm.{side}', f'forearm.{side}'
        if clip == 'run':
            swing, elbow, out = .76*math.cos(limb_phase-.10), -1.0+.18*math.cos(limb_phase), .035
        elif clip == 'sprint':
            swing, elbow, out = .94*math.cos(limb_phase-.10), -1.13+.16*math.cos(limb_phase), .045
        elif clip == 'jump':
            swing = curve(t, ((0,0),(.14,.30),(.32,-.90),(.52,-.52),(.78,-.25),(1,0)))
            elbow, out = -.14*math.sin(math.pi*t)**2, .15*math.sin(math.pi*t)**2
        else:
            swing, elbow, out = -.06*flying, -.12*flying, .24*flying
        d[upper] = d['chest'] @ base.local_edit(upper, R('X',swing) @ R('Y', -sign*out))
        d[forearm] = d[upper] @ base.local_edit(forearm, R('X', elbow))
        d[f'hand.{side}'] = d[forearm]
        if clip == 'keyboard_smash':
            smash_arm(d,side,t,weapon)
        elif clip in ATTACKS:
            attack_arm(d, side, clip, t, weapon)
        hip = d['hips'] @ Vector(base.JOINTS[f'thigh.{side}'][0])
        if clip in ('run', 'sprint'):
            ankle, foot_rotation = running_foot(t+offset, soles, side, clip == 'sprint')
        elif clip == 'jump':
            air = curve(t, ((0,0),(.20,0),(.32,1),(.62,1),(.79,0),(1,0)))
            clearance = max(0,z) + .14*air
            ankle, foot_rotation = sole_ankle(side,soles,.10*air,clearance,.16*air,sign*.025*air)
        elif flying > 0:
            air = min(1,max(0,z)/.20)
            clearance = max(0,z)+.08*flying*air
            ankle, foot_rotation = sole_ankle(side,soles,.10*flying*air,clearance,.13*flying*air,sign*.025*flying)
        else:
            ankle, foot_rotation = sole_ankle(side,soles,0,0,0)
        d.update(limb_target(hip,ankle,side))
        foot = f'foot.{side}'
        d[foot] = Matrix.Translation(ankle) @ foot_rotation @ Matrix.Translation(-Vector(base.JOINTS[foot][0]))
        d[f'toe.{side}'] = d[foot]
    settle = ease(t/.08)*ease((1-t)/.08) if clip in (*ATTACKS,'jump') else ease(t/.08) if clip == 'takeoff' else ease((1-t)/.08) if clip == 'land' else 1
    if settle < 1:
        d = {name: Matrix.Identity(4).lerp(value, settle) for name,value in d.items()}
        weapon = keyboard_pose(clip,t,d['chest'])
    poses = {name:d[name] @ rig.data.bones[name].matrix_local for name in base.JOINTS}
    for name, (_,_,parent) in base.JOINTS.items():
        rest = rig.data.bones[name].matrix_local
        inherited = poses[parent] @ rig.data.bones[parent].matrix_local.inverted() @ rest if parent else rest
        rig.pose.bones[name].matrix_basis = inherited.inverted() @ poses[name]
    return weapon


def linearize(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for key in fc.keyframe_points:
                        key.interpolation = 'LINEAR'


def bake(rig, ob, keyboard):
    rig.animation_data_create()
    keyboard.animation_data_create()
    keyboard.rotation_mode = 'QUATERNION'
    p = base.mesh_coordinates(ob.data)
    soles = {side:p[(p[:,0]*sign>.1)&(p[:,2]<.035)] for side,sign in (('L',1),('R',-1))}
    actions = {}
    for name,(frames,loop) in CLIPS.items():
        skeleton = bpy.data.actions.new(name)
        weapon_action = bpy.data.actions.new(name+'-keyboard')
        rig.animation_data.action = skeleton
        keyboard.animation_data.action = weapon_action
        previous = {}
        for frame in range(frames+1):
            weapon = apply_pose(rig,name,frame/frames,soles)
            keyboard.matrix_world = weapon
            for target in (*rig.pose.bones,keyboard):
                q = target.rotation_quaternion
                if target.name in previous and q.dot(previous[target.name])<0:
                    q.negate()
                previous[target.name] = q.copy()
                for prop in ('location','rotation_quaternion','scale'):
                    target.keyframe_insert(data_path=prop,frame=frame,group=target.name)
        for target,action in ((rig,skeleton),(keyboard,weapon_action)):
            linearize(action)
            track=target.animation_data.nla_tracks.new()
            track.name=name
            strip=track.strips.new(name,0,action)
            strip.action_frame_start,strip.action_frame_end=0,frames
            track.mute=True
            target.animation_data.action=None
        actions[name]=(skeleton,weapon_action)
    for bone in rig.pose.bones:
        bone.matrix_basis=Matrix.Identity(4)
    keyboard.matrix_world=keyboard_pose('idle',0,Matrix.Identity(4))
    bpy.context.scene.frame_set(0)
    return actions


def activate(rig, keyboard, actions, clip, frame):
    for target,action in zip((rig,keyboard),actions[clip]):
        target.animation_data.action=action
        target.animation_data.action_slot=action.slots[0]
    bpy.context.scene.frame_set(frame)


def inspect_motion(rig, ob, keyboard, actions, tier):
    original=base.mesh_coordinates(ob.data)
    sole=original[:,2]<.035
    report={}
    for clip,(frames,loop) in CLIPS.items():
        first=None
        minimum=100
        top=-100
        for frame in range(frames+1):
            activate(rig,keyboard,actions,clip,frame)
            evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh=evaluated.to_mesh()
            points=base.mesh_coordinates(mesh)
            evaluated.to_mesh_clear()
            if not np.isfinite(points).all():
                raise RuntimeError(f'{clip} frame {frame}: nonfinite skin coordinates')
            if first is None:
                first=points.copy()
            minimum=min(minimum,float(points[sole,2].min()))
            top=max(top,float(points[:,2].max()))
        endpoint=float(np.linalg.norm(points-first,axis=1).max())
        if loop and endpoint>.00001:
            raise RuntimeError(f'{clip}: loop endpoint drift {endpoint}')
        if minimum<-.002:
            raise RuntimeError(f'{clip}: foot penetrates floor {minimum}')
        report[clip]={'seconds':frames/FPS,'loop':loop,'minimumSoleZ':minimum,'maximumBodyZ':top,'endpointVertexDifference':endpoint}
    (EVIDENCE/f'{tier}-motion-report.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


def build(tier, preview, no_equipment):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE/f'grassy-rodin-refined-{tier}.blend'))
    bpy.context.preferences.filepaths.save_version=0
    ob=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    rig=base.make_rig()
    base.bind_surface(ob,rig)
    repair_arm_partition(ob)
    before=base.surface_hash(ob.data)
    reset_rig(rig)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    if no_equipment:
        keyboard=bpy.data.objects.new('KeyboardWeapon',None)
        bpy.context.collection.objects.link(keyboard)
        equipment=[keyboard]
    else:
        from equipment import build_equipment
        equipment=build_equipment(rig,tier)
        keyboard=next(o for o in equipment if o.name=='KeyboardWeapon')
    from face import build_eyelids
    eyelids=build_eyelids(ob,rig,tier)
    scene=bpy.context.scene
    scene.render.fps=FPS
    scene.frame_start,scene.frame_end=0,max(frames for frames, _ in CLIPS.values())
    actions=bake(rig,ob,keyboard)
    report=inspect_motion(rig,ob,keyboard,actions,tier) if tier=='game' else None
    for target in (rig,keyboard):
        target.animation_data.action=None
    for bone in rig.pose.bones:
        bone.matrix_basis=Matrix.Identity(4)
    keyboard.matrix_world=keyboard_pose('idle',0,Matrix.Identity(4))
    scene.frame_set(0)
    if before!=base.surface_hash(ob.data):
        raise RuntimeError('Animation changed the retained Rodin mesh or UV')
    bpy.ops.object.select_all(action='DESELECT')
    for target in (rig,ob,*equipment,*eyelids):
        target.select_set(True)
    bpy.context.view_layer.objects.active=rig
    glb=OUT/f'grassy-equipped-{tier}.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,
        export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,
        export_force_sampling=True,export_nla_strips=True,export_skins=True,export_all_influences=False,
        export_image_format='AUTO',export_lights=False,export_cameras=False)
    if preview:
        scene.cycles.device='CPU'
        scene.render.threads_mode,scene.render.threads='FIXED',3
        scene.render.resolution_percentage=75
        base.studio.FRAMES['action']=(1.82,4.15,800,900)
        for clip,frame in (('run',4),('run',10),('jump',7),('jump',22),('codex_attack',7),('codex_attack',24),('codex_attack',42),('bug_attack',30),('server_overload',68),('hover',18),('fly_forward',9),('land',29),('idle',0)):
            activate(rig,keyboard,actions,clip,frame)
            for view in ('hero','right'):
                base.studio.render(view,'action',EVIDENCE/f'{tier}-{clip}-{frame:02d}-{view}.png',16)
    activate(rig,keyboard,actions,'idle',0)
    if preview and not no_equipment:
        for view in ('front','right','left','back','hero'):
            base.studio.render(view,'full',OUT/f'render-{tier}-{view}.png',32)
    scene.frame_end=max(frames for frames, _ in CLIPS.values())
    blend=BLENDS/f'grassy-equipped-{tier}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    manifest={'tier':tier,'bones':len(rig.data.bones),'bodyTriangles':sum(len(p.vertices)-2 for p in ob.data.polygons),
        'equipmentTriangles':sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in equipment if obj.type=='MESH'),
        'effectSockets':[obj.name for obj in equipment if obj.name.startswith('fx_')],
        'equipped':not no_equipment,'phases':PHASES,'surfacePreserved':before==base.surface_hash(ob.data),'surfaceHash':before,'clips':{n:{'duration':f/FPS,'loop':l} for n,(f,l) in CLIPS.items()},
        'bytes':glb.stat().st_size,'glb':str(glb.relative_to(ROOT)),'blend':str(blend.relative_to(ROOT)), 'motion':report}
    (EVIDENCE/f'{tier}-export-report.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('FINAL_ASSET_READY',json.dumps(manifest),flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--tiers',nargs='+',choices=('game','detailed','light'),default=['game','detailed','light'])
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--no-equipment',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for directory in (BLENDS,OUT,EVIDENCE):
        directory.mkdir(parents=True,exist_ok=True)
    for tier in args.tiers:
        build(tier,args.preview,args.no_equipment)
    (OUT/'manifest.json').write_text(json.dumps({'height':3.1,'fps':FPS,'phases':PHASES,'flightRootHeight':.52,'jumpMaximumRootHeight':.62,'clips':{n:{'duration':f/FPS,'loop':l} for n,(f,l) in CLIPS.items()},
        'tiers':[json.loads(p.read_text()) for p in EVIDENCE.glob('*-export-report.json')]},indent=2)+'\n')


if __name__=='__main__':
    main()
