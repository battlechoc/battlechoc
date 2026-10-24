# Brings the .blend sources of the game models up to date and away from the faceted low-poly
# look, then saves them. Run it headless from apps/pwa, then export_models.py and
# `npm run models:optimize`:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P dev/blender/modernize_models.py -- [names]
#
# 1. Materials: setups of the old glTF exporter (the "glTF Metallic Roughness" node group,
#    Add/Mix/Emission shaders) become a Principled BSDF with the values of the shipped GLB in
#    public/models (read before it is replaced; run this before exporting). Every material is a
#    non-metal unless METALS says otherwise: the old exports were metallic where nothing is metal
#    (pink wheels, cream). White emission, a stand-in for light under the old dark fill, goes;
#    coloured emission (windows, fairy lights) stays.
# 2. Shading: smooth, with sharp edges where faces meet at more than SMOOTH_ANGLE.
# 3. Modifiers from RECIPES, kept live in the .blend (export applies them): a small bevel that
#    catches the light on hard edges, a subdivision level for round shapes. Running the script
#    again replaces them, so a recipe can be tuned and run again.
import json
import math
import os
import struct
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shared import SOURCES, smooth_by_angle  # noqa: E402

SMOOTH_ANGLE = 40

# (model, material) pairs that are metal; they reflect the sky
METALS = {
    ("cannon", "Material.001"),  # the barrel
    ("fruitCannon", "Material.001"),  # the barrel
    ("donutFactory", "Material.001"),  # the bucket
    ("xmasFactory", "Material.003"),  # the stove pipe
    ("spyingEasterBunny", "Material.006"),  # the binoculars
}
# rough metal reflects nothing but a grey sky; brushed is enough
METAL_ROUGHNESS = 0.45

# bevel: width in model units (a board cell is 1), only on edges sharper than SMOOTH_ANGLE;
# subdivide: Catmull-Clark levels (each level makes four times the triangles); smooth: False for
# no sharp edges at all. Models that stand on many cells at once (cream, donut traps, the board)
# stay light.
RECIPES = {
    "factory": {"bevel": 0.012},
    "factoryExtension": {"bevel": 0.012},
    "xmasFactory": {"bevel": 0.012},
    # (no bevel: on the sprinkles of its donut it made 50k triangles)
    "cannon": {"bevel": 0.006},
    "fruitCannon": {"bevel": 0.006},
    "cacaotree": {"subdivide": 1},
    "chocolateFountain": {"bevel": 0.012, "subdivide": 1},
    "hotChocolateBallista": {"bevel": 0.012, "subdivide": 1},
    "field": {"bevel": 0.04, "segments": 3},
    # the swirl's ridges are steeper than SMOOTH_ANGLE and came out as steps
    "cream": {"smooth": False},
    "creamAroundBuilding": {"smooth": False},
}
BEVEL = "Bevel (battlechoc)"
SUBDIVIDE = "Subdivision (battlechoc)"


def shipped_materials(name):
    """The materials of public/models/<name>.glb by name (its JSON chunk)."""
    path = os.path.join(pwa, "public", "models", name + ".glb")
    with open(path, "rb") as glb:
        glb.seek(12)
        length, _ = struct.unpack("<II", glb.read(8))
        gltf = json.loads(glb.read(length))
    return {material.get("name"): material for material in gltf.get("materials", [])}


def shader_of(material):
    tree = material.node_tree if material.use_nodes else None
    if not tree:
        return None
    outputs = [node for node in tree.nodes if node.type == "OUTPUT_MATERIAL" and node.is_active_output]
    links = [link for node in outputs for link in node.inputs["Surface"].links]
    return links[0].from_node if links else None


def neutral(color):
    top = max(color)
    return top > 0 and (top - min(color)) / top < 0.05


def rebuild(material, values):
    """A Principled BSDF with the glTF material's values."""
    pbr = values.get("pbrMetallicRoughness", {})
    base = pbr.get("baseColorFactor", [1, 1, 1, 1])
    roughness = pbr.get("roughnessFactor", 1.0)
    emissive = values.get("emissiveFactor", [0, 0, 0])
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (-300, 0)
    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*base[:3], 1)
    bsdf.inputs["Alpha"].default_value = base[3]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Emission Color"].default_value = (*emissive, 1)
    bsdf.inputs["Emission Strength"].default_value = 1.0 if any(emissive) else 0.0
    material.diffuse_color = (*base[:3], 1)
    return bsdf


def apply_policies(name, material, bsdf):
    metal = (name, material.name) in METALS
    bsdf.inputs["Metallic"].default_value = 1.0 if metal else 0.0
    if metal:
        roughness = bsdf.inputs["Roughness"]
        roughness.default_value = min(roughness.default_value, METAL_ROUGHNESS)
    emission = bsdf.inputs["Emission Color"].default_value[:3]
    if bsdf.inputs["Emission Strength"].default_value > 0 and neutral(emission):
        bsdf.inputs["Emission Strength"].default_value = 0.0


def set_modifiers(obj, recipe):
    for modifier in list(obj.modifiers):
        if modifier.name in (BEVEL, SUBDIVIDE):
            obj.modifiers.remove(modifier)
    if "bevel" in recipe:
        bevel = obj.modifiers.new(BEVEL, "BEVEL")
        bevel.width = recipe["bevel"]
        bevel.segments = recipe.get("segments", 2)
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(SMOOTH_ANGLE)
        bevel.harden_normals = "subdivide" not in recipe
        bevel.use_clamp_overlap = True
    if "subdivide" in recipe:
        subdivide = obj.modifiers.new(SUBDIVIDE, "SUBSURF")
        subdivide.levels = recipe["subdivide"]
        subdivide.render_levels = recipe["subdivide"]


here = os.path.dirname(os.path.abspath(__file__))
pwa = os.path.normpath(os.path.join(here, "..", ".."))
args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
# git keeps the old versions; no .blend1 files next to the sources
bpy.context.preferences.filepaths.save_version = 0

for name in args or SOURCES:
    shipped = shipped_materials(name)
    bpy.ops.wm.open_mainfile(filepath=os.path.join(pwa, "dev", "models", SOURCES[name]), load_ui=False)
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    meshes = [obj for obj in bpy.context.view_layer.objects if obj.type == "MESH" and obj.visible_get()]
    rebuilt = []
    for material in {slot.material for obj in meshes for slot in obj.material_slots if slot.material}:
        shader = shader_of(material)
        if shader is None or shader.type != "BSDF_PRINCIPLED":
            if material.name not in shipped:
                print(f"WARNING {name}: {material.name!r} is not in {name}.glb, left as it is")
                continue
            shader = rebuild(material, shipped[material.name])
            rebuilt.append(material.name)
        apply_policies(name, material, shader)
    recipe = RECIPES.get(name, {})
    for data in {obj.data for obj in meshes}:
        smooth_by_angle(data, math.radians(SMOOTH_ANGLE) if recipe.get("smooth", True) else None)
    for obj in meshes:
        set_modifiers(obj, recipe)
    bpy.ops.wm.save_mainfile()
    print(f"modernized {SOURCES[name]}: rebuilt {sorted(rebuilt) or 'no'} materials, recipe {recipe}")
