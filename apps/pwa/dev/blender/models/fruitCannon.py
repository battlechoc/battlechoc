# The fruit cannon: the cannon's carriage, but instead of a barrel a big fruit skewer lies on it,
# raised like the barrel, like the user's old fruit cannon: a thick wooden stick through a
# strawberry, kiwi and orange slices, grapes, a pineapple chunk and an apple, ready to be fired.
# A crate of fruit stands by the trail.
import math

from mathutils import Vector

from build import TILE, Model, aim
from models.cannon import AIM, BARREL_Z, TRUNNION, carriage_and_barrel, elevation, raise_barrel

ALONG_X = (0, math.pi / 2, 0)  # turns a cylinder's axis onto x


def build(variant=None):
    m = Model("fruitCannon", seed=9)
    carriage_and_barrel(m, variant, barrel=False)
    stick = m.material("Skewer", (0.55, 0.38, 0.2))
    # bright, fresh fruit (darker colours went almost black in the icons' contrasty light)
    strawberry = m.material("Strawberry", (0.75, 0.04, 0.04))
    leaf = m.material("Fruit Leaf", (0.06, 0.25, 0.03))
    kiwi = m.material("Kiwi", (0.3, 0.6, 0.06))
    kiwi_skin = m.material("Kiwi Skin", (0.32, 0.2, 0.08))
    kiwi_core = m.material("Kiwi Core", (0.62, 0.68, 0.32))
    orange = m.material("Orange", (0.9, 0.35, 0.03))
    orange_flesh = m.material("Orange Flesh", (0.95, 0.55, 0.08))
    grape = m.material("Grape", (0.32, 0.07, 0.42), roughness=0.4)
    pineapple = m.material("Pineapple", (0.95, 0.7, 0.1))
    apple = m.material("Apple", (0.4, 0.75, 0.08), roughness=0.5)
    # the carriage's materials (made by carriage_and_barrel), for the crate
    wood = m.material("Wood", (0.36, 0.17, 0.07))
    wood_dark = m.material("Wood Dark", (0.19, 0.085, 0.035))

    # the skewer along the level barrel's axis, raised like the barrel
    z = BARREL_Z
    skewer = []
    # the stick rests on the trunnions and the back transom
    skewer += m.cylinder(0.016, 0.78, (0.12, 0, z), stick, rot=ALONG_X, segments=10)
    skewer += m.sphere(0.022, (-0.27, 0, z), stick, segments=10, rings=7)
    skewer += m.cylinder(0.016, 0.05, (0.53, 0, z), stick, rot=ALONG_X, radius2=0.002, segments=10)
    # from the back to the tip: apple, orange slice, grapes, kiwi slice, pineapple, strawberry
    skewer += m.sphere(0.075, (-0.17, 0, z), apple, scale=(0.9, 1, 1), segments=16, rings=12)
    skewer += m.cylinder(0.005, 0.03, (-0.17, 0, z + 0.08), wood_dark, segments=6)
    skewer += m.cylinder(0.078, 0.03, (-0.06, 0, z), orange, rot=ALONG_X, segments=20)
    skewer += m.cylinder(0.07, 0.032, (-0.06, 0, z), orange_flesh, rot=ALONG_X, segments=20)
    for dy, dz in ((0.03, 0.03), (-0.03, 0.03), (0.0, -0.03), (0.035, -0.025), (-0.035, -0.025)):
        skewer += m.sphere(0.036, (0.03, dy, z + dz), grape, segments=12, rings=8)
    skewer += m.cylinder(0.07, 0.026, (0.12, 0, z), kiwi_skin, rot=ALONG_X, segments=20)
    skewer += m.cylinder(0.064, 0.028, (0.12, 0, z), kiwi, rot=ALONG_X, segments=20)
    skewer += m.cylinder(0.024, 0.03, (0.12, 0, z), kiwi_core, rot=ALONG_X, segments=12)
    skewer += m.box((0.1, 0.11, 0.11), (0.23, 0, z), pineapple, rot=(0.4, 0, 0), bevel=0.012)
    # the strawberry on the tip, point forward
    skewer += m.sphere(1.0, (0.37, 0, z), strawberry, scale=(0.09, 0.07, 0.07), segments=16, rings=12)
    skewer += m.cylinder(0.045, 0.012, (0.29, 0, z), leaf, rot=ALONG_X, radius2=0.012, segments=8)
    raise_barrel(m, skewer, elevation(variant))
    # a strap of iron holding the stick down on the trunnions
    m.cylinder(0.02, 0.17, TRUNNION + Vector((0, 0, 0.005)), wood_dark, rot=(math.pi / 2, 0, 0), segments=10)

    # a crate of fruit by the trail
    cx, cy = -0.24, 0.22
    m.box((0.13, 0.11, 0.07), (cx, cy, TILE + 0.035), wood, bevel=0.004)
    for dz in (0.02, 0.05):
        m.box((0.134, 0.114, 0.008), (cx, cy, TILE + dz), wood_dark)
    for (dx, dy), mat in (((-0.03, -0.022), orange), ((0.03, -0.02), orange), ((0.0, 0.025), apple), ((-0.035, 0.03), orange)):
        m.sphere(0.03, (cx + dx, cy + dy, TILE + 0.085), mat, segments=10, rings=7)

    aim(m, AIM)
    m.grow(1.25)
    return m
