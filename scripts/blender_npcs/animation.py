"""Aligned deformation skeletons and baked, in-place NPC action clips."""

import math

import bpy
from mathutils import Matrix, Quaternion, Vector


PROPORTIONS = {
    "sam": {"head": .654, "head_x": 0, "head_y": -.006 / 2.7, "shoulder": .605, "hips": .38, "elbow": .50,
            "wrist": .415, "knee": .22, "ankle": .075,
            "leg_x": .068, "shoulder_x": .1025, "elbow_x": .13325, "hand_x": .156825,
            "tail_y": .085, "tail_z": .385},
    "tibo": {"head": .672, "head_x": -.015 / 2.65, "head_y": .01 / 2.65,
             "shoulder": .624, "hips": .34, "elbow": .46,
             "wrist": .37, "knee": .195, "ankle": .075,
             "leg_x": .075, "shoulder_x": .125, "elbow_x": .175, "hand_x": .195},
}
CLIP_FRAMES = {"idle": 120, "walk": 36, "run": 24, "jump": 48, "greet": 90,
               "skill1": 72, "skill2": 90, "ultimate": 180}


def joint_positions(kind, height):
    """World-space pivots shared with the geometry's skin-weight assignment."""
    p = PROPORTIONS[kind]
    positions = {
        "root": (0, 0, 0),
        "hips": (0, 0, p["hips"]),
        "spine": (0, 0, p["hips"] + .07),
        "head": (p["head_x"], p["head_y"], p["head"]),
    }
    for side, sign in (("L", 1), ("R", -1)):
        positions.update({
            f"upper_arm.{side}": (sign * p["shoulder_x"], 0, p["shoulder"]),
            f"forearm.{side}": (sign * p["elbow_x"], -.005, p["elbow"]),
            f"hand.{side}": (sign * p["hand_x"], -.012, p["wrist"]),
            f"thigh.{side}": (sign * p["leg_x"], 0, p["hips"]),
            f"shin.{side}": (sign * p["leg_x"], -.005, p["knee"]),
            f"foot.{side}": (sign * p["leg_x"], 0, p["ankle"]),
        })
    if kind == "sam":
        positions["tail"] = (0, p["tail_y"], p["tail_z"])
    return {name: tuple(value * height for value in point)
            for name, point in positions.items()}


def build_armature(kind, height):
    """Z-up, facing -Y; every bone points +Z, with local Y as its long axis."""
    parents = {"hips": "root", "spine": "hips", "head": "spine", "tail": "hips"}
    for side in ("L", "R"):
        parents.update({
            f"upper_arm.{side}": "spine",
            f"forearm.{side}": f"upper_arm.{side}",
            f"hand.{side}": f"forearm.{side}",
            f"thigh.{side}": "hips",
            f"shin.{side}": f"thigh.{side}",
            f"foot.{side}": f"shin.{side}",
        })
    data = bpy.data.armatures.new(f"{kind.title()} skeleton")
    rig = bpy.data.objects.new(f"{kind.title()}Rig", data)
    bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, position in joint_positions(kind, height).items():
        bone = data.edit_bones.new(name)
        bone.head = position
        bone.tail = Vector(position) + Vector((0, 0, height * .045))
        bone.roll = 0
        if name != "root":
            bone.parent = data.edit_bones[parents[name]]
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    rig["character_height"] = height
    rig["character_kind"] = kind
    rig["walk_speed_tiles_per_second"] = height * .25
    rig.show_in_front = True
    rig.select_set(False)
    return rig


def _window(t, rise_end, fall_start):
    value = min(1, t / rise_end, (1 - t) / (1 - fall_start))
    return value * value * (3 - 2 * value)


def _pulse(t, start, end):
    if start < t < end:
        return math.sin(math.pi * (t - start) / (end - start)) ** 2
    return 0


def _idle(bones, phase, kind):
    breath = math.sin(phase)
    bones["spine"].rotation_euler.x = .024 * breath
    bones["spine"].scale.y = 1 + .010 * breath
    bones["head"].rotation_euler.y = .050 * math.sin(phase)
    bones["head"].rotation_euler.z = .024 * math.sin(phase * 2)
    for side, sign in (("L", 1), ("R", -1)):
        bones[f"upper_arm.{side}"].rotation_euler.z = sign * .028 * breath
    if kind == "sam":
        bones["tail"].rotation_euler.y = .045 * math.sin(phase)


def _walk(bones, phase, kind, height):
    # The pelvis stays below full leg extension so the planted-foot IK has room to bend.
    bones["root"].location.y = -height * (.028 + .005 * math.cos(phase * 2))
    bones["hips"].rotation_euler.y = .045 * math.sin(phase)
    bones["spine"].rotation_euler.y = -.032 * math.sin(phase)
    bones["head"].rotation_euler.z = .015 * math.sin(phase)
    for side, offset in (("L", 0), ("R", math.pi)):
        swing = math.sin(phase + offset)
        bones[f"upper_arm.{side}"].rotation_euler.x = .24 * swing
        bones[f"forearm.{side}"].rotation_euler.x = -.10 - .07 * max(0, swing) ** 2
    if kind == "sam":
        bones["tail"].rotation_euler.y = .07 * math.sin(phase)


def _smooth(a, b, value):
    t = max(0, min(1, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _foot_target(t, height, rest_ankle, sole):
    """The support shoe rolls on its measured sole and moves at a constant ground speed."""
    u = t % 1
    if u < .60:
        travel, lift = -.09 + .30 * u, 0
        pitch = -.10 * (1 - _smooth(0, .11, u)) + .14 * _smooth(.48, .60, u)
    else:
        v = (u - .60) / .40
        travel = .09 + .12 * v - .90 * v * v + .60 * v * v * v
        lift = .045 * math.sin(math.pi * v) ** 2
        pitch = .14 * (1 - v) - .10 * v
    relative_y = sole[:, 1] - rest_ankle.y
    relative_z = sole[:, 2] - rest_ankle.z
    lowest = float((relative_y * math.sin(pitch) + relative_z * math.cos(pitch)).min())
    ankle = rest_ankle.copy()
    ankle.y += travel * height
    ankle.z = -lowest + lift * height
    return ankle, Matrix.Rotation(pitch, 4, "X")


def _pose_legs(rig, kind, targets):
    """Bake two-bone IK into the existing pivot rig; no runtime constraints are exported."""
    height = rig["character_height"]
    joints = {name: Vector(point) for name, point in joint_positions(kind, height).items()}
    root_rest = rig.data.bones["root"].matrix_local
    hip_rest = rig.data.bones["hips"].matrix_local
    root_pose = root_rest @ rig.pose.bones["root"].matrix_basis
    hip_pose = root_pose @ root_rest.inverted() @ hip_rest @ rig.pose.bones["hips"].matrix_basis
    hip_deform = hip_pose @ hip_rest.inverted()
    for side in ("L", "R"):
        thigh, shin, foot = (f"{part}.{side}" for part in ("thigh", "shin", "foot"))
        hip = hip_deform @ joints[thigh]
        ankle, foot_rotation = targets[side]
        upper = (joints[shin] - joints[thigh]).length
        lower = (joints[foot] - joints[shin]).length
        direction = ankle - hip
        distance = direction.length
        if distance >= upper + lower:
            raise RuntimeError(f"{kind} {side}: leg target {distance:.6f} exceeds reach {upper + lower:.6f}")
        axis = direction.normalized()
        forward = Vector((0, -1, 0))
        bend = (forward - axis * forward.dot(axis)).normalized()
        along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
        knee = hip + axis * along + bend * math.sqrt(max(0, upper * upper - along * along))
        deforms = {}
        for name, rest_end, start, end in ((thigh, joints[shin], hip, knee),
                                            (shin, joints[foot], knee, ankle)):
            rotation = (rest_end - joints[name]).rotation_difference(end - start)
            deforms[name] = Matrix.Translation(start) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-joints[name])
        deforms[foot] = Matrix.Translation(ankle) @ foot_rotation @ Matrix.Translation(-joints[foot])
        poses = {name: transform @ rig.data.bones[name].matrix_local
                 for name, transform in deforms.items()}
        poses["hips"] = hip_pose
        for name in (thigh, shin, foot):
            bone = rig.data.bones[name]
            parent = bone.parent.name
            inherited = poses[parent] @ rig.data.bones[parent].matrix_local.inverted() @ bone.matrix_local
            rig.pose.bones[name].matrix_basis = inherited.inverted() @ poses[name]


def _run(bones, phase, kind, height):
    bones["root"].location.y = -height * (.052 + .009 * math.cos(phase * 2))
    bones["hips"].rotation_euler.y = .055 * math.sin(phase)
    bones["spine"].rotation_euler.x = .065
    bones["spine"].rotation_euler.y = -.05 * math.sin(phase)
    bones["head"].rotation_euler.x = -.045
    for side, offset in (("L", 0), ("R", math.pi)):
        swing = math.sin(phase + offset)
        bones[f"upper_arm.{side}"].rotation_euler.x = .48 * swing
        bones[f"forearm.{side}"].rotation_euler.x = -.70 - .10 * swing
    if kind == "sam":
        bones["tail"].rotation_euler.y = .12 * math.sin(phase)
        bones["tail"].rotation_euler.x = .06


def _run_foot_target(t, height, rest_ankle, sole):
    u = t % 1
    if u < .40:
        travel, lift = -.08 + .40 * u, 0
        pitch = -.12 + .34 * _smooth(.24, .40, u)
    else:
        v = (u - .40) / .60
        travel = .08 - .16 * _smooth(0, 1, v)
        lift = .08 * math.sin(math.pi * v) ** 2
        pitch = .22 * (1 - v) - .12 * v
    relative_y = sole[:, 1] - rest_ankle.y
    relative_z = sole[:, 2] - rest_ankle.z
    lowest = float((relative_y * math.sin(pitch) + relative_z * math.cos(pitch)).min())
    ankle = rest_ankle.copy()
    ankle.y += travel * height
    ankle.z = -lowest + lift * height
    return ankle, Matrix.Rotation(pitch, 4, "X")


def _locomotion_legs(rig, t, kind, soles, action):
    height = rig["character_height"]
    joints = joint_positions(kind, height)
    target = _foot_target if action == "walk" else _run_foot_target
    targets = {side: target(t + offset, height, Vector(joints[f"foot.{side}"]), soles[side])
               for side, offset in (("L", 0), ("R", .5))}
    _pose_legs(rig, kind, targets)


def _jump(rig, t, kind, soles):
    if t == 0 or t == 1:
        return
    bones, height = rig.pose.bones, rig["character_height"]
    crouch = _pulse(t, 0, .22) + .8 * _pulse(t, .72, 1)
    air = math.sin(math.pi * (t - .22) / .50) if .22 < t < .72 else 0
    lift, tuck = .22 * air, .04 * air
    bones["root"].location.y = height * (lift - .065 * crouch)
    bones["spine"].rotation_euler.x = .11 * crouch - .025 * air
    bones["head"].rotation_euler.x = -.075 * crouch
    for side, sign in (("L", 1), ("R", -1)):
        bones[f"upper_arm.{side}"].rotation_euler.x = .28 * crouch - .42 * air
        bones[f"upper_arm.{side}"].rotation_euler.z = sign * .06 * air
        bones[f"forearm.{side}"].rotation_euler.x = -.60 * air
    if kind == "sam":
        bones["tail"].rotation_euler.x = -.09 * air + .08 * crouch
    joints = joint_positions(kind, height)
    targets = {}
    for side in ("L", "R"):
        ankle = Vector(joints[f"foot.{side}"])
        ankle.z -= float(soles[side][:, 2].min())
        ankle.z += height * (lift + tuck)
        targets[side] = ankle, Matrix.Identity(4)
    _pose_legs(rig, kind, targets)


def _greet(bones, t, kind):
    raised = _window(t, .23, .77)
    wave = math.sin((t - .23) * math.tau * 3) * _window(t, .32, .66)
    bones["upper_arm.R"].rotation_euler.x = -.20 * raised
    bones["upper_arm.R"].rotation_euler.z = -.10 * raised
    bones["forearm.R"].rotation_euler.x = -1.35 * raised
    bones["forearm.R"].rotation_euler.z = .06 * wave
    bones["hand.R"].rotation_euler.z = .25 * wave
    bones["hand.R"].rotation_euler.x = -.45 * raised
    bones["hand.R"].rotation_euler.y = -.16 * raised
    bones["head"].rotation_euler.z = -.045 * raised
    bones["head"].rotation_euler.x = .025 * raised
    if kind == "sam":
        bones["tail"].rotation_euler.y = .06 * raised * math.sin(t * math.tau)


def _route(bones, t):
    raised = _window(t, .20, .80)
    left = _pulse(t, .25, .50)
    right = _pulse(t, .52, .77)
    for side, sign, choice in (("L", 1, left), ("R", -1, right)):
        bones[f"upper_arm.{side}"].rotation_euler.x = -.35 * raised
        bones[f"upper_arm.{side}"].rotation_euler.z = -sign * .15 * raised
        bones[f"forearm.{side}"].rotation_euler.x = -1.10 * raised - .14 * choice
        bones[f"forearm.{side}"].rotation_euler.z = sign * .12 * choice
        bones[f"hand.{side}"].rotation_euler.y = sign * .20 * raised
        bones[f"hand.{side}"].rotation_euler.x = -.20 * raised - .16 * choice
    bones["head"].rotation_euler.y = .09 * (left - right)
    bones["head"].rotation_euler.x = .035 * raised
    bones["tail"].rotation_euler.y = .045 * raised * math.sin(t * math.tau)


def _compute(bones, t):
    raised = _window(t, .24, .78)
    push = _pulse(t, .32, .62)
    for side, sign in (("L", 1), ("R", -1)):
        bones[f"upper_arm.{side}"].rotation_euler.x = -.25 * raised - .15 * push
        bones[f"upper_arm.{side}"].rotation_euler.z = -sign * .11 * raised
        bones[f"forearm.{side}"].rotation_euler.x = -1.20 * raised + .35 * push
        bones[f"hand.{side}"].rotation_euler.y = sign * .23 * raised
        bones[f"hand.{side}"].rotation_euler.x = -.20 * raised
    bones["head"].rotation_euler.x = .06 * raised - .08 * push
    bones["tail"].rotation_euler.y = .07 * raised * math.sin(t * math.tau)


def _taunt(bones, t):
    raised = _window(t, .24, .77)
    flick = _pulse(t, .32, .48)
    bones["upper_arm.R"].rotation_euler.x = -.23 * raised
    bones["upper_arm.R"].rotation_euler.z = -.15 * raised
    bones["forearm.R"].rotation_euler.x = -1.35 * raised
    bones["forearm.R"].rotation_euler.z = -.09 * flick
    bones["hand.R"].rotation_euler.x = -.40 * raised
    bones["hand.R"].rotation_euler.z = -.25 * raised + .38 * flick
    bones["upper_arm.L"].rotation_euler.z = .08 * raised
    bones["head"].rotation_euler.z = .09 * raised
    bones["head"].rotation_euler.x = -.055 * raised


def _ultimate(bones, t, kind, height):
    raised = _window(t, .34, .64)
    release = _pulse(t, .42, .64)
    if kind == "sam":
        hover = _pulse(t, .23, .72)
        bones["root"].location.y = height * .055 * hover
        for side, sign in (("L", 1), ("R", -1)):
            bones[f"upper_arm.{side}"].rotation_euler.x = -.28 * raised
            bones[f"upper_arm.{side}"].rotation_euler.z = sign * .14 * raised
            bones[f"forearm.{side}"].rotation_euler.x = -1.32 * raised
            bones[f"hand.{side}"].rotation_euler.x = -.14 * raised
            bones[f"hand.{side}"].rotation_euler.y = sign * .25 * raised
        bones["head"].rotation_euler.x = -.13 * raised
        bones["tail"].rotation_euler.y = .10 * raised * math.sin(t * math.tau)
    else:
        # Raising then pressing gives the reset gesture distinct anticipation and impact.
        press = _smooth(.40, .47, t) * (1 - _smooth(.65, .84, t))
        bones["upper_arm.L"].rotation_euler.x = -.25 * raised + .08 * press
        bones["forearm.L"].rotation_euler.x = -1.40 * raised + .70 * press
        bones["hand.L"].rotation_euler.x = -.32 * raised
        bones["upper_arm.R"].rotation_euler.x = -.18 * raised
        bones["forearm.R"].rotation_euler.x = -.28 * raised
        bones["head"].rotation_euler.x = -.08 * raised + .16 * release
        bones["head"].rotation_euler.z = -.055 * _pulse(t, .64, .94)


def _reset_paw(rig, t):
    """Keep the reset gesture outside the chest with an outward elbow and a badge target."""
    raised = _window(t, .20, .80)
    if raised == 0:
        return
    height = rig["character_height"]
    joints = {name: Vector(point) for name, point in joint_positions("tibo", height).items()}
    upper, forearm, hand = "upper_arm.L", "forearm.L", "hand.L"
    shoulder, elbow_rest, wrist_rest = (joints[name] for name in (upper, forearm, hand))
    press = _pulse(t, .42, .63)
    wrist_goal = Vector((.11, -.155 + .003 * press, .54)) * height
    wrist = wrist_rest.lerp(wrist_goal, raised)
    a, b = (elbow_rest - shoulder).length, (wrist_rest - elbow_rest).length
    axis = (wrist - shoulder).normalized()
    distance = (wrist - shoulder).length
    along = (a * a - b * b + distance * distance) / (2 * distance)
    rest_bend = (elbow_rest - shoulder) - axis * (elbow_rest - shoulder).dot(axis)
    pole = rest_bend.normalized().lerp(Vector((1, -.2, -.5)).normalized(), raised)
    bend = (pole - axis * pole.dot(axis)).normalized()
    elbow = shoulder + axis * along + bend * math.sqrt(max(0, a * a - along * along))
    deforms = {}
    for name, rest_end, start, end in ((upper, elbow_rest, shoulder, elbow),
                                      (forearm, wrist_rest, elbow, wrist)):
        rotation = (rest_end - joints[name]).rotation_difference(end - start)
        deforms[name] = Matrix.Translation(start) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-joints[name])
    neutral_palm = Vector((.010, -.013, -.035))
    target_palm = Vector((-.028, .010, .030))
    rotation = Quaternion().slerp(neutral_palm.rotation_difference(target_palm), raised)
    deforms[hand] = Matrix.Translation(wrist) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-wrist_rest)
    poses = {name: transform @ rig.data.bones[name].matrix_local for name, transform in deforms.items()}
    poses["spine"] = rig.data.bones["spine"].matrix_local
    for name in (upper, forearm, hand):
        bone = rig.data.bones[name]
        parent = bone.parent.name
        inherited = poses[parent] @ rig.data.bones[parent].matrix_local.inverted() @ bone.matrix_local
        rig.pose.bones[name].matrix_basis = inherited.inverted() @ poses[name]


def bake_actions(rig, kind, soles):
    """Return actions with exact clip names and muted NLA tracks for GLB export."""
    rig.animation_data_create()
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = max(CLIP_FRAMES.values()) + 1
    actions = {}
    bones = rig.pose.bones
    for name, duration in CLIP_FRAMES.items():
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(1, duration + 2):
            t = (frame - 1) / duration
            for bone in bones:
                bone.location = (0, 0, 0)
                bone.rotation_euler = (0, 0, 0)
                bone.scale = (1, 1, 1)
            if name == "idle":
                _idle(bones, t * math.tau, kind)
            elif name == "walk":
                _walk(bones, t * math.tau, kind, rig["character_height"])
                _locomotion_legs(rig, t, kind, soles, "walk")
            elif name == "run":
                _run(bones, t * math.tau, kind, rig["character_height"])
                _locomotion_legs(rig, t, kind, soles, "run")
            elif name == "jump":
                _jump(rig, t, kind, soles)
            elif name == "greet":
                _greet(bones, t, kind)
            elif name == "skill1":
                if kind == "sam":
                    _route(bones, t)
                else:
                    _taunt(bones, t)
            elif name == "skill2":
                if kind == "sam":
                    _compute(bones, t)
                else:
                    _reset_paw(rig, t)
                    bones["head"].rotation_euler.x = .11 * _window(t, .20, .80) - .03 * _pulse(t, .42, .63)
            elif name == "ultimate":
                _ultimate(bones, t, kind, rig["character_height"])
            for bone in bones:
                for path in ("location", "rotation_euler", "scale"):
                    bone.keyframe_insert(data_path=path, frame=frame, group=bone.name)
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for curve in channelbag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = "LINEAR"
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.action_frame_start = 1
        strip.action_frame_end = duration + 1
        track.mute = True
        actions[name] = action
    rig.animation_data.action = None
    scene.frame_set(1)
    for bone in bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    return actions
