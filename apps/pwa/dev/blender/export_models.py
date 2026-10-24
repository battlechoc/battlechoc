# Exports the game's models from their .blend sources (apps/pwa/dev/models) as GLB files. Run it
# headless from apps/pwa, then shrink the result with `npm run models:optimize`:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P dev/blender/export_models.py -- \
#       [--smooth 40] [--out public/models] [cannon factory ...]
#
# --smooth ANGLE  shades faces smooth where they meet at less than ANGLE degrees (sharper edges
#                 stay crisp); without it the models keep the flat shading of their .blend files
# --out DIR       where the GLBs go (default public/models)
# names           only these models (default: all of SOURCES)
#
# The exports leave out cameras and lamps (the game has its own light) and apply modifiers.
#
# Many sources still use material setups of the old glTF exporter (the "glTF Metallic Roughness"
# node group, Add/Mix shaders for emission). Today's exporter cannot read them and exports white or
# changed colours: the script warns about each one. Rebuild such a material as a Principled BSDF
# with the colours of the shipped GLB before exporting it.
# The game ignores object transforms (see src/3d/Gamefield.js), so the mesh itself must be the
# size of one board cell around the origin.
import math
import os
import sys

import bmesh
import bpy

# GLB name -> source file in dev/models
SOURCES = {
    "cacaotree": "cacaotree.blend",
    "cannon": "cannon.blend",
    "chocolateFountain": "chocolateFountain.blend",
    "cream": "cream.blend",
    "creamAroundBuilding": "creamAroundBuilding.blend",
    "donut": "donutBlue.blend",
    # donutFactory.blend holds the same model four times larger
    "donutFactory": "donutFactory1.blend",
    "factory": "factory.blend",
    "factoryExtension": "factory_extension.blend",
    "field": "field.blend",
    "fruitCannon": "fruitCannon.blend",
    "hotChocolateBallista": "HotChocolateBallista.blend",
    "spyingEasterBunny": "spyingEasterBunny.blend",
    "xmasFactory": "xmasFactory.blend",
}


def smooth_by_angle(mesh, angle):
    """Smooth faces, sharp edges where the faces meet at more than `angle` (radians). Edges that
    were marked sharp in Blender stay sharp."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > angle:
            edge.smooth = False
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()


here = os.path.dirname(os.path.abspath(__file__))
pwa = os.path.normpath(os.path.join(here, "..", ".."))
args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

smooth = None
out = os.path.join(pwa, "public", "models")
names = []
while args:
    arg = args.pop(0)
    if arg == "--smooth":
        smooth = float(args.pop(0))
    elif arg == "--out":
        out = os.path.abspath(args.pop(0))
    else:
        names.append(arg)
os.makedirs(out, exist_ok=True)

for name in names or SOURCES:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(pwa, "dev", "models", SOURCES[name]), load_ui=False)
    # some files were saved in edit mode, whose changes only reach the mesh in object mode
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    meshes = [obj for obj in bpy.context.view_layer.objects if obj.type == "MESH" and obj.visible_get()]
    if smooth is not None:
        for data in {obj.data for obj in meshes}:
            smooth_by_angle(data, math.radians(smooth))
    for material in {slot.material for obj in meshes for slot in obj.material_slots if slot.material}:
        tree = material.node_tree
        outputs = [node for node in tree.nodes if node.type == "OUTPUT_MATERIAL" and node.is_active_output] if tree else []
        shader = [link.from_node for node in outputs for link in node.inputs["Surface"].links]
        if not shader or shader[0].type not in ("BSDF_PRINCIPLED", "EMISSION"):
            kind = shader[0].type if shader else "no node tree"
            print(f"WARNING {name}: material {material.name!r} ends in {kind}, its colours will be wrong")
    target = os.path.join(out, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        use_visible=True,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
    )
    print(f"exported {name}.glb from {SOURCES[name]}" + (f", smooth below {smooth:g}°" if smooth else ""))
