# The donut factory: the user's model (dev/models/donutFactory1.blend) with a riveted iron band round
# the bucket, a glowing porthole, a steam pipe on the lid, a stack of donut boxes and fresh donuts
# on a tray where the chute comes out.
import math
import os

from mathutils import Vector

from build import TILE, Model
from models.parts import donut

SMOOTH_ANGLE = 40
MODEL = os.path.join(os.path.dirname(__file__), "..", "..", "models", "donutFactory1.blend")
LID = 0.735


def build(variant=None):
    m = Model("donutFactory", seed=31)
    m.include(MODEL)
    iron = m.material("Iron", (0.06, 0.06, 0.065), metallic=1.0, roughness=0.6)
    glow = m.material("Glow", (0.9, 0.45, 0.1), emission=(1.0, 0.5, 0.12), strength=2.0)
    steam = m.material("Steam", (0.85, 0.85, 0.87), roughness=1.0)
    box = m.material("Donut Box", (0.85, 0.32, 0.45))
    label = m.material("Box Label", (0.9, 0.88, 0.84))
    dough = m.material("Dough", (0.7, 0.3, 0.07), roughness=0.8)
    glazes = [m.material(name, color, roughness=0.6) for name, color in (("Glaze Pink", (0.85, 0.2, 0.4)), ("Glaze Chocolate", (0.1, 0.04, 0.015)), ("Glaze White", (0.9, 0.88, 0.82)))]
    sprinkles = [m.material(name, color) for name, color in (("Sprinkle Yellow", (0.9, 0.7, 0.05)), ("Sprinkle Blue", (0.1, 0.3, 0.9)), ("Sprinkle Green", (0.1, 0.6, 0.15)))]

    # a riveted band round the top of the bucket (the user found one at the bottom too much)
    for z, radius in ((0.6, 0.289),):
        m.ring((0, 0, z), (0, 0, 1), radius, 0.011, iron, segments=36, minor=5)
        for k in range(12):
            angle = k * math.tau / 12
            m.sphere(0.009, (math.cos(angle) * (radius + 0.01), math.sin(angle) * (radius + 0.01), z), iron, segments=6, rings=4)

    # a glowing porthole on the left visible side (-y), away from the chute
    facing = Vector((0.25, -0.97, 0)).normalized()
    centre = facing * 0.276 + Vector((0, 0, 0.47))
    m.ring(centre, facing, 0.048, 0.012, iron, segments=18, minor=6)
    m.cylinder(0.044, 0.012, centre - facing * 0.003, glow, rot=facing.to_track_quat("Z", "Y").to_euler(), segments=18)
    for k in range(6):
        angle = k * math.tau / 6
        side = facing.cross(Vector((0, 0, 1))).normalized()
        m.sphere(0.006, centre + (side * math.cos(angle) + Vector((0, 0, math.sin(angle)))) * 0.06 + facing * 0.004, iron, segments=6, rings=4)

    # a steam pipe on the lid, a few puffs above it
    pipe = Vector((-0.17, -0.12, LID))
    m.cylinder(0.024, 0.13, pipe + Vector((0, 0, 0.05)), iron, segments=12)
    m.cylinder(0.032, 0.02, pipe + Vector((0, 0, 0.12)), iron, segments=12, bevel=0.004)
    for i, (dx, dz, radius) in enumerate(((0.0, 0.17, 0.03), (0.02, 0.22, 0.038), (0.045, 0.28, 0.03))):
        m.blob(radius, pipe + Vector((dx, -dx * 0.5, dz)), steam, subdivisions=2, noise=0.15)

    # a stack of donut boxes at the front right corner
    for i, (z, turn) in enumerate(((TILE + 0.03, 0.25), (TILE + 0.085, 0.5))):
        at = (0.32, -0.32, z)
        m.box((0.17, 0.17, 0.055), at, box, rot=(0, 0, turn), bevel=0.006)
        m.box((0.172, 0.06, 0.057), at, label, rot=(0, 0, turn))
    for i, (dx, dy) in enumerate(((-0.035, 0.0), (0.04, 0.02))):
        donut(m, (0.32 + dx, -0.32 + dy, TILE + 0.13), 0.035, 0.019, dough, glazes[i], sprinkles, count=8, flatten=0.85)

    # fresh donuts on a tray where the chute ends
    m.box((0.17, 0.12, 0.012), (-0.36, -0.34, TILE + 0.006), iron, rot=(0, 0, 0.5), bevel=0.003)
    for i, (dx, dy) in enumerate(((-0.04, -0.02), (0.04, 0.02))):
        donut(m, (-0.36 + dx, -0.34 + dy, TILE + 0.03), 0.035, 0.02, dough, glazes[(i + 1) % 3], sprinkles, count=8, flatten=0.85)
    return m
