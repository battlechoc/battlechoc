# Renders the favicon with Cycles: the logo's B in white chocolate on a rounded square of
# chocolate with milk and dark chocolate rays (the user's pick of 2026-10: "B3 als Schokostück",
# in the colours of the flat B3). Writes dev/icons/favicon.png; dev/icons.mjs makes favicon.png
# and favicon.ico of public from it. Headless, from apps/pwa:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P dev/blender/render_favicon.py
#
# dev/favicon-b.svg is the B of dev/logo-letters.svg (a bitmap there), traced with potrace. The
# light comes from dev/textures/sky.hdr (render_icons.py downloads it) and a sun from the upper
# left.
import math
import os

import addon_utils
import bmesh
import bpy
from mathutils import Vector

here = os.path.dirname(os.path.abspath(__file__))
pwa = os.path.normpath(os.path.join(here, "..", ".."))
LETTER = os.path.join(pwa, "dev", "favicon-b.svg")
HDR = os.path.join(pwa, "dev", "textures", "sky.hdr")
OUT = os.path.join(pwa, "dev", "icons", "favicon.png")

SIDE, HEIGHT = 1.9, 0.3  # the chocolate piece
RAYS, RAY_WIDTH = 16, 0.2  # rays and the angle (radians) of a light one
# linear albedo, darker than the flat B3's colours so that the lit render shows them: its rays
# (#a8703f) and the brown between them (#5e381f)
LIGHT = (0.207, 0.075, 0.012)
DARK = (0.051, 0.01, 0.001)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("cycles", default_set=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    preferences = bpy.context.preferences.addons["cycles"].preferences
    try:
        preferences.compute_device_type = "METAL"
        preferences.get_devices()
        for device in preferences.devices:
            device.use = True
        scene.cycles.device = "GPU"
    except TypeError:
        scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    world = bpy.data.worlds.new("Sky")
    scene.world = world
    world.use_nodes = True
    environment = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(HDR)
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Strength"].default_value = 0.5
    world.node_tree.links.new(environment.outputs["Color"], background.inputs["Color"])
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.0
    sun.data.angle = math.radians(10)
    # a light shines along its -Z: its Z points to where the light comes from
    sun.rotation_euler = Vector((-0.6, 0.8, 1.4)).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    return scene


def rays_material():
    """Light and dark chocolate in rays about the piece's middle, the light ones a little raised."""
    material = bpy.data.materials.new("Chocolate")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Coat Weight"].default_value = 0.25
    bsdf.inputs["Coat Roughness"].default_value = 0.15
    coordinates = nodes.new("ShaderNodeTexCoord")
    angle = nodes.new("ShaderNodeTexGradient")
    angle.gradient_type = "RADIAL"
    links.new(coordinates.outputs["Object"], angle.inputs["Vector"])
    times = nodes.new("ShaderNodeMath")
    times.operation = "MULTIPLY"
    times.inputs[1].default_value = RAYS
    links.new(angle.outputs["Fac"], times.inputs[0])
    fraction = nodes.new("ShaderNodeMath")
    fraction.operation = "FRACT"
    links.new(times.outputs[0], fraction.inputs[0])
    ray = nodes.new("ShaderNodeMath")
    ray.operation = "LESS_THAN"
    ray.inputs[1].default_value = RAY_WIDTH * RAYS / (2 * math.pi)
    links.new(fraction.outputs[0], ray.inputs[0])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*DARK, 1)
    mix.inputs[7].default_value = (*LIGHT, 1)
    links.new(ray.outputs[0], mix.inputs[0])
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.02
    links.new(ray.outputs[0], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def white_chocolate():
    material = bpy.data.materials.new("White Chocolate")
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.93, 0.87, 0.74, 1)
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Coat Weight"].default_value = 0.2
    bsdf.inputs["Subsurface Weight"].default_value = 0.1
    return material


def piece(material):
    """A rounded square slab of chocolate, its top edges rounded too."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(SIDE, SIDE, HEIGHT), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, HEIGHT / 2), verts=bm.verts)
    upright = [edge for edge in bm.edges if abs(edge.verts[0].co.z - edge.verts[1].co.z) > 0.01]
    bmesh.ops.bevel(bm, geom=upright, offset=0.32, segments=10, affect="EDGES", profile=0.5)
    top = [edge for edge in bm.edges if abs(edge.verts[0].co.z - edge.verts[1].co.z) < 0.01 and edge.verts[0].co.z > HEIGHT * 0.6]
    bmesh.ops.bevel(bm, geom=top, offset=0.07, segments=6, affect="EDGES", profile=0.5, clamp_overlap=True)
    mesh = bpy.data.meshes.new("Chocolate")
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new("Chocolate", mesh)
    obj.data.materials.append(material)
    bpy.context.scene.collection.objects.link(obj)


def letter(material, height=1.1, extrude=0.06, bevel=0.022):
    """The B, raised from the top of the piece."""
    addon_utils.enable("io_curve_svg", default_set=True)
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=LETTER)
    curves = [obj for obj in bpy.data.objects if obj not in before and obj.type == "CURVE"]
    for curve in curves:
        curve.data.dimensions = "2D"
        curve.data.fill_mode = "BOTH"
        curve.data.resolution_u = 24
    obj = curves[0]
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), 0))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), 0))
    scale = height / (high.y - low.y)
    # extrude and bevel are in the curve's own units
    obj.data.extrude = extrude / scale / obj.scale.x
    obj.data.bevel_depth = bevel / scale / obj.scale.x
    obj.data.bevel_resolution = 4
    obj.location = (obj.location - (low + high) / 2) * scale
    obj.scale = obj.scale * scale
    obj.location.z = HEIGHT + extrude
    obj.data.materials.clear()
    obj.data.materials.append(material)


def camera(scene, scale=2.3, tilt=12):
    """Orthographic, from the front and a little from below the top: the piece's edge shows."""
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    angle = math.radians(90 - tilt)
    direction = Vector((0, -math.cos(angle), math.sin(angle)))
    cam.location = direction * 10
    cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam


scene = setup_scene()
piece(rays_material())
letter(white_chocolate())
camera(scene)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("rendered favicon")
