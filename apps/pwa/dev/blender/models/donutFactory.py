# The donut factory: a stainless fryer with a glowing window, dials and a chute that carries fresh
# donuts out to the front, donuts frying in the oil, and the big pink donut sign on two poles.
import math

from mathutils import Matrix, Vector

from build import TILE, Model
from models.parts import donut


def build(variant=None):
    m = Model("donutFactory", seed=31)
    steel = m.material("Steel", (0.6, 0.6, 0.62), metallic=1.0, roughness=0.6)
    steel_dark = m.material("Steel Dark", (0.2, 0.2, 0.22), metallic=1.0, roughness=0.6)
    glow = m.material("Glow", (0.9, 0.45, 0.1), emission=(1.0, 0.5, 0.12), strength=2.0)
    oil = m.material("Oil", (0.55, 0.32, 0.05), roughness=0.3)
    dough = m.material("Dough", (0.7, 0.3, 0.07), roughness=0.8)
    glazes = [m.material(name, color, roughness=0.6) for name, color in (("Glaze Pink", (0.85, 0.2, 0.4)), ("Glaze Chocolate", (0.1, 0.04, 0.015)), ("Glaze White", (0.9, 0.88, 0.82)))]
    sprinkles = [m.material(name, color) for name, color in (("Sprinkle Yellow", (0.9, 0.7, 0.05)), ("Sprinkle Blue", (0.1, 0.3, 0.9)), ("Sprinkle White", (0.95, 0.95, 0.95)), ("Sprinkle Green", (0.1, 0.6, 0.15)))]
    red = m.material("Dial", (0.6, 0.04, 0.03))

    # the fryer cabinet with its front (-y): window, dials, chute
    m.box((0.5, 0.4, 0.3), (0, 0.04, TILE + 0.15), steel, bevel=0.03, segments=3)
    m.box((0.46, 0.36, 0.012), (0, 0.04, TILE + 0.297), oil)
    m.box((0.22, 0.01, 0.09), (-0.08, -0.161, TILE + 0.17), glow, bevel=0.004)
    m.box((0.24, 0.014, 0.11), (-0.08, -0.158, TILE + 0.17), steel_dark, bevel=0.004)
    for k, x in enumerate((0.1, 0.16)):
        m.cylinder(0.018, 0.02, (x, -0.165, TILE + 0.2), red if k == 0 else steel_dark, rot=(math.pi / 2, 0, 0), segments=10, bevel=0.004)
    for x in (-0.2, 0.2):
        m.cylinder(0.02, 0.04, (x, -0.1, TILE + 0.02), steel_dark, segments=8)
        m.cylinder(0.02, 0.04, (x, 0.18, TILE + 0.02), steel_dark, segments=8)
    chute_angle = -0.35
    m.box((0.16, 0.2, 0.012), (0.14, -0.24, TILE + 0.06), steel, rot=(chute_angle, 0, 0), bevel=0.003)
    for side in (-1, 1):
        m.box((0.008, 0.2, 0.03), (0.14 + side * 0.08, -0.24, TILE + 0.075), steel, rot=(chute_angle, 0, 0))
    for i, (x, y, z) in enumerate(((0.14, -0.19, TILE + 0.1), (0.14, -0.29, TILE + 0.065))):
        donut(m, (x, y, z), 0.04, 0.022, dough, glazes[i % 3], sprinkles, count=10, flatten=0.9)
    for i, (x, y) in enumerate(((-0.12, 0.0), (0.06, 0.1), (-0.04, 0.15))):
        donut(m, (x, y, TILE + 0.31), 0.045, 0.025, dough, glazes[(i + 1) % 3], sprinkles, count=8, flatten=0.8)

    # the sign: a big pink donut standing on two poles at the back
    for x in (-0.06, 0.06):
        m.cylinder(0.014, 0.42, (x, 0.14, TILE + 0.5), steel, segments=10)
    sign = donut(m, (0, 0, 0), 0.15, 0.085, dough, glazes[0], sprinkles, count=60)
    m.transform(Matrix.Translation((0.0, 0.14, TILE + 0.82)) @ Matrix.Rotation(math.pi / 2, 4, "X"), sign)
    return m
