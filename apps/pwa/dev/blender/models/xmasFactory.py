# The xmas factory as a Swedish cottage: Falu red board-and-batten walls with white corner boards
# and window frames on a stone plinth, a snowy gable roof with a brick chimney, fairy lights along
# the eave and the gable, a wreath on the door, a small fir tree and a stack of presents (what the
# factory makes). The front (door) faces -y and the gable +x: the sides the game's camera sees.
import math

from mathutils import Vector

from build import TILE, Model

W, D, H = 0.5, 0.37, 0.34  # walls: width (x), depth (y), height
PITCH = math.radians(40)
OVERHANG = 0.05
FRAME = 0.014


def build(variant=None):
    m = Model("xmasFactory", seed=3)
    mats = dict(
        red=m.material("Falu Red", (0.3, 0.03, 0.02)),
        trim=m.material("Trim", (0.8, 0.78, 0.74)),
        snow=m.material("Snow", (0.95, 0.96, 1.0), roughness=0.9),
        roof=m.material("Roof", (0.05, 0.035, 0.03)),
        stone=m.material("Stone", (0.18, 0.17, 0.16), roughness=0.95),
        glass=m.material("Window", (0.9, 0.6, 0.25), emission=(1.0, 0.62, 0.25), strength=1.5),
        door=m.material("Door", (0.02, 0.09, 0.05)),
        brick=m.material("Brick", (0.22, 0.06, 0.03)),
        fir=m.material("Fir", (0.02, 0.1, 0.04)),
        wood=m.material("Wood", (0.1, 0.05, 0.025)),
        star=m.material("Star", (0.9, 0.65, 0.2), emission=(1.0, 0.75, 0.3), strength=2.0),
        gift_red=m.material("Gift Red", (0.5, 0.03, 0.03)),
        gift_green=m.material("Gift Green", (0.03, 0.25, 0.08)),
        gift_blue=m.material("Gift Blue", (0.05, 0.12, 0.45)),
        ribbon=m.material("Ribbon", (0.8, 0.55, 0.15), roughness=0.5),
    )
    bulbs = [
        m.material("Light Red", (0.8, 0.05, 0.03), emission=(1.0, 0.06, 0.03), strength=3.0),
        m.material("Light Green", (0.05, 0.7, 0.1), emission=(0.06, 1.0, 0.12), strength=3.0),
        m.material("Light Yellow", (0.9, 0.6, 0.1), emission=(1.0, 0.7, 0.15), strength=3.0),
        m.material("Light Blue", (0.1, 0.3, 0.9), emission=(0.15, 0.4, 1.0), strength=3.0),
    ]

    z_plinth = TILE + 0.04
    z_wall = z_plinth + 0.05
    z_eave = z_wall + H
    ridge = z_eave + (D / 2) * math.tan(PITCH)

    # ground snow, plinth, walls and the gable between the roof slopes
    m.box((0.74, 0.68, 0.04), (0.0, -0.03, TILE + 0.02), mats["snow"], bevel=0.018, segments=3)
    m.box((W + 0.04, D + 0.04, 0.05), (0, 0, z_plinth + 0.025), mats["stone"], bevel=0.008)
    m.box((W, D, H), (0, 0, z_wall + H / 2), mats["red"])
    prism(m, (-W / 2, W / 2), [(-D / 2, z_eave), (D / 2, z_eave), (0, ridge)], mats["red"])

    # openings on the front (x, width) and on the gable side (y, width)
    front_openings = [(-0.15, 0.11), (0.15, 0.11), (0.0, 0.13)]
    side_openings = [(0.0, 0.11)]
    battens(m, z_wall, front_openings, side_openings, mats["red"])
    for x in (-W / 2, W / 2):
        for y in (-D / 2, D / 2):
            m.box((0.034, 0.034, H + 0.01), (x, y, z_wall + H / 2), mats["trim"], bevel=0.004)

    for x in (-0.15, 0.15):
        window(m, "front", (x, -D / 2, z_wall + 0.19), 0.09, 0.11, mats)
    window(m, "side", (W / 2, 0.0, z_wall + 0.19), 0.09, 0.11, mats)
    window(m, "side", (W / 2, 0.0, z_eave + 0.055), 0.05, 0.05, mats, sill=False)
    door(m, z_wall, z_plinth, mats)

    roof(m, z_eave, ridge, mats, bulbs)
    chimney(m, ridge, mats)
    fir_tree(m, (-0.31, -0.27, z_plinth - 0.005), mats, bulbs)
    presents(m, (0.26, -0.3, z_plinth - 0.005), mats)
    for at, scale in (((-0.24, 0.26), (0.07, 0.05, 0.03)), ((0.32, 0.22), (0.05, 0.06, 0.025)), ((0.08, -0.31), (0.06, 0.035, 0.02))):
        m.blob(1.0, (*at, z_plinth - 0.005), mats["snow"], scale=scale, subdivisions=2, noise=0.08)
    # sized to fill its cell like the other buildings
    m.grow(1.25)
    return m


def prism(m, x_range, triangle, mat):
    """A prism along x with a triangular cross-section [(y, z), …]."""
    ends = [[m.bm.verts.new((x, y, z)) for y, z in triangle] for x in x_range]
    m.bm.faces.new(ends[0][::-1])
    m.bm.faces.new(ends[1])
    for i in range(3):
        j = (i + 1) % 3
        m.bm.faces.new((ends[0][i], ends[0][j], ends[1][j], ends[1][i]))
    m._part(ends[0] + ends[1], mat)


def battens(m, z_wall, front_openings, side_openings, mat):
    step = 0.046
    xs = [-W / 2 + 0.035 + i * step for i in range(int((W - 0.07) / step) + 1)]
    ys = [-D / 2 + 0.035 + i * step for i in range(int((D - 0.07) / step) + 1)]
    for x in xs:
        for y, openings in ((-D / 2 - 0.004, front_openings), (D / 2 + 0.004, [])):
            if not any(abs(x - centre) < width / 2 + 0.01 for centre, width in openings):
                m.box((0.014, 0.008, H), (x, y, z_wall + H / 2), mat)
    for y in ys:
        for x, openings in ((W / 2 + 0.004, side_openings), (-W / 2 - 0.004, [])):
            if not any(abs(y - centre) < width / 2 + 0.01 for centre, width in openings):
                m.box((0.008, 0.014, H), (x, y, z_wall + H / 2), mat)


def wall_box(m, facing, base, along, out, up, size, mat, bevel=0.0):
    """A box on a wall: `along` the wall, `out` of it, `up`; size (along, out, up)."""
    x, y, z = base
    if facing == "front":
        at, dims = (x + along, y - out, z + up), (size[0], size[1], size[2])
    else:
        at, dims = (x + out, y + along, z + up), (size[1], size[0], size[2])
    m.box(dims, at, mat, bevel=bevel)


def window(m, facing, base, w, h, mats, sill=True):
    t, d = FRAME, 0.02
    trim = mats["trim"]
    wall_box(m, facing, base, 0, 0.002, 0, (w, 0.004, h), mats["glass"])
    for up in (h / 2 + t / 2, -h / 2 - t / 2):
        wall_box(m, facing, base, 0, d / 2, up, (w + 2 * t, d, t), trim)
    for along in (w / 2 + t / 2, -w / 2 - t / 2):
        wall_box(m, facing, base, along, d / 2, 0, (t, d, h), trim)
    wall_box(m, facing, base, 0, d / 3, 0, (0.008, d * 0.6, h), trim)
    wall_box(m, facing, base, 0, d / 3, 0, (w, d * 0.6, 0.008), trim)
    if sill:
        wall_box(m, facing, base, 0, 0.02, -h / 2 - t - 0.006, (w + 2 * t + 0.02, 0.04, 0.012), trim)
        wall_box(m, facing, base, 0, 0.022, -h / 2 - t + 0.004, (w + 2 * t + 0.01, 0.034, 0.012), mats["snow"], bevel=0.005)


def door(m, z_wall, z_plinth, mats):
    base = (0.0, -D / 2, z_wall)
    wall_box(m, "front", base, 0, 0.005, 0.085, (0.1, 0.01, 0.17), mats["door"])
    wall_box(m, "front", base, 0, 0.01, 0.17 + 0.0075, (0.13, 0.02, 0.015), mats["trim"])
    for along in (0.0575, -0.0575):
        wall_box(m, "front", base, along, 0.01, 0.085, (0.015, 0.02, 0.17), mats["trim"])
    # wreath with a red bow, canopy with snow, a step
    m.ring((0.0, -D / 2 - 0.016, z_wall + 0.12), (0, 1, 0), 0.026, 0.009, mats["fir"], segments=14, minor=6)
    for side in (-1, 1):
        m.box((0.014, 0.006, 0.01), (side * 0.008, -D / 2 - 0.022, z_wall + 0.094), mats["gift_red"], rot=(0, side * 0.5, 0))
    m.box((0.17, 0.075, 0.012), (0.0, -D / 2 - 0.035, z_wall + 0.215), mats["trim"], rot=(-0.25, 0, 0))
    m.box((0.165, 0.07, 0.022), (0.0, -D / 2 - 0.035, z_wall + 0.231), mats["snow"], rot=(-0.25, 0, 0), bevel=0.008)
    m.box((0.15, 0.05, 0.02), (0.0, -D / 2 - 0.045, z_plinth + 0.01), mats["stone"], bevel=0.005)


def roof(m, z_eave, ridge, mats, bulbs):
    half = D / 2 + OVERHANG
    width = half / math.cos(PITCH)
    length = W + 2 * OVERHANG
    for side in (1, -1):
        normal = Vector((0, side * math.sin(PITCH), math.cos(PITCH)))
        down = Vector((0, side * math.cos(PITCH), -math.sin(PITCH)))
        middle = Vector((0, side * half / 2, ridge - half * math.tan(PITCH) / 2))
        rot = (-side * PITCH, 0, 0)
        m.box((length, width, 0.025), middle + normal * 0.0125, mats["roof"], rot=rot)
        snow_centre = middle + normal * 0.045
        m.box((length + 0.02, width + 0.012, 0.04), snow_centre, mats["snow"], rot=rot, bevel=0.016, segments=3)
        edge = snow_centre + down * (width / 2) - normal * 0.012
        x = -length / 2 + 0.03
        while x < length / 2 - 0.02:
            radius = m.random.uniform(0.011, 0.018)
            m.sphere(radius, edge + Vector((x, 0, -radius * 0.6)), mats["snow"], scale=(1, 1, 1.4), segments=8, rings=5)
            x += m.random.uniform(0.04, 0.07)
        for end in (-1, 1):  # barge boards under the gable edges
            m.box((0.015, width + 0.01, 0.045), middle + Vector((end * (length / 2 - 0.008), 0, 0)) - normal * 0.02, mats["trim"], rot=rot)
    m.tube([(-length / 2 - 0.005, 0, ridge + 0.05), (length / 2 + 0.005, 0, ridge + 0.05)], 0.02, mats["snow"], segments=10)

    # fairy lights: in swags along the front eave, and up the gable on the +x side
    y_front = -half + 0.015
    z_line = z_eave - (OVERHANG * math.tan(PITCH)) - 0.012
    points = [(-length / 2 + 0.02 + i * (length - 0.04) / 24, y_front, 0.0) for i in range(25)]
    points = [(x, y, z_line - 0.02 * abs(math.sin(3 * math.pi * i / 24))) for i, (x, y, _) in enumerate(points)]
    gable = [
        (length / 2 + 0.01, -half + (2 * half) * i / 16, z_line + (half - abs(-half + 2 * half * i / 16)) * math.tan(PITCH) - 0.01)
        for i in range(17)
    ]
    for line in (points, gable):
        m.tube(line, 0.0028, mats["fir"], segments=4, caps=False)
        for i, point in enumerate(line[1:-1:2]):
            m.sphere(0.011, Vector(point) + Vector((0, 0, -0.012)), bulbs[i % len(bulbs)], scale=(1, 1, 1.3), segments=6, rings=4)


def chimney(m, ridge, mats):
    x, y = 0.12, 0.09
    m.box((0.07, 0.07, 0.19), (x, y, ridge + 0.02), mats["brick"], bevel=0.004)
    m.box((0.086, 0.086, 0.02), (x, y, ridge + 0.12), mats["trim"], bevel=0.004)
    m.box((0.08, 0.08, 0.035), (x, y, ridge + 0.145), mats["snow"], bevel=0.013, segments=3)


def fir_tree(m, base, mats, bulbs):
    x, y, z = base
    m.cylinder(0.012, 0.04, (x, y, z + 0.02), mats["wood"], segments=6)
    layers = ((0.075, 0.11, 0.065), (0.06, 0.1, 0.13), (0.042, 0.09, 0.195))
    for radius, height, centre in layers:
        m.cylinder(radius, height, (x, y, z + centre), mats["fir"], radius2=0.0, segments=10)
    m.blob(0.016, (x, y, z + 0.25), mats["star"], subdivisions=1)
    for i in range(7):
        angle = i * 2.4
        radius, height, centre = layers[i % 3]
        lift = -height * 0.3
        m.sphere(0.008, (x + math.cos(angle) * radius * 0.65, y + math.sin(angle) * radius * 0.65, z + centre + lift), bulbs[i % len(bulbs)], segments=6, rings=4)


def presents(m, base, mats):
    x, y, z = base
    stack = (
        ((0.075, 0.075, 0.06), (x, y, z + 0.03), 0.0, mats["gift_red"]),
        ((0.055, 0.055, 0.05), (x + 0.005, y + 0.005, z + 0.085), 0.4, mats["gift_green"]),
        ((0.06, 0.05, 0.045), (x + 0.07, y + 0.06, z + 0.0225), -0.3, mats["gift_blue"]),
    )
    for size, at, turn, mat in stack:
        m.box(size, at, mat, rot=(0, 0, turn), bevel=0.004)
        m.box((size[0] + 0.003, 0.012, size[2] + 0.003), at, mats["ribbon"], rot=(0, 0, turn))
        m.box((0.012, size[1] + 0.003, size[2] + 0.003), at, mats["ribbon"], rot=(0, 0, turn))
