# The build resource picture (buildings-icon.svg): a claw hammer with a wooden handle and a dark
# iron head, like the user's old picture. Not a game model.
import math

from mathutils import Matrix, Vector

from build import TILE, Model


def build(variant=None):
    m = Model("hammer", seed=53)
    wood = m.material("Wood", (0.42, 0.18, 0.07), roughness=0.6)
    grip = m.material("Grip", (0.12, 0.05, 0.03), roughness=0.8)
    iron = m.material("Iron", (0.05, 0.05, 0.055), metallic=1.0, roughness=0.5)

    # the handle along z, the head on top
    m.cylinder(0.035, 0.6, (0, 0, 0.3), wood, radius2=0.028, segments=16, bevel=0.01)
    m.cylinder(0.04, 0.16, (0, 0, 0.08), grip, radius2=0.038, segments=16, bevel=0.01)
    head_z = 0.62
    m.box((0.12, 0.09, 0.1), (0.02, 0, head_z), iron, bevel=0.012)
    # the striking face: a short round block
    m.cylinder(0.05, 0.12, (0.13, 0, head_z), iron, rot=(0, math.pi / 2, 0), segments=18, bevel=0.01)
    # the claw: two prongs curving down and back
    for side in (-1, 1):
        points = [Vector((-0.04, side * 0.018, head_z + 0.02)), Vector((-0.12, side * 0.022, head_z + 0.01)),
                  Vector((-0.19, side * 0.026, head_z - 0.04)), Vector((-0.23, side * 0.03, head_z - 0.1))]
        m.tube(points, [0.032, 0.026, 0.018, 0.008], iron, segments=10)
    # seen from the side like the old picture: the head across the view, the handle slanting
    view = Vector((1, -1, 0)).normalized()
    m.transform(Matrix.Rotation(math.radians(45), 4, "Z"))
    m.transform(Matrix.Rotation(math.radians(-28), 4, view))
    m.transform(Matrix.Translation((0, 0, TILE)))
    return m
