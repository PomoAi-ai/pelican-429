"""Bind the approved Rodin loadmaster surface to articulated mechanical joints.

Run with Blender --background --factory-startup --python this_file.py.
The source mesh and texture files remain untouched.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/blender_npcs"))
sys.dont_write_bytecode = True
from studio import setup_studio

SOURCE_DIR = ROOT / "assets/characters/enemies/loadmaster"
OUT = ROOT / "public/characters/enemies/loadmaster"
HEIGHT = 2.8
CLIPS = {"idle": 120, "move": 60, "skill1": 174, "skill2": 142, "hit": 30}


def coordinates(obj):
    result = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", result)
    return result.reshape(-1, 3)


def import_source(yaw):
    source = SOURCE_DIR / "rodin-original/source.glb"
    if not source.is_file():
        raise FileNotFoundError(f"Required approved Rodin source: {source}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise ValueError("Rodin loadmaster has no mesh")
    rotation = Matrix.Rotation(math.radians(yaw), 4, "Z")
    for obj in meshes:
        if not obj.data.uv_layers or not obj.data.materials:
            raise ValueError(f"Rodin source {obj.name} lacks UVs or materials")
        transform = rotation @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(transform)
    points = np.concatenate([coordinates(obj) for obj in meshes])
    lo, hi = points.min(0), points.max(0)
    if not np.isfinite(points).all() or hi[2] <= lo[2]:
        raise ValueError("Rodin loadmaster has invalid source bounds")
    scale = HEIGHT / (hi[2] - lo[2])
    base = points[points[:, 2] < lo[2] + (hi[2] - lo[2]) * .36]
    center = (base.min(0) + base.max(0)) / 2
    transform = Matrix.Scale(float(scale), 4) @ Matrix.Translation((-float(center[0]), -float(center[1]), -float(lo[2])))
    for obj in meshes:
        obj.data.transform(transform)
        obj.data.update()
    return meshes


def render_views(stem=""):
    scene = bpy.context.scene
    setup_studio(HEIGHT)
    scene.cycles.samples = 24
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    camera = scene.camera
    camera.data.ortho_scale = 4.0
    target = Vector((.20, 0, 1.4))
    for name, position in {"front": (9, 0, 1.4), "side": (.20, -9, 1.4),
                           "thumbnail": (6, -9, 4.4)}.items():
        camera.location = position
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(OUT / f"{stem}{name}.png")
        bpy.ops.render.render(write_still=True)


def build_rig():
    pivots = {
        "root": (0, 0, 0), "chassis": (0, 0, .75),
        "shoulder": (-.355, 0, 1.404), "elbow": (.833, 0, 2.396),
        "wrist": (1.333, 0, 1.90),
        "clamp_upper": (1.35, 0, 1.93), "clamp_lower": (1.35, 0, 1.85),
    }
    parents = {"chassis": "root", "shoulder": "chassis", "elbow": "shoulder",
               "wrist": "elbow", "clamp_upper": "wrist", "clamp_lower": "wrist"}
    for end, x in (("front", .903), ("rear", -.429)):
        for side, y in (("left", -.81), ("right", .81)):
            name = f"wheel_{end}_{side}"
            pivots[name] = (x, y, .465)
            parents[name] = "root"
    data = bpy.data.armatures.new("Loadmaster articulation")
    rig = bpy.data.objects.new("LoadmasterRig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, point in pivots.items():
        bone = data.edit_bones.new(name)
        bone.head = point
        # Global +Y is the hinge axis and the bone's local +Y.
        bone.tail = Vector(point) + Vector((0, .15, 0))
        if name != "root":
            bone.parent = data.edit_bones[parents[name]]
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    return rig, pivots


def smooth(a, b, values):
    t = np.clip((values - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def surface_parts(mesh):
    """Rodin splits mechanical panels at UV seams; keep each panel on its part."""
    parent = list(range(len(mesh.vertices)))
    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index
    for edge in mesh.edges:
        a, b = edge.vertices
        parent[find(a)] = find(b)
    parts = {}
    for index in range(len(parent)):
        parts.setdefault(find(index), []).append(index)
    return parts.values()


def bind(meshes, rig):
    names = [bone.name for bone in rig.data.bones]
    counts = {name: 0 for name in names}
    for obj in meshes:
        points = coordinates(obj)
        x, y, z = points.T
        weights = {name: np.zeros(len(points)) for name in names}
        arm = np.zeros(len(points))
        wheels = np.zeros(len(points), dtype=bool)
        for indices in surface_parts(obj.data):
            part = points[indices]
            lo, hi = part.min(0), part.max(0)
            if hi[2] > 1.30 and lo[0] > -.95 and np.abs(part[:, 1]).max() < .43:
                arm[indices] = 1
            elif hi[2] < .98 and np.abs(part[:, 1]).min() > .44:
                wheels[indices] = True
        elbow = smooth(-.045, .045, .69 * (x - .833) - .72 * (z - 2.396))
        elbow *= smooth(.55, .62, x)
        wrist = smooth(-.05, .05, .75 * (x - 1.333) - .66 * (z - 1.90))
        jaw = smooth(1.43, 1.50, x)
        weights["shoulder"] = arm * (1 - elbow)
        weights["elbow"] = arm * elbow * (1 - wrist)
        weights["wrist"] = arm * elbow * wrist * (1 - jaw)
        weights["clamp_upper"] = arm * elbow * wrist * jaw * (z >= 1.80)
        weights["clamp_lower"] = arm * elbow * wrist * jaw * (z < 1.80)
        remaining = 1 - arm
        for end, sign_x in (("front", 1), ("rear", -1)):
            for side, sign_y in (("left", -1), ("right", 1)):
                name = f"wheel_{end}_{side}"
                weights[name] = remaining * wheels * ((x - .237) * sign_x >= 0) * (y * sign_y >= 0)
        weights["chassis"] = remaining * ~wheels
        for name in names:
            group = obj.vertex_groups.new(name=name)
            indices = np.flatnonzero(weights[name] > 0)
            counts[name] += len(indices)
            for i in indices:
                group.add([int(i)], float(weights[name][i]), "REPLACE")
        obj.parent = rig
        modifier = obj.modifiers.new("Mechanical articulation", "ARMATURE")
        modifier.object = rig
    for name, count in counts.items():
        if name != "root" and count == 0:
            raise ValueError(f"No source vertices were assigned to {name}; remeasure the Rodin geometry")
    return counts


def bake_actions(rig):
    rig.animation_data_create()
    bpy.context.scene.render.fps = 60
    actions = {}
    for name, duration in CLIPS.items():
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in range(duration + 1):
            t = frame / duration
            bones = rig.pose.bones
            for bone in bones:
                bone.rotation_euler = (0, 0, 0)
            if name == "idle":
                bones["wrist"].rotation_euler.y = .018 * math.sin(t * math.tau)
                bones["clamp_upper"].rotation_euler.y = -.025 * math.sin(t * math.tau)
                bones["clamp_lower"].rotation_euler.y = .025 * math.sin(t * math.tau)
            elif name == "move":
                for bone in bones:
                    if bone.name.startswith("wheel_"):
                        bone.rotation_euler.y = -t * math.tau
                bones["shoulder"].rotation_euler.y = .022 * math.sin(t * math.tau * 2)
            elif name in ("skill1", "skill2"):
                if name == "skill1":
                    lift = float(smooth(0, 62 / duration, t))
                    release = float(smooth(65 / duration, 78 / duration, t))
                    restore = 1 - float(smooth(100 / duration, 1, t))
                    bones["shoulder"].rotation_euler.y = (-.30 * lift + 1.0 * release) * restore
                    bones["elbow"].rotation_euler.y = (-.45 * lift + .52 * release) * restore
                    bones["wrist"].rotation_euler.y = .30 * release * restore
                    clamp = lift * restore
                else:
                    charge = float(smooth(0, 45 / duration, t))
                    sweep = float(smooth(50 / duration, 65 / duration, t))
                    restore = 1 - float(smooth(85 / duration, 1, t))
                    bones["shoulder"].rotation_euler.y = (.30 * charge + .35 * sweep) * restore
                    bones["elbow"].rotation_euler.y = (.30 * charge - .90 * sweep) * restore
                    bones["wrist"].rotation_euler.y = .45 * sweep * restore
                    clamp = charge * restore
                bones["clamp_upper"].rotation_euler.y = .23 * clamp
                bones["clamp_lower"].rotation_euler.y = -.23 * clamp
            else:
                recoil = math.sin(math.pi * t) * (1 - t)
                bones["shoulder"].rotation_euler.y = -.12 * recoil
                bones["elbow"].rotation_euler.y = .16 * recoil
                bones["wrist"].rotation_euler.y = -.20 * recoil
            for bone in bones:
                bone.keyframe_insert(data_path="rotation_euler", frame=frame + 1, group=bone.name)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = "LINEAR"
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, action)
        track.mute = True
        actions[name] = action
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.rotation_euler = (0, 0, 0)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    return actions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yaw", type=float, default=90)
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    meshes = import_source(args.yaw)
    points = np.concatenate([coordinates(obj) for obj in meshes])
    print("NORMALIZED BOUNDS", points.min(0).tolist(), points.max(0).tolist())
    if args.inspect:
        render_views("source-")
        return
    rig, pivots = build_rig()
    counts = bind(meshes, rig)
    actions = bake_actions(rig)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [rig, *meshes]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(OUT / "model.glb"), export_format="GLB", use_selection=True,
                              export_yup=True, export_animations=True, export_animation_mode="ACTIONS",
                              export_force_sampling=True, export_anim_slide_to_zero=True,
                              export_skins=True, export_materials="EXPORT", export_apply=False)
    render_views()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / "loadmaster-rigged.blend"))
    report = {"height": HEIGHT, "forward": "+X", "sourceYawDegrees": args.yaw,
              "bounds": [points.min(0).tolist(), points.max(0).tolist()],
              "joints": pivots, "weightedVertices": counts,
              "clips": {name: frames / 60 for name, frames in CLIPS.items()},
              "triangles": sum(len(p.vertices) - 2 for obj in meshes for p in obj.data.polygons)}
    (SOURCE_DIR / "build-report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
