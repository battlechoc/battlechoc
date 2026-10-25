# The rum truffle cannon as a classic field cannon: a wooden trail carriage with iron fittings on
# two spoked wheels with iron tyres, a barrel with reinforcing bands, a muzzle swell and a
# cascabel knob, and a small pyramid of chocolate truffles as its ammunition. Built with the muzzle
# along +x, then turned to point where the old model pointed (the game turns the opponent's
# cannons around). Variant "bronze" casts the barrel in bronze instead of iron.
import math

from mathutils import Vector

from build import TILE, Model, aim

# where the old model's muzzle pointed (its barrel axis)
AIM = Vector((-0.73, -0.683, 0.0))
WHEEL = 0.16
AXLE = Vector((0.04, 0.0, TILE + WHEEL))
TRACK = 0.17  # wheel distance from the middle


def build(variant=None):
    m = Model("cannon", seed=5)
    carriage_and_barrel(m, variant)
    truffle = m.material("Truffle", (0.07, 0.033, 0.014), roughness=0.95)
    for x, y, layer in ((-0.2, 0.21, 0), (-0.27, 0.21, 0), (-0.235, 0.27, 0), (-0.235, 0.233, 1)):
        m.sphere(0.035, (x, y, TILE + 0.035 + layer * 0.055), truffle, segments=10, rings=7)
    # point the muzzle where the old model's did, keep the cannon on its cell, fill it
    aim(m, AIM)
    m.grow(1.25)
    return m


def carriage_and_barrel(m, variant=None):
    """Wheels, carriage and barrel, muzzle along +x (the fruit cannon uses them too)."""
    wood = m.material("Wood", (0.2, 0.09, 0.035))
    wood_dark = m.material("Wood Dark", (0.09, 0.04, 0.015))
    iron = m.material("Iron", (0.04, 0.04, 0.045), metallic=1.0, roughness=0.7)
    if variant == "bronze":
        barrel = m.material("Bronze", (0.55, 0.32, 0.12), metallic=1.0, roughness=0.6)
    else:
        barrel = m.material("Barrel", (0.05, 0.05, 0.055), metallic=1.0, roughness=0.65)
    bore = m.material("Bore", (0.01, 0.01, 0.01), roughness=1.0)
    for side in (-1, 1):
        wheel(m, AXLE + Vector((0, side * TRACK, 0)), side, wood, wood_dark, iron)
    m.cylinder(0.018, 2 * TRACK, AXLE, iron, rot=(math.pi / 2, 0, 0), segments=10)
    carriage(m, wood, wood_dark, iron)
    cannon_barrel(m, barrel, bore)


def wheel(m, centre, side, wood, wood_dark, iron):
    axis = Vector((0, 1, 0))
    m.ring(centre, axis, WHEEL - 0.012, 0.014, wood, segments=24, minor=6)
    m.ring(centre, axis, WHEEL - 0.001, 0.008, iron, segments=24, minor=5)
    m.cylinder(0.036, 0.055, centre, wood_dark, rot=(math.pi / 2, 0, 0), segments=12, bevel=0.006)
    m.cylinder(0.022, 0.07, centre + Vector((0, side * 0.01, 0)), iron, rot=(math.pi / 2, 0, 0), segments=10)
    for k in range(12):
        angle = 2 * math.pi * k / 12
        direction = Vector((math.cos(angle), 0, math.sin(angle)))
        middle = centre + direction * (WHEEL / 2)
        m.box((WHEEL - 0.04, 0.012, 0.014), middle, wood, rot=(0, -angle, 0))


def carriage(m, wood, wood_dark, iron):
    """Two wedge-shaped cheeks from the trail on the ground up to the trunnions, tied by transoms."""
    front = Vector((0.12, 0.0, TILE + 0.215))
    back = Vector((-0.34, 0.0, TILE + 0.035))
    run = front - back
    angle = math.atan2(run.z, run.x)
    for side in (-1, 1):
        y = side * 0.085
        # the cheek gets taller towards the front, where it carries the barrel
        for t0, t1, height in ((0.0, 0.5, 0.07), (0.5, 1.0, 0.1)):
            a, b = back + run * t0, back + run * t1
            m.box(((b - a).length + 0.01, 0.03, height), (a + b) / 2 + Vector((0, y, (height - 0.07) / 2)), wood, rot=(0, -angle, 0), bevel=0.006)
        for t in (0.3, 0.72):  # iron bands round the cheeks
            band = back + run * t + Vector((0, y, 0.01 if t > 0.5 else 0))
            m.box((0.016, 0.034, 0.1 if t > 0.5 else 0.074), band, iron, rot=(0, -angle, 0))
    for t, height in ((0.88, 0.06), (0.45, 0.05)):
        m.box((0.05, 0.2, height), back + run * t, wood_dark, rot=(0, -angle, 0), bevel=0.005)
    m.box((0.06, 0.14, 0.05), back + Vector((0.02, 0, 0.0)), wood_dark, rot=(0, -angle, 0), bevel=0.008)


def cannon_barrel(m, barrel, bore):
    z = TILE + 0.3
    profile = (
        (-0.235, 0.0),
        (-0.232, 0.035),
        (-0.225, 0.064),
        (-0.205, 0.071),
        (-0.19, 0.066),
        (-0.17, 0.063),
        (0.03, 0.055),
        (0.045, 0.06),
        (0.06, 0.06),
        (0.075, 0.053),
        (0.33, 0.045),
        (0.345, 0.051),
        (0.385, 0.053),
        (0.4, 0.048),
        (0.4, 0.0),
    )
    points = [(x, 0.0, z) for x, _ in profile]
    radii = [max(radius, 0.002) for _, radius in profile]
    m.tube(points, radii, barrel, segments=16, caps=False)
    m.sphere(0.03, (-0.265, 0.0, z), barrel, segments=10, rings=7)
    m.cylinder(0.031, 0.004, (0.399, 0.0, z), bore, rot=(0, math.pi / 2, 0), segments=14)
    for side in (-1, 1):  # trunnions resting on the cheeks
        m.cylinder(0.02, 0.06, (0.03, side * 0.075, z - 0.02), barrel, rot=(math.pi / 2, 0, 0), segments=10)
