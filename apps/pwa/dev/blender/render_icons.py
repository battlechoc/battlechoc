# Renders the game's pictures of its models (palette icons, donut traps, the logo's tree, the app
# icon's tree …) with Cycles from the .blend sources: transparent background, the game's sky light
# (dev/textures/sky.hdr, downloaded on first use), a sun from the camera's side, a soft shadow
# under the model, Khronos PBR Neutral like the game. Writes PNGs; dev/icons.mjs puts them into
# the SVGs and PNGs of public. Headless, from apps/pwa:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P dev/blender/render_icons.py -- \
#       [--out dev/icons] [--size 512] [--samples 128] [--tile] [--elevation 35] [names]
#
# --tile puts every model on a chocolate tile, --elevation sets the camera's angle above the
# ground (the game's is 35°); names are keys of ICONS.
import math
import os
import sys
import urllib.request

import addon_utils
import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from shared import SOURCES  # noqa: E402

pwa = os.path.normpath(os.path.join(here, "..", ".."))
TILE = 0.26  # the top of a board tile; the models stand on it
HDR = os.path.join(pwa, "dev", "textures", "sky.hdr")
HDR_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr"
BROWN = (0.223, 0.0595, 0.0222)  # the brown board cell, #824529 in linear RGB

# the trap donuts' glaze ("Topping") and sprinkles ("Material.002"), as src/AssetLoader.jsx paints them
DONUTS = {
    "red": {"Topping": (0.8, 0.1208, 0.1208), "Material.002": (0.8, 0, 0.0104)},
    "blue": {"Topping": (0.3728, 0.6569, 0.8), "Material.002": (0.0351, 0.0017, 0.8)},
    "yellow": {"Topping": (0.9221, 1, 0), "Material.002": (0.3863, 0.393, 0.1622)},
    "pink": {"Topping": (1, 0.0805, 0.3398), "Material.002": (0.5813, 0, 0.1205)},
    "white": {"Topping": (0.8253, 0.9711, 1), "Material.002": (0.5641, 0.5813, 0.5813)},
    "green": {"Topping": (0.1078, 1, 0.0488), "Material.002": (0.0177, 0.5813, 0.0781)},
}

# picture -> what it shows. copies: (offset, donut colours) for several donuts in one picture;
# hide: materials left out (the fountain's shield dome); tile: on a chocolate tile
ICONS = {
    "factory-icon": dict(model="factory"),
    "factory-extension-icon": dict(model="factoryExtension"),
    "cacao-tree-icon": dict(model="cacaotree"),
    "truffle-cannon-icon": dict(model="cannon"),
    "fruit-cannon-icon": dict(model="fruitCannon"),
    "ballista-icon": dict(model="hotChocolateBallista"),
    "easter-bunny-icon": dict(model="spyingEasterBunny"),
    "fountain-icon": dict(model="chocolateFountain", hide=("Shield",)),
    "xmas-factory-icon": dict(model="xmasFactory"),
    "donut-factory-icon": dict(model="donutFactory"),
    "cream-icon": dict(model="cream"),
    "cream": dict(model="cream"),
    "cream-donut-icon": dict(model="donut", copies=(((0, 0, 0), "white"),)),
    "health-donut-icon": dict(model="donut", copies=(((0, 0, 0), "green"),)),
    "stop-donut-icon": dict(model="donut", copies=(((0, 0, 0), "pink"),)),
    "surprise-donut-icon": dict(model="donut", copies=(((0, 0, 0), "yellow"),)),
    "portal-donut-icon": dict(model="donut", copies=(((-0.33, 0.33, 0), "blue"), ((0.33, -0.33, 0), "red"))),
}

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
out = os.path.join(pwa, "dev", "icons")
size, samples, tile_all, elevation, names = 512, 128, False, 35.26, []
while args:
    arg = args.pop(0)
    if arg == "--out":
        out = os.path.abspath(args.pop(0))
    elif arg == "--size":
        size = int(args.pop(0))
    elif arg == "--samples":
        samples = int(args.pop(0))
    elif arg == "--tile":
        tile_all = True
    elif arg == "--elevation":
        elevation = float(args.pop(0))
    else:
        names.append(arg)
os.makedirs(out, exist_ok=True)
if not os.path.exists(HDR):
    os.makedirs(os.path.dirname(HDR), exist_ok=True)
    urllib.request.urlretrieve(HDR_URL, HDR)


def load(name):
    """The visible mesh objects of a model's .blend, linked into the scene."""
    with bpy.data.libraries.load(os.path.join(pwa, "dev", "models", SOURCES[name])) as (source, target):
        target.objects = list(source.objects)
    objects = [obj for obj in target.objects if obj is not None and obj.type == "MESH" and not obj.hide_render]
    for obj in objects:
        bpy.context.scene.collection.objects.link(obj)
    return objects


def bsdf(material):
    return next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")


def paint(objects, colors):
    for obj in objects:
        for slot in obj.material_slots:
            base = slot.material.name.split(".copy")[0]
            if base in colors:
                slot.material = slot.material.copy()
                bsdf(slot.material).inputs["Base Color"].default_value = (*colors[base], 1)


def material(name, color, roughness):
    made = bpy.data.materials.new(name)
    if made.node_tree is None:
        made.use_nodes = True
    node = bsdf(made)
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Specular IOR Level"].default_value = 0.25
    return made


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
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
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    # a little darker than the game: white cream and snow lost their shape
    scene.view_settings.exposure = -0.35
    world = bpy.data.worlds.new("Sky")
    scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    environment = nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(HDR)
    background = next(node for node in nodes if node.type == "BACKGROUND")
    background.inputs["Strength"].default_value = 0.75
    links.new(environment.outputs["Color"], background.inputs["Color"])
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 1.8
    sun.data.angle = math.radians(12)
    # from the upper left as the camera sees it (the camera looks along (-1, 1, -1)): light from
    # the camera's side, like the game's, left white cream and snow flat
    sun.rotation_euler = (-Vector((1.0, 0.35, -1.3))).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    return scene


def frame(scene, objects, hidden=(), margin=1.1):
    """An orthographic camera looking from +x, -y like the game's, `elevation` degrees above the
    ground, fitted to the objects (leaving out faces of the `hidden` materials)."""
    up_angle = math.radians(elevation)
    direction = Vector((math.cos(up_angle) / math.sqrt(2), -math.cos(up_angle) / math.sqrt(2), math.sin(up_angle)))
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.type = "ORTHO"
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(camera)
    scene.camera = camera
    bpy.context.view_layer.update()
    right = camera.matrix_world.to_3x3() @ Vector((1, 0, 0))
    up = camera.matrix_world.to_3x3() @ Vector((0, 1, 0))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        skip = {i for i, slot in enumerate(evaluated.material_slots) if slot.material and slot.material.name in hidden}
        used = {i for polygon in mesh.polygons if polygon.material_index not in skip for i in polygon.vertices}
        points += [obj.matrix_world @ mesh.vertices[i].co for i in used]
        evaluated.to_mesh_clear()
    xs = [point.dot(right) for point in points]
    ys = [point.dot(up) for point in points]
    centre = right * (min(xs) + max(xs)) / 2 + up * (min(ys) + max(ys)) / 2
    camera.location = centre + direction * 20
    camera.data.ortho_scale = max(max(xs) - min(xs), max(ys) - min(ys)) * margin
    camera.data.clip_end = 100


def render(name, spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("cycles", default_set=True)
    scene = setup_scene()
    objects = []
    for offset, colors in spec.get("copies", (((0, 0, 0), None),)):
        copy = load(spec["model"])
        for obj in copy:
            obj.location = Vector(offset)
        if colors:
            paint(copy, DONUTS[colors])
        objects += copy
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material and slot.material.name in spec.get("hide", ()):
                bsdf(slot.material).inputs["Alpha"].default_value = 0.0
    ground = TILE
    if spec.get("tile") or tile_all:
        tile = load("field")[0]
        tile.data.materials.clear()
        tile.data.materials.append(material("Tile", BROWN, 0.9))
        objects.append(tile)
        ground = -0.34  # the tile's bottom
    catcher = bpy.data.objects.new("Shadow", bpy.data.meshes.new("Shadow"))
    catcher.data.from_pydata([(-3, -3, ground), (3, -3, ground), (3, 3, ground), (-3, 3, ground)], [], [(0, 1, 2, 3)])
    catcher.is_shadow_catcher = True
    scene.collection.objects.link(catcher)
    frame(scene, objects, hidden=spec.get("hide", ()))
    scene.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)
    print(f"rendered {name}")


for name in names or ICONS:
    render(name, ICONS[name])
