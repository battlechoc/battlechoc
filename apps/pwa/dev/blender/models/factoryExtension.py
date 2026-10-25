# The factory extension: a smaller brick warehouse with a gable roof and a chimney, joined to the
# factory by a chocolate pipe and a steel pipe on a frame. The game turns it so that the pipes,
# which reach out along -y into the neighbouring cell, point at the factory.
import math

from build import TILE, Model
from models.parts import window

Z0 = TILE + 0.035
W, D, H = 0.6, 0.46, 0.44
CY = 0.17  # the warehouse sits towards +y, the pipes take the -y side
PITCH = math.radians(32)


def build(variant=None):
    m = Model("factoryExtension", seed=41)
    mats = dict(
        brick=m.material("Brick", (0.32, 0.07, 0.04)),
        brick_dark=m.material("Brick Dark", (0.17, 0.04, 0.025)),
        trim=m.material("Trim", (0.8, 0.78, 0.74)),
        roof=m.material("Roof", (0.1, 0.1, 0.11)),
        glass=m.material("Window", (0.9, 0.6, 0.25), emission=(1.0, 0.62, 0.25), strength=1.3),
        steel=m.material("Steel", (0.6, 0.6, 0.62), metallic=1.0, roughness=0.6),
        door_steel=m.material("Roller Door", (0.2, 0.3, 0.38)),
        paving=m.material("Paving", (0.42, 0.38, 0.33), roughness=0.95),
        chocolate=m.material("Chocolate Pipe", (0.12, 0.05, 0.02), roughness=0.6),
    )
    m.box((0.74, 0.62, 0.035), (0, CY - 0.02, TILE + 0.0175), mats["paving"], bevel=0.01)
    m.box((W, D, H), (0, CY, Z0 + H / 2), mats["brick"])
    for z in (0.09, 0.21, 0.33):
        m.box((W + 0.008, D + 0.008, 0.014), (0, CY, Z0 + z), mats["brick_dark"])
    m.box((W + 0.02, D + 0.02, 0.02), (0, CY, Z0 + H), mats["trim"], bevel=0.004)

    # gable roof, ridge along x
    z_eave = Z0 + H + 0.01
    ridge = z_eave + (D / 2) * math.tan(PITCH)
    ends = [[m.bm.verts.new((x, CY + yy, zz)) for yy, zz in ((-D / 2, z_eave), (D / 2, z_eave), (0, ridge))] for x in (-W / 2, W / 2)]
    m.bm.faces.new(ends[0][::-1])
    m.bm.faces.new(ends[1])
    for i in range(3):
        j = (i + 1) % 3
        m.bm.faces.new((ends[0][i], ends[0][j], ends[1][j], ends[1][i]))
    m._part(ends[0] + ends[1], mats["brick"])
    half = D / 2 + 0.035
    width = half / math.cos(PITCH)
    for side in (1, -1):
        middle = (0, CY + side * half / 2, ridge - half * math.tan(PITCH) / 2 + 0.01)
        m.box((W + 0.06, width, 0.022), middle, mats["roof"], rot=(-side * PITCH, 0, 0), bevel=0.004)
    m.cylinder(0.048, 0.24, (0.17, CY + 0.1, ridge), mats["brick"], segments=12)
    m.cylinder(0.055, 0.025, (0.17, CY + 0.1, ridge + 0.11), mats["trim"], segments=12)

    front, side = CY - D / 2, W / 2
    m.box((0.17, 0.012, 0.21), (-0.13, front - 0.006, Z0 + 0.105), mats["door_steel"])
    for k in range(8):
        m.box((0.17, 0.016, 0.006), (-0.13, front - 0.008, Z0 + 0.02 + k * 0.025), mats["trim"])
    for wz in (Z0 + 0.14, Z0 + 0.32):
        window(m, "front", (0.13, front, wz), 0.08, 0.1, mats["trim"], mats["glass"], sill=mats["trim"])
        for wy in (CY - 0.11, CY + 0.11):
            window(m, "side", (side, wy, wz), 0.08, 0.1, mats["trim"], mats["glass"], sill=mats["trim"])

    # the pipes to the factory, out along -y, on a frame
    end = -0.7
    for px, pz, radius, mat in ((-0.08, Z0 + 0.34, 0.04, mats["chocolate"]), (0.08, Z0 + 0.28, 0.03, mats["steel"])):
        m.cylinder(radius, front - end + 0.02, (px, (front + end) / 2, pz), mat, rot=(math.pi / 2, 0, 0), segments=12)
        y = front - 0.06
        while y > end + 0.03:
            m.ring((px, y, pz), (0, 1, 0), radius + 0.004, 0.006, mats["steel"], segments=12, minor=4)
            y -= 0.13
    for fy in (-0.32,):
        for fx in (-0.13, 0.13):
            m.box((0.022, 0.022, 0.36), (fx * 1.25, fy, Z0 + 0.18), mats["steel"])
        m.box((0.35, 0.022, 0.022), (0, fy, Z0 + 0.3), mats["steel"])
        m.box((0.35, 0.022, 0.022), (0, fy, Z0 + 0.25), mats["steel"])
    return m
