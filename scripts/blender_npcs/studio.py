"""Neutral studio and five orthographic renders of the actual NPC geometry."""

from pathlib import Path

import bpy
from mathutils import Vector


def _set_enum(owner, property_name, value):
    options = owner.bl_rna.properties[property_name].enum_items.keys()
    if value not in options:
        raise ValueError(f"Blender {property_name} has no {value!r}; available: {list(options)}")
    setattr(owner, property_name, value)


def _aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_studio(height):
    """Call after capturing the export objects; returns the created camera."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    _set_enum(scene.render.image_settings, "file_format", "PNG")
    _set_enum(scene.render.image_settings, "color_mode", "RGBA")
    # Use a fixed sRGB view; the lighting below is calibrated against the references.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    world = bpy.data.worlds.new("NPC studio world")
    scene.world = world
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (.65, .65, .65, 1)
    background.inputs["Strength"].default_value = .12

    collection = bpy.data.collections.new("NPC Studio")
    scene.collection.children.link(collection)

    def move_to_studio(obj):
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)

    floor_mat = bpy.data.materials.new("NPC studio warm grey")
    floor_mat.use_nodes = True
    shader = next(node for node in floor_mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (.61, .60, .58, 1)
    shader.inputs["Roughness"].default_value = .87
    bpy.ops.mesh.primitive_plane_add(size=height * 200, location=(0, 0, -height * .005))
    floor = bpy.context.object
    floor.name = "NPC_Studio_Floor"
    floor.data.materials.append(floor_mat)
    move_to_studio(floor)

    for name, location, power, size in (
        ("Key", (-1.3, -1.6, 2.0), 70, 1.3),
        ("Fill", (1.3, -.8, 1.1), 20, 1.2),
        ("Rim", (.5, 1.2, 1.7), 70, 1.0),
    ):
        bpy.ops.object.light_add(type="AREA", location=tuple(axis * height for axis in location))
        light = bpy.context.object
        light.name = f"NPC_Studio_{name}"
        light.data.energy = power * height * height
        _set_enum(light.data, "shape", "DISK")
        light.data.size = size * height
        _aim(light, (0, 0, height * .52))
        move_to_studio(light)

    bpy.ops.object.camera_add(location=(height * 1.4, -height * 3, height * .95))
    camera = bpy.context.object
    camera.name = "NPC_Studio_Camera"
    _set_enum(camera.data, "type", "ORTHO")
    camera.data.ortho_scale = height * 1.20
    camera.data.clip_start = height * .001
    camera.data.clip_end = height * 250
    _aim(camera, (0, 0, height * .50))
    move_to_studio(camera)
    scene.camera = camera
    bpy.ops.object.select_all(action="DESELECT")
    return camera


def render_views(kind, height, outdir):
    """Render current pose; left/right refer to the character's anatomical sides."""
    directory = Path(outdir)
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    camera = scene.camera
    target = (0, 0, height * .50)
    camera.data.ortho_scale = height * 1.20
    paths = {}
    for name, position in {
        "front": (0, -3, .50),
        "back": (0, 3, .50),
        "left": (3, 0, .50),
        "right": (-3, 0, .50),
        "hero": (1.4, -3, .95),
    }.items():
        camera.location = tuple(axis * height for axis in position)
        _aim(camera, target)
        path = directory / f"render-{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths[name] = path
    return paths
