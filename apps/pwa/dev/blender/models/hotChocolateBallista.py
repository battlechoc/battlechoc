# The hot chocolate ballista: a big mug of hot chocolate tilted like a mortar in an iron yoke on a
# wooden turntable, whipped cream and marshmallows on top. Aimed like the cannons.
import math

from mathutils import Matrix, Vector

from build import TILE, Model, aim
from models.cannon import AIM

TILT = math.radians(38)  # the mug leans this far from upright towards its target
MUG = 1.35  # the mug's size (the user wanted it bigger than the first 1.0)
PIVOT = Vector((0.0, 0.0, TILE + 0.4))
YOKE = 0.165 * MUG + 0.05  # the yoke's arms, either side of the mug


def build(variant=None):
    m = Model("hotChocolateBallista", seed=19)
    wood = m.material("Wood", (0.2, 0.09, 0.035))
    wood_dark = m.material("Wood Dark", (0.09, 0.04, 0.015))
    iron = m.material("Iron", (0.04, 0.04, 0.045), metallic=1.0, roughness=0.7)
    mug = m.material("Mug", (0.85, 0.78, 0.66))
    band = m.material("Mug Band", (0.5, 0.04, 0.03))
    chocolate = m.material("Hot Chocolate", (0.1, 0.04, 0.015), roughness=0.5)
    cream = m.material("Cream", (0.92, 0.9, 0.85), roughness=0.9)
    marshmallow = m.material("Marshmallow", (0.95, 0.82, 0.86))

    m.cylinder(0.38, 0.06, (0, 0, TILE + 0.03), wood, segments=32, bevel=0.012)
    m.ring((0, 0, TILE + 0.045), (0, 0, 1), 0.383, 0.012, iron, segments=40, minor=5)
    for k in range(8):
        angle = k * math.pi / 4 + math.pi / 8
        m.cylinder(0.012, 0.012, (math.cos(angle) * 0.34, math.sin(angle) * 0.34, TILE + 0.064), iron, segments=6)
    m.cylinder(0.1, 0.05, (0, 0, TILE + 0.085), wood_dark, segments=18, bevel=0.008)
    for side in (-1, 1):  # the yoke
        height = PIVOT.z - (TILE + 0.06)
        m.box((0.08, 0.04, height), (0, side * YOKE, TILE + 0.06 + height / 2), wood, bevel=0.006)
        m.box((0.086, 0.046, 0.022), (0, side * YOKE, TILE + 0.14), iron)

    # the mug, built upright around the pivot's origin at its first size, scaled, then tilted onto
    # the yoke; the handle at the back, out of the yoke's way
    faces = []
    faces += m.cylinder(0.165, 0.32, (0, 0, 0), mug, segments=28, bevel=0.012)
    faces += m.cylinder(0.168, 0.035, (0, 0, 0.09), band, segments=28)
    faces += m.cylinder(0.168, 0.012, (0, 0, 0.035), band, segments=28)
    faces += m.ring((0, 0, 0.16), (0, 0, 1), 0.153, 0.014, mug, segments=28, minor=6)
    faces += m.cylinder(0.142, 0.006, (0, 0, 0.163), chocolate, segments=24)
    faces += m.ring((-0.185, 0, -0.01), (0, 1, 0), 0.065, 0.02, mug, segments=16, minor=6)
    for at, scale in (((0.0, 0.0, 0.18), (0.09, 0.09, 0.035)), ((0.0, 0.0, 0.205), (0.06, 0.06, 0.03)), ((0.0, 0.0, 0.228), (0.03, 0.03, 0.025))):
        faces += m.blob(1.0, at, cream, scale=scale, subdivisions=2)
    for angle in (0.6, 2.4, 4.2):
        faces += m.cylinder(0.022, 0.03, (math.cos(angle) * 0.1, math.sin(angle) * 0.1, 0.175), marshmallow, rot=(0.4, 0.2, angle), segments=10, bevel=0.005)
    m.transform(Matrix.Translation(PIVOT) @ Matrix.Rotation(TILT, 4, "Y") @ Matrix.Scale(MUG, 4), faces)
    m.cylinder(0.028, 2 * YOKE + 0.04, PIVOT, iron, rot=(math.pi / 2, 0, 0), segments=10)

    aim(m, AIM)
    m.grow(1.15)
    return m
