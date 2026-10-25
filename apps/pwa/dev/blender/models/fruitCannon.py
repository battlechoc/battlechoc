# The fruit cannon: the cannon's carriage and barrel, loaded with a fruit skewer that sticks out of
# the muzzle (strawberry, kiwi and orange slices, a grape, a pineapple chunk), and a crate of fruit
# where the cannon keeps its truffles.
import math

from build import TILE, Model, aim
from models.cannon import AIM, BARREL_Z, carriage_and_barrel, raise_barrel

AXIS_Z = BARREL_Z
ALONG_X = (0, math.pi / 2, 0)  # turns a cylinder's axis onto x


def build(variant=None):
    m = Model("fruitCannon", seed=9)
    carriage_and_barrel(m)
    stick = m.material("Skewer", (0.55, 0.38, 0.2))
    strawberry = m.material("Strawberry", (0.55, 0.03, 0.03))
    leaf = m.material("Fruit Leaf", (0.06, 0.25, 0.03))
    kiwi = m.material("Kiwi", (0.22, 0.42, 0.04))
    kiwi_core = m.material("Kiwi Core", (0.62, 0.68, 0.32))
    orange = m.material("Orange", (0.8, 0.28, 0.02))
    grape = m.material("Grape", (0.18, 0.03, 0.22))
    pineapple = m.material("Pineapple", (0.8, 0.55, 0.06))
    wood = m.material("Wood", (0.2, 0.09, 0.035))
    wood_dark = m.material("Wood Dark", (0.09, 0.04, 0.015))
    apple = m.material("Apple", (0.6, 0.06, 0.03))

    # the skewer, built along the level barrel and raised with it
    skewer = m.cylinder(0.006, 0.43, (0.515, 0, AXIS_Z), stick, rot=ALONG_X, segments=6)
    skewer += m.sphere(0.042, (0.45, 0, AXIS_Z), strawberry, scale=(1.25, 1, 1), segments=10, rings=7)
    skewer += m.cylinder(0.035, 0.012, (0.4, 0, AXIS_Z), leaf, rot=ALONG_X, radius2=0.01, segments=7)
    skewer += m.cylinder(0.045, 0.016, (0.52, 0, AXIS_Z), kiwi, rot=ALONG_X, segments=14)
    skewer += m.cylinder(0.018, 0.018, (0.52, 0, AXIS_Z), kiwi_core, rot=ALONG_X, segments=10)
    skewer += m.cylinder(0.05, 0.016, (0.58, 0, AXIS_Z), orange, rot=ALONG_X, segments=14)
    skewer += m.sphere(0.03, (0.635, 0, AXIS_Z), grape, segments=10, rings=7)
    skewer += m.box((0.05, 0.05, 0.05), (0.69, 0, AXIS_Z), pineapple, rot=(0.3, 0, 0), bevel=0.006)
    raise_barrel(m, skewer)

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
