# What export_models.py and modernize_models.py share.
import bmesh

# The .blend source of each GLB in public/models. Those in generated/ are built by code
# (dev/blender/models/<name>.py, generate_models.py) and need no modernising.
SOURCES = {
    "cacaotree": "generated/cacaotree.blend",
    "cannon": "generated/cannon.blend",
    "chocolateFountain": "generated/chocolateFountain.blend",
    "cream": "cream.blend",
    "creamAroundBuilding": "creamAroundBuilding.blend",
    "donut": "generated/donut.blend",
    "donutFactory": "generated/donutFactory.blend",
    "factory": "generated/factory.blend",
    "factoryExtension": "generated/factoryExtension.blend",
    "field": "field.blend",
    "fruitCannon": "generated/fruitCannon.blend",
    "hotChocolateBallista": "generated/hotChocolateBallista.blend",
    "spyingEasterBunny": "generated/spyingEasterBunny.blend",
    "xmasFactory": "generated/xmasFactory.blend",
}


def smooth_by_angle(mesh, angle):
    """Smooth faces, sharp edges where the faces meet at more than `angle` (radians). Edges that
    were marked sharp in Blender stay sharp, unless `angle` is None: then everything is smooth."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for edge in bm.edges:
        if angle is None:
            edge.smooth = True
        elif len(edge.link_faces) == 2 and edge.calc_face_angle(0) > angle:
            edge.smooth = False
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()
