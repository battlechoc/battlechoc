# What export_models.py and modernize_models.py share.
import bmesh

# The .blend source of each GLB in public/models
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
