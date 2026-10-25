# The spying easter bunny: a milk chocolate bunny with a red ribbon and a golden bell, sitting in a
# wicker basket with grass and painted eggs, binoculars to its eyes. It looks where the old model
# looked (the game turns the opponent's bunny around).
import math

from mathutils import Matrix, Vector

from build import TILE, Model, aim

VIEW = Vector((-0.54, -0.84, 0.0))


def build(variant=None):
    m = Model("spyingEasterBunny", seed=23)
    chocolate = m.material("Milk Chocolate", (0.16, 0.06, 0.025), roughness=0.55)
    white = m.material("White Chocolate", (0.8, 0.68, 0.5), roughness=0.6)
    pink = m.material("Pink", (0.8, 0.3, 0.4))
    ribbon = m.material("Ribbon", (0.55, 0.02, 0.03), roughness=0.6)
    gold = m.material("Gold", (0.8, 0.55, 0.15), metallic=1.0, roughness=0.45)
    black = m.material("Binoculars", (0.02, 0.02, 0.025))
    lens = m.material("Lens", (0.05, 0.1, 0.25), roughness=0.3)
    wicker = (m.material("Wicker", (0.4, 0.22, 0.08)), m.material("Wicker Dark", (0.25, 0.13, 0.05)))
    grass = (m.material("Grass", (0.12, 0.35, 0.04), double_sided=True), m.material("Grass Light", (0.25, 0.5, 0.06), double_sided=True))
    eggs = [m.material(name, color) for name, color in (("Egg Pink", (0.8, 0.35, 0.45)), ("Egg Blue", (0.3, 0.5, 0.85)), ("Egg Yellow", (0.85, 0.7, 0.2)), ("Egg Mint", (0.35, 0.75, 0.5)))]
    stripe = m.material("Egg Stripe", (0.9, 0.88, 0.85))

    # the basket
    m.cylinder(0.27, 0.11, (0, 0, TILE + 0.055), wicker[1], radius2=0.3, segments=28)
    for i, z in enumerate((0.025, 0.06, 0.095)):
        m.ring((0, 0, TILE + z), (0, 0, 1), 0.275 + z * 0.25, 0.022, wicker[i % 2], segments=28, minor=5)
    m.ring((0, 0, TILE + 0.125), (0, 0, 1), 0.3, 0.03, wicker[0], segments=28, minor=6)
    m.blob(1.0, (0, 0, TILE + 0.125), grass[0], scale=(0.28, 0.28, 0.05), subdivisions=2, noise=0.04)
    for i in range(44):
        angle = i * math.tau / 44 + m.random.uniform(-0.05, 0.05)
        out = Vector((math.cos(angle), math.sin(angle), 0))
        base = out * 0.25 + Vector((0, 0, TILE + 0.13))
        m.leaf(base, (out * 0.5 + Vector((0, 0, 1))).normalized(), out, m.random.uniform(0.06, 0.1), 0.016, grass[i % 2], droop=0.4, fold=0.2)

    # painted eggs in the grass
    for i, angle in enumerate((0.9, 1.9, 3.1, 4.1, 5.2)):
        faces = m.sphere(0.042, (0, 0, 0), eggs[i % len(eggs)], scale=(1, 1, 1.3), segments=12, rings=8)
        faces += m.ring((0, 0, 0.004), (0, 0, 1), 0.042, 0.006, stripe, segments=14, minor=4)
        turn = Matrix.Rotation(m.random.uniform(-0.6, 0.6), 4, "X") @ Matrix.Rotation(m.random.uniform(-0.6, 0.6), 4, "Y")
        at = Vector((math.cos(angle) * 0.19, math.sin(angle) * 0.19, TILE + 0.17))
        m.transform(Matrix.Translation(at) @ turn, faces)

    # the bunny, looking along +x
    m.blob(1.0, (-0.03, 0, TILE + 0.3), chocolate, scale=(0.12, 0.11, 0.15), subdivisions=3)
    m.sphere(0.095, (0.04, 0, TILE + 0.48), chocolate, segments=16, rings=12)
    for side in (-1, 1):
        m.sphere(0.032, (0.112, side * 0.03, TILE + 0.45), white, segments=10, rings=7)
        m.sphere(1.0, (0.0, side * 0.045, TILE + 0.63), chocolate, scale=(0.03, 0.022, 0.1), rot=(side * 0.25, -0.2, 0), segments=10, rings=8)
        m.sphere(1.0, (0.012, side * 0.047, TILE + 0.63), pink, scale=(0.02, 0.012, 0.075), rot=(side * 0.25, -0.2, 0), segments=8, rings=6)
        m.sphere(1.0, (0.1, side * 0.07, TILE + 0.42), chocolate, scale=(0.055, 0.03, 0.03), rot=(0, -0.6, 0), segments=10, rings=7)
        m.sphere(1.0, (0.08, side * 0.06, TILE + 0.17), chocolate, scale=(0.06, 0.035, 0.025), segments=10, rings=7)
        m.cylinder(0.026, 0.06, (0.16, side * 0.035, TILE + 0.5), black, rot=(0, math.pi / 2, 0), segments=12, bevel=0.004)
        m.cylinder(0.02, 0.004, (0.191, side * 0.035, TILE + 0.5), lens, rot=(0, math.pi / 2, 0), segments=12)
    m.sphere(0.014, (0.135, 0, TILE + 0.475), pink, segments=8, rings=6)
    m.box((0.03, 0.04, 0.015), (0.16, 0, TILE + 0.5), black)
    m.sphere(0.035, (-0.15, 0, TILE + 0.27), white, segments=10, rings=7)
    m.ring((0.0, 0, TILE + 0.405), (0, 0, 1), 0.08, 0.012, ribbon, segments=20, minor=5)
    m.sphere(0.02, (0.085, 0, TILE + 0.39), gold, segments=10, rings=7)

    aim(m, VIEW)
    m.grow(1.25)
    return m
