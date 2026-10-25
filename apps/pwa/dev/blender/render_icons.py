# Renders the game's pictures of its models (palette icons, donut traps, the logo's tree, the app
# icon's tree …) with Cycles from the .blend sources: transparent background, the game's sky
# (dev/textures/sky.hdr, downloaded on first use) and a sun from the upper left, a soft shadow
# under the model, an orthographic camera 20° above the ground from the game's side, the picture
# mirrored like the old icons. Writes PNGs; dev/icons.mjs puts them into the SVGs and PNGs of
# public. Headless, from apps/pwa:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P dev/blender/render_icons.py -- \
#       [--out dev/icons] [--size 512] [--samples 128] [--tile] [--elevation 20] \
#       [--look NAME] [names]
#
# --tile puts every model on a chocolate tile, --elevation sets the camera's angle above the
# ground, --look one of LOOKS (colour handling and light); names are keys of ICONS.
import math
import os
import sys
import urllib.request

import addon_utils
import bpy
import numpy
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
    # the build progress donut: white glaze, chocolate sprinkles (the game tints it)
    "progress": {"Topping": (0.72, 0.69, 0.63), "Material.002": (0.06, 0.025, 0.01)},
}

# picture -> what it shows. copies: (offset, donut colours) for several donuts in one picture;
# hide: materials left out (the fountain's shield dome); tile: on a chocolate tile; turn: degrees
# the model turns about its upright axis; elevation: the camera's angle for this picture;
# mirror: False keeps the picture as rendered; shadow: False leaves out the shadow under it.
# (`name@degrees` on the command line tries another turn.)
# colour handling and light: view transform, contrast look, exposure, sky strength, sun strength.
# The old icons were deep and contrasty; the game's PBR Neutral with a bright sky made the
# chocolate light and flat.
LOOKS = {
    "neutral": ("Khronos PBR Neutral", "None", -0.35, 0.75, 1.8),
    "standard": ("Standard", "Medium High Contrast", -0.3, 0.35, 2.4),
    "contrast": ("Standard", "High Contrast", -0.45, 0.3, 2.6),
    "punchy": ("AgX", "AgX - Punchy", 0.0, 0.35, 2.6),
    "bright": ("Standard", "High Contrast", 0.15, 0.4, 2.4),
    "dark-chocolate": ("Standard", "High Contrast", 0.15, 0.4, 2.4),
    "punchy-bright": ("AgX", "AgX - Punchy", 0.45, 0.4, 2.6),
}
# the user's sheets of 2026-10-25: 20° and mirrored chosen; "dark-chocolate" (7) or "bright" (5)
# to be picked
LOOKS["default"] = LOOKS["dark-chocolate"]

ICONS = {
    "factory-icon": dict(model="factory"),
    "factory-extension-icon": dict(model="factoryExtension"),
    "cacao-tree-icon": dict(model="cacaotree"),
    "truffle-cannon-icon": dict(model="cannon"),
    "fruit-cannon-icon": dict(model="fruitCannon"),
    "ballista-icon": dict(model="hotChocolateBallista"),
    # looking to the lower right like the old icon, from a little higher so the eggs show
    "easter-bunny-icon": dict(model="spyingEasterBunny", turn=25, elevation=32),
    "fountain-icon": dict(model="chocolateFountain", hide=("Shield",)),
    "xmas-factory-icon": dict(model="xmasFactory"),
    "donut-factory-icon": dict(model="donutFactory"),
    # the cream as in the old icons: not mirrored, the icon on a piece of chocolate
    "cream-icon": dict(model="cream", tile=True, mirror=False),
    "cream": dict(model="cream", mirror=False),
    # donuts lie flat: seen from higher up
    "cream-donut-icon": dict(model="donut", copies=(((0, 0, 0), "white"),), elevation=50),
    "health-donut-icon": dict(model="donut", copies=(((0, 0, 0), "green"),), elevation=50),
    "stop-donut-icon": dict(model="donut", copies=(((0, 0, 0), "pink"),), elevation=50),
    "surprise-donut-icon": dict(model="donut", copies=(((0, 0, 0), "yellow"),), elevation=50),
    "portal-donut-icon": dict(model="donut", copies=(((-0.3, -0.3, 0), "blue"), ((0.3, 0.3, 0), "red")), elevation=50),
    # dev/icons.mjs cuts the ten progress-NN pictures from it
    "progress-donut": dict(model="donut", copies=(((0, 0, 0), "progress"),), elevation=70, shadow=False),
}

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
out = os.path.join(pwa, "dev", "icons")
size, samples, tile_all, elevation, names = 512, 128, False, 20.0, []
look = "dark-chocolate"
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
    elif arg == "--look":
        look = args.pop(0)
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


def paint(objects, colors, tone=0.8):
    """The donut colours, a little darker (`tone`): the icons' high contrast blew the bright
    glazes out to flat white and neon."""
    for obj in objects:
        for slot in obj.material_slots:
            # a second copy of a model comes with its materials renamed; Blender keeps the name
            # they had in their file
            source = slot.material.library_weak_reference
            base = source.id_name[2:] if source else slot.material.name
            if base in colors:
                slot.material = slot.material.copy()
                bsdf(slot.material).inputs["Base Color"].default_value = (*(c * tone for c in colors[base]), 1)


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
    view, contrast, exposure, sky, sun_strength = LOOKS[look]
    scene.view_settings.view_transform = view
    scene.view_settings.look = contrast
    scene.view_settings.exposure = exposure
    world = bpy.data.worlds.new("Sky")
    scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    environment = nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(HDR)
    background = next(node for node in nodes if node.type == "BACKGROUND")
    background.inputs["Strength"].default_value = sky
    links.new(environment.outputs["Color"], background.inputs["Color"])
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = sun_strength
    sun.data.angle = math.radians(12)
    # from the upper left in the mirrored picture (from the camera's right before mirroring):
    # light from the camera's side, like the game's, left white cream and snow flat
    sun.rotation_euler = (-Vector((-0.35, -1.0, 1.3))).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    return scene


def deepen_browns(objects, factor=0.5, saturate=1.15):
    """Darker, richer chocolate and wood: the old icons' browns were deep, the models' caramel."""
    done = set()
    for obj in objects:
        for slot in obj.material_slots:
            material = slot.material
            if material is None or material.name in done or not material.node_tree:
                continue
            done.add(material.name)
            node = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if node is None or node.inputs["Base Color"].is_linked:
                continue
            r, g, b, a = node.inputs["Base Color"].default_value
            top, low = max(r, g, b), min(r, g, b)
            brown = top == r and r > g > b and top > 0.03 and (top - low) / top > 0.55 and g / r < 0.75
            if brown:
                mean = (r + g + b) / 3
                r, g, b = (mean + (c - mean) * saturate for c in (r, g, b))
                node.inputs["Base Color"].default_value = (max(0, r) * factor, max(0, g) * factor, max(0, b) * factor, a)


def frame(scene, objects, hidden=(), margin=1.1, angle=None):
    """An orthographic camera looking from +x, -y like the game's, `angle` (or `elevation`) degrees
    above the ground, fitted to the objects (leaving out faces of the `hidden` materials)."""
    up_angle = math.radians(elevation if angle is None else angle)
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
            obj.rotation_euler.z += math.radians(spec.get("turn", 0))
        if colors:
            paint(copy, DONUTS[colors])
        objects += copy
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material and slot.material.name in spec.get("hide", ()):
                bsdf(slot.material).inputs["Alpha"].default_value = 0.0
    if look == "dark-chocolate":
        deepen_browns(objects)
    ground = TILE
    if spec.get("tile") or tile_all:
        # a flat piece of chocolate (the board tile, a third of its height), like the old icons
        tile = load("field")[0]
        tile.data.materials.clear()
        tile.data.materials.append(material("Tile", BROWN, 0.9))
        tile.scale.z = 0.35
        tile.location.z = TILE * (1 - tile.scale.z)
        objects.append(tile)
        ground = TILE - 0.6 * tile.scale.z  # the tile's bottom
    if spec.get("shadow", True):
        catcher = bpy.data.objects.new("Shadow", bpy.data.meshes.new("Shadow"))
        catcher.data.from_pydata([(-3, -3, ground), (3, -3, ground), (3, 3, ground), (-3, 3, ground)], [], [(0, 1, 2, 3)])
        catcher.is_shadow_catcher = True
        scene.collection.objects.link(catcher)
    frame(scene, objects, hidden=spec.get("hide", ()), angle=spec.get("elevation"))
    path = os.path.join(out, name + ".png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if spec.get("mirror", True):
        mirror(path)
    print(f"rendered {name}")


def mirror(path):
    """Flips the picture left to right: the old icons showed the models mirrored to the game."""
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = numpy.empty(width * height * 4, dtype=numpy.float32)
    image.pixels.foreach_get(pixels)
    image.pixels.foreach_set(pixels.reshape(height, width, 4)[:, ::-1].ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


for name in names or ICONS:
    base, _, turn = name.partition("@")
    spec = dict(ICONS[base], **({"turn": float(turn)} if turn else {}))
    render(name, spec)
