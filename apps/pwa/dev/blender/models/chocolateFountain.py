# The chocolate fountain: the user's model (dev/models/chocolateFountain.blend) with chocolate
# running over the pot's rim, a plate under the pot with strawberries (some dipped) and
# marshmallow skewers. "Shield" (the shield's dome) stays as it is.
import math
import os

from mathutils import Vector

from build import TILE, Model

SMOOTH_ANGLE = 40
MODEL = os.path.join(os.path.dirname(__file__), "..", "..", "models", "chocolateFountain.blend")
CENTRE = Vector((-0.031, 0.059, 0.0))
# the pot's outside: (height, radius)
POT = ((0.359, 0.225), (0.47, 0.25), (0.6, 0.31), (0.75, 0.31), (0.86, 0.337), (0.924, 0.338))
PLATE = TILE + 0.025


def pot_radius(z):
    for (z0, r0), (z1, r1) in zip(POT, POT[1:]):
        if z <= z1:
            return r0 + (r1 - r0) * max(0.0, z - z0) / (z1 - z0)
    return POT[-1][1]


def around(angle, radius, z):
    return CENTRE + Vector((math.cos(angle) * radius, math.sin(angle) * radius, z))


def build(variant=None):
    m = Model("chocolateFountain", seed=29)
    m.include(MODEL)
    pot = m.materials["Material.002"][0]
    chocolate = m.material("Chocolate Drip", (0.41, 0.2, 0.06), roughness=0.5)
    porcelain = m.material("Plate", (0.85, 0.83, 0.8), roughness=0.6)
    strawberry = m.material("Strawberry", (0.55, 0.03, 0.03))
    leaf = m.material("Fruit Leaf", (0.06, 0.25, 0.03))
    dark = m.material("Dark Chocolate", (0.07, 0.03, 0.012), roughness=0.5)  # dipped strawberries
    stick = m.material("Skewer", (0.55, 0.38, 0.2))
    marshmallows = (m.material("Marshmallow", (0.95, 0.9, 0.86)), m.material("Marshmallow Pink", (0.95, 0.6, 0.7)))

    # a plate under the pot, and a foot in the pot's colour up to it
    m.cylinder(0.43, 0.022, (CENTRE.x, CENTRE.y, TILE + 0.011), porcelain, radius2=0.45, segments=40, bevel=0.006)
    m.ring((CENTRE.x, CENTRE.y, PLATE), (0, 0, 1), 0.44, 0.01, porcelain, segments=40, minor=5)
    m.cylinder(0.2, 0.36 - PLATE, (CENTRE.x, CENTRE.y, (0.36 + PLATE) / 2), pot, radius2=0.215, segments=24)

    # chocolate over the rim and running down the pot (not over the front decoration at -y),
    # lying on the pot's surface
    # only on the sides the camera faces (towards +x and -y): seen in profile at the back, a drip
    # over the rim stuck out like a handle
    for angle in (math.radians(a) for a in (-118, -55, -25, 5, 32)):
        out = Vector((math.cos(angle), math.sin(angle), 0))
        end = 0.92 - m.random.uniform(0.07, 0.22)
        # from the chocolate in the pot over the rim (found from above) and down its outside
        path = []
        for radius in (0.29, 0.325):
            hit = m.surface(around(angle, radius, 1.2), (0, 0, -1), offset=0.005)
            if hit is not None and hit.z > 0.85:
                path.append(hit)
        top = path[-1].z - 0.025 if path else 0.9
        for z in [top - (top - end) * t for t in (0.0, 0.35, 0.7, 1.0)]:
            hit = m.surface(around(angle, 0.8, z), -out, offset=0.006)
            if hit is not None:
                path.append(hit)
        m.tube(path, [0.02, 0.02] + [0.018 - 0.002 * i for i in range(len(path) - 2)], chocolate, segments=8)
        m.sphere(0.021, path[-1] + Vector((0, 0, -0.008)), chocolate, scale=(1, 1, 1.3), segments=8, rings=6)

    # strawberries on the plate, every other one dipped
    for k in range(8):
        angle = k * math.tau / 8 + 0.2
        at = around(angle, 0.355, PLATE + 0.03)
        m.sphere(0.03, at, strawberry, scale=(1, 1, 1.25), segments=10, rings=7)
        m.cylinder(0.024, 0.01, at + Vector((0, 0, 0.036)), leaf, radius2=0.006, segments=7)
        if k % 2:
            m.sphere(0.032, at + Vector((0, 0, -0.012)), dark, scale=(1, 1, 0.75), segments=10, rings=7)

    # two marshmallow skewers leaning against the pot on the visible sides
    for angle in (-0.9, 0.5):
        foot = around(angle, 0.4, PLATE + 0.005)
        tip = around(angle, pot_radius(0.56) + 0.04, 0.58)
        m.tube([foot, tip], 0.005, stick, segments=5)
        for i, t in enumerate((0.5, 0.72, 0.94)):
            at = foot.lerp(tip, t)
            direction = (tip - foot).normalized()
            m.cylinder(0.034, 0.05, at, marshmallows[i % 2], rot=direction.to_track_quat("Z", "Y").to_euler(), segments=12, bevel=0.01)
    return m
