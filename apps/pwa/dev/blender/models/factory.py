# The chocolate factory: a brick hall with a sawtooth roof of skylights, a tall chimney with white
# bands and a roller door; in front a two-storey office with lit windows, a door with a canopy and
# a sign with a golden cacao bean; a steel silo piping into the hall, bushes, a paved yard. The
# front faces -y and the office's side +x: the sides the game's camera sees.
import math

from build import TILE, Model
from models.parts import leaf_cluster, window

Z0 = TILE + 0.035  # top of the paving
HALL = (-0.1, 0.12, 0.56, 0.42, 0.42)  # centre x, y, width, depth, height
OFFICE = (0.25, -0.2, 0.3, 0.26, 0.7)


def build(variant=None):
    m = Model("factory", seed=37)
    mats = dict(
        brick=m.material("Brick", (0.32, 0.07, 0.04)),
        brick_dark=m.material("Brick Dark", (0.17, 0.04, 0.025)),
        trim=m.material("Trim", (0.8, 0.78, 0.74)),
        roof=m.material("Roof", (0.1, 0.1, 0.11)),
        glass=m.material("Window", (0.9, 0.6, 0.25), emission=(1.0, 0.62, 0.25), strength=1.3),
        steel=m.material("Steel", (0.6, 0.6, 0.62), metallic=1.0, roughness=0.6),
        door_steel=m.material("Roller Door", (0.2, 0.3, 0.38)),
        paving=m.material("Paving", (0.42, 0.38, 0.33), roughness=0.95),
        sign=m.material("Sign", (0.08, 0.035, 0.015)),
        gold=m.material("Gold", (0.8, 0.55, 0.15), metallic=1.0, roughness=0.45),
        door=m.material("Door", (0.15, 0.04, 0.03)),
        chocolate=m.material("Chocolate", (0.1, 0.04, 0.015), roughness=0.6),
    )
    leaves = (
        m.material("Leaf Dark", (0.04, 0.16, 0.025), roughness=0.75, double_sided=True),
        m.material("Leaf", (0.07, 0.25, 0.035), roughness=0.75, double_sided=True),
        m.material("Leaf Light", (0.14, 0.38, 0.05), roughness=0.75, double_sided=True),
    )
    core = m.material("Crown", (0.035, 0.13, 0.02))

    m.box((0.88, 0.84, 0.035), (0, 0, TILE + 0.0175), mats["paving"], bevel=0.01)
    hall(m, mats)
    office(m, mats)
    chimney(m, mats)
    silo(m, mats)
    for centre, radii in (((0.0, -0.3, Z0 + 0.06), (0.075, 0.07, 0.06)), ((0.43, 0.0, Z0 + 0.06), (0.065, 0.075, 0.06)), ((-0.42, 0.3, Z0 + 0.06), (0.07, 0.07, 0.06))):
        leaf_cluster(m, centre, radii, 34, leaves, core, leaf_size=(0.04, 0.055, 0.02, 0.026))
    return m


def walls(m, mats, centre_x, centre_y, width, depth, height):
    m.box((width, depth, height), (centre_x, centre_y, Z0 + height / 2), mats["brick"])
    for z in (0.1, 0.25, 0.4, 0.55):
        if z < height - 0.04:
            m.box((width + 0.008, depth + 0.008, 0.014), (centre_x, centre_y, Z0 + z), mats["brick_dark"])
    m.box((width + 0.024, depth + 0.024, 0.022), (centre_x, centre_y, Z0 + height), mats["trim"], bevel=0.004)


def hall(m, mats):
    x, y, w, d, h = HALL
    walls(m, mats, x, y, w, d, h)
    front = y - d / 2
    # sawtooth roof: three teeth, their lit glass facing the front
    teeth, glass_h = 3, 0.09
    depth = d / teeth
    z_roof = Z0 + h + 0.011
    for i in range(teeth):
        y0 = front + i * depth
        m.box((w - 0.02, 0.008, glass_h), (x, y0 + 0.006, z_roof + glass_h / 2), mats["glass"])
        for k in range(7):
            m.box((0.008, 0.012, glass_h), (x - w / 2 + 0.04 + k * (w - 0.08) / 6, y0 + 0.004, z_roof + glass_h / 2), mats["trim"])
        length = math.hypot(depth, glass_h)
        angle = math.atan2(glass_h, depth)
        m.box((w + 0.02, length + 0.012, 0.018), (x, y0 + depth / 2 + 0.004, z_roof + glass_h / 2 + 0.009), mats["roof"], rot=(-angle, 0, 0))
    # front: roller door and a window; side: two windows
    door_x = -0.13
    m.box((0.15, 0.012, 0.2), (door_x, front - 0.006, Z0 + 0.1), mats["door_steel"])
    for k in range(8):
        m.box((0.15, 0.016, 0.006), (door_x, front - 0.008, Z0 + 0.02 + k * 0.024), mats["trim"])
    m.box((0.17, 0.02, 0.016), (door_x, front - 0.01, Z0 + 0.208), mats["trim"])
    window(m, "front", (0.03, front, Z0 + 0.3), 0.06, 0.13, mats["trim"], mats["glass"])
    for wy in (0.06, 0.22):
        for wz in (Z0 + 0.15, Z0 + 0.32):
            window(m, "side", (x + w / 2, wy, wz), 0.08, 0.11, mats["trim"], mats["glass"])


def office(m, mats):
    x, y, w, d, h = OFFICE
    walls(m, mats, x, y, w, d, h)
    m.box((w - 0.01, d - 0.01, 0.012), (x, y, Z0 + h + 0.012), mats["roof"])
    front, side = y - d / 2, x + w / 2
    for z in (Z0 + 0.32, Z0 + 0.47, Z0 + 0.62):
        for wx in (x - 0.07, x + 0.07):
            window(m, "front", (wx, front, z), 0.07, 0.09, mats["trim"], mats["glass"], sill=mats["trim"])
        window(m, "side", (side, y, z), 0.07, 0.09, mats["trim"], mats["glass"], sill=mats["trim"])
    window(m, "side", (side, y, Z0 + 0.1), 0.07, 0.09, mats["trim"], mats["glass"], sill=mats["trim"])
    # door, canopy and the sign with a golden cacao bean
    m.box((0.075, 0.012, 0.13), (x, front - 0.006, Z0 + 0.065), mats["door"])
    m.box((0.095, 0.018, 0.012), (x, front - 0.009, Z0 + 0.136), mats["trim"])
    m.box((0.12, 0.06, 0.012), (x, front - 0.03, Z0 + 0.16), mats["roof"], rot=(-0.2, 0, 0), bevel=0.003)
    m.box((0.2, 0.012, 0.055), (x, front - 0.008, Z0 + 0.205), mats["sign"], bevel=0.004)
    m.sphere(1.0, (x, front - 0.016, Z0 + 0.205), mats["gold"], scale=(0.03, 0.01, 0.018), segments=12, rings=8)
    m.box((0.004, 0.006, 0.026), (x, front - 0.026, Z0 + 0.205), mats["chocolate"])


def chimney(m, mats):
    x, y = -0.3, 0.25
    # as tall as the old factory: higher, it reached into the charge indicator above the cell
    top = TILE + 1.25
    height = top - Z0
    m.cylinder(0.072, height, (x, y, Z0 + height / 2), mats["brick"], radius2=0.05, segments=16)
    for z, radius in ((TILE + 1.03, 0.059), (TILE + 1.15, 0.055)):
        m.cylinder(radius, 0.035, (x, y, z), mats["trim"], segments=16)
    m.ring((x, y, top), (0, 0, 1), 0.05, 0.012, mats["brick_dark"], segments=16, minor=5)


def silo(m, mats):
    x, y = -0.3, -0.24
    for k in range(3):
        angle = k * math.tau / 3 + 0.4
        m.cylinder(0.01, 0.05, (x + math.cos(angle) * 0.07, y + math.sin(angle) * 0.07, Z0 + 0.025), mats["steel"], segments=6)
    m.cylinder(0.09, 0.3, (x, y, Z0 + 0.2), mats["steel"], segments=20, bevel=0.006)
    m.sphere(0.09, (x, y, Z0 + 0.35), mats["steel"], scale=(1, 1, 0.5), segments=20, rings=10)
    m.cylinder(0.092, 0.05, (x, y, Z0 + 0.18), mats["chocolate"], segments=20)
    hall_front = HALL[1] - HALL[3] / 2
    m.tube([(x, y, Z0 + 0.38), (x, y + 0.04, Z0 + 0.44), (x, hall_front - 0.06, Z0 + 0.42), (x, hall_front + 0.01, Z0 + 0.36)], 0.018, mats["steel"], segments=8)
