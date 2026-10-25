# The chocolate fountain: the tiers of the user's model (dev/models/chocolateFountain.blend) on an
# even pot of brushed steel turned to the original's profile (the original pot had a control box
# that read as a grill), with a clear control module facing the camera, chocolate running over
# the rim, a plate with strawberries (some dipped) and marshmallow skewers. "Shield" (the shield's
# dome) stays as it is.
import math
import os

from mathutils import Vector

from build import TILE, Model

SMOOTH_ANGLE = 40
MODEL = os.path.join(os.path.dirname(__file__), "..", "..", "models", "chocolateFountain.blend")
CENTRE = Vector((-0.031, 0.059, 0.0))
# the pot's outside, measured on the original away from its control box: (radius, height)
POT = ((0.221, 0.365), (0.303, 0.76), (0.339, 0.815), (0.339, 0.92))
PLATE = TILE + 0.025


def pot_radius(z):
    for (r0, z0), (r1, z1) in zip(POT, POT[1:]):
        if z <= z1:
            return r0 + (r1 - r0) * max(0.0, z - z0) / (z1 - z0)
    return POT[-1][0]


def around(angle, radius, z):
    return CENTRE + Vector((math.cos(angle) * radius, math.sin(angle) * radius, z))


def build(variant=None):
    m = Model("chocolateFountain", seed=29)
    turn = 0.0
    # without the subdivision the modernisation gave it, and without the original's pot and its
    # buttons: an even steel pot instead
    m.include(MODEL, without=("Subdivision (battlechoc)",), leave_out=("Material.002", "Material.003"))
    # brushed steel: polished, the sky blew out into a white patch
    pot = m.material("Steel", (0.62, 0.62, 0.64), metallic=1.0, roughness=0.55)
    m.lathe(
        [(0.0, 0.36), (0.221, 0.36), *POT, (0.33, 0.93), (0.313, 0.922), (0.313, 0.86), (0.0, 0.86)],
        CENTRE,
        pot,
        segments=56,
    )
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
    # (angle in degrees, how far it runs down)
    # (not over the control module, which takes -60° to -15°)
    for degrees, length in ((-118, 0.1), (-80, 0.3), (-5, 0.06), (12, 0.21), (34, 0.14)):
        angle = math.radians(degrees) + turn
        out = Vector((math.cos(angle), math.sin(angle), 0))
        end = 0.92 - length
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

    control_module(m)

    # strawberries on the plate, every other one dipped
    for k in range(7):
        angle = k * math.tau / 7 + 0.2
        at = around(angle, 0.365, PLATE + 0.045)
        m.sphere(0.046, at, strawberry, scale=(1, 1, 1.2), segments=12, rings=8)
        for leaf_angle in range(5):  # the green calyx
            a = leaf_angle * math.tau / 5
            m.sphere(1.0, at + Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0.052)), leaf, scale=(0.022, 0.022, 0.006), rot=(0, 0, a), segments=6, rings=4)
        m.cylinder(0.005, 0.02, at + Vector((0, 0, 0.062)), leaf, segments=5)
        if k % 2:
            m.sphere(0.049, at + Vector((0, 0, -0.018)), dark, scale=(1, 1, 0.75), segments=12, rings=8)

    # two marshmallow skewers leaning against the pot on the visible sides
    for angle in (-1.45 + turn, 0.55 + turn):  # beside the control module, not in front of it
        foot = around(angle, 0.4, PLATE + 0.005)
        tip = around(angle, pot_radius(0.56) + 0.04, 0.58)
        m.tube([foot, tip], 0.005, stick, segments=5)
        for i, t in enumerate((0.5, 0.72, 0.94)):
            at = foot.lerp(tip, t)
            direction = (tip - foot).normalized()
            m.cylinder(0.034, 0.05, at, marshmallows[i % 2], rot=direction.to_track_quat("Z", "Y").to_euler(), segments=12, bevel=0.01)
    return m


def control_module(m, degrees=-37.5, z=0.59):
    """A clear face for the fountain's control module, as in the user's old icon: a dark rounded
    panel with a small display, two red buttons and a green light, over the box the original
    model has there (it faces `degrees`, towards the game's camera; its slanted buttons and an
    opening above them did not read as controls)."""
    panel = m.material("Control Panel", (0.08, 0.08, 0.09), metallic=1.0, roughness=0.5)
    button = m.material("Button Red", (0.6, 0.03, 0.02), roughness=0.35, emission=(1.0, 0.05, 0.03), strength=0.4)
    light = m.material("Light Green", (0.1, 0.8, 0.15), emission=(0.1, 1.0, 0.2), strength=2.0)
    a = math.radians(degrees)
    out = Vector((math.cos(a), math.sin(a), 0))
    right = Vector((-math.sin(a), math.cos(a), 0))
    turn = a + math.pi / 2  # turns a part's -y onto `out`
    face = m.surface(CENTRE + out * 1.0 + Vector((0, 0, z)), -out)

    def at(along, outwards, up):
        return face + right * along + out * outwards + Vector((0, 0, up))

    screen = m.material("Display", (0.02, 0.06, 0.03), roughness=0.2, emission=(0.2, 0.9, 0.3), strength=0.6)
    m.box((0.2, 0.03, 0.22), at(0, 0.006, 0), panel, rot=(0, 0, turn), bevel=0.016, segments=3)
    m.box((0.185, 0.006, 0.205), at(0, 0.022, 0), panel, rot=(0, 0, turn), bevel=0.01, segments=2)
    m.box((0.13, 0.006, 0.05), at(-0.01, 0.026, 0.06), screen, rot=(0, 0, turn), bevel=0.006)
    for along in (-0.045, 0.035):
        m.cylinder(0.028, 0.012, at(along, 0.026, -0.04), panel, rot=(math.pi / 2, 0, turn), segments=18)
        m.cylinder(0.022, 0.022, at(along, 0.034, -0.04), button, rot=(math.pi / 2, 0, turn), segments=18, bevel=0.006)
    m.sphere(0.009, at(0.072, 0.027, 0.06), light, segments=10, rings=7)
