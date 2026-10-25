# The spying easter bunny: the user's model (dev/models/spyingEasterBunny.blend) with a red ribbon
# and a golden bell round its neck, grass in the nest and woven strands round the nest.
import math
import os

from mathutils import Vector

from build import Model

SMOOTH_ANGLE = 40
MODEL = os.path.join(os.path.dirname(__file__), "..", "..", "models", "spyingEasterBunny.blend")
NEST = Vector((-0.043, 0.008, 0.0))
VIEW = Vector((-0.54, -0.84, 0.0))
NECK = Vector((-0.13, -0.05, 0.8))


def build(variant=None):
    m = Model("spyingEasterBunny", seed=23)
    m.include(MODEL)
    ribbon = m.material("Ribbon", (0.55, 0.02, 0.03), roughness=0.6)
    gold = m.material("Gold", (0.8, 0.55, 0.15), metallic=1.0, roughness=0.45)
    strand = m.material("Straw", (0.5, 0.22, 0.05))
    grass = (m.material("Grass", (0.1, 0.32, 0.04), double_sided=True), m.material("Grass Light", (0.22, 0.48, 0.06), double_sided=True))

    # woven strands round the outside of the nest, lying on it (before anything else is added)
    for row, z in enumerate((0.385, 0.47, 0.555)):
        points = []
        for k in range(64):
            angle = k * math.tau / 64
            out = Vector((math.cos(angle), math.sin(angle), 0))
            wave = math.sin(angle * 14 + row * math.pi)
            hit = m.surface(NEST + out * 0.8 + Vector((0, 0, z + 0.01 * wave)), -out, offset=0.004)
            if hit is not None:
                points.append(hit)
        m.tube(points, 0.01, strand, segments=6, closed=True)

    # a red ribbon round the back and side of the neck (its front is behind the paws and the
    # binoculars), a bow and a golden bell on the visible side
    collar = []
    for k in range(22):
        angle = math.radians(-70 + k * 10)
        out = Vector((math.cos(angle), math.sin(angle), 0))
        hit = m.surface(NECK + out * 0.5, -out, offset=0.008)
        if hit is not None:
            collar.append(hit)
    m.tube(collar, 0.016, ribbon, segments=8)
    bow = collar[2]
    out = (bow - NECK).normalized()
    side = out.cross(Vector((0, 0, 1)))
    for s in (-1, 1):
        m.sphere(1.0, bow + side * s * 0.026 + out * 0.008, ribbon, scale=(0.028, 0.02, 0.018), segments=10, rings=7)
    m.sphere(0.014, bow + out * 0.012, ribbon, segments=8, rings=6)
    m.sphere(0.026, bow + out * 0.02 + Vector((0, 0, -0.035)), gold, segments=12, rings=8)

    # grass along the inner rim of the nest
    for i in range(120):
        angle = i * math.tau / 120 + m.random.uniform(-0.03, 0.03)
        out = Vector((math.cos(angle), math.sin(angle), 0))
        base = NEST + out * m.random.uniform(0.37, 0.42) + Vector((0, 0, 0.6))
        up = (out * m.random.uniform(0.2, 0.6) + Vector((0, 0, 1))).normalized()
        m.leaf(base, up, out, m.random.uniform(0.08, 0.14), 0.024, grass[i % 2], droop=0.45, fold=0.2)
    return m
