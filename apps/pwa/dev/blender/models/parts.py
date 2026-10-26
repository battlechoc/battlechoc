# Parts that several models share: leaf clusters, donuts, windows.
import math

import bmesh
from mathutils import Matrix, Vector

GOLDEN_ANGLE = math.pi * (3 - math.sqrt(5))


def leaf_cluster(m, centre, radii, count, leaves, core, leaf_size=(0.1, 0.14, 0.045, 0.06)):
    """A clump of foliage: a dark core and leaves lying on it like shingles, the sunny top in the
    lighter of the `leaves` materials (dark to light)."""
    centre, radii = Vector(centre), Vector(radii)
    m.blob(1.0, centre, core, scale=radii * 0.78, subdivisions=2, noise=0.05)
    lo, hi, wlo, whi = leaf_size
    for i in range(count):
        y = 1 - 2 * (i + 0.5) / count
        ring = math.sqrt(max(0.0, 1 - y * y))
        phi = i * GOLDEN_ANGLE + m.random.uniform(-0.2, 0.2)
        unit = Vector((math.cos(phi) * ring, math.sin(phi) * ring, y))
        if unit.z < -0.8:
            continue
        point = centre + Vector(a * b for a, b in zip(unit, radii)) * 0.95
        normal = Vector(a / b for a, b in zip(unit, radii)).normalized()
        sideways = Vector(m.random.uniform(-1, 1) for _ in range(3))
        sideways = (sideways - normal * sideways.dot(normal)).normalized()
        direction = (sideways + normal * 0.3 + Vector((0, 0, -0.3))).normalized()
        shade = (unit.z + 1) / 2 + m.random.uniform(-0.35, 0.35)
        mat = leaves[min(len(leaves) - 1, int(max(0.0, shade) * len(leaves)))]
        m.leaf(point - normal * 0.03, direction, normal, m.random.uniform(lo, hi), m.random.uniform(wlo, whi), mat, droop=0.3)


def donut(m, centre, radius, tube, dough, glaze, sprinkles, count=60, flatten=1.0, drips=7, segments=28, minor=12):
    """A glazed donut lying flat around `centre`: dough, glaze with drips over the top half,
    sprinkles in the `sprinkles` materials (one or several). Returns its faces."""
    centre = Vector(centre)
    faces = list(m.ring(centre, (0, 0, 1), radius, tube, dough, segments=segments, minor=minor))
    icing = list(m.ring(centre, (0, 0, 1), radius, tube * 1.07, glaze, segments=segments, minor=minor))
    offset = m.random.uniform(0, math.tau)
    remove = []
    for face in icing:
        c = face.calc_center_median() - centre
        phi = math.atan2(c.y, c.x)
        drip = max(0.0, math.sin(drips * phi + offset)) ** 4
        if c.z < tube * (0.2 - 0.75 * drip):
            remove.append(face)
    bmesh.ops.delete(m.bm, geom=remove, context="FACES")
    icing = [face for face in icing if face.is_valid]
    faces += sprinkle(m, centre, radius, tube, sprinkles, count)
    faces += icing
    if flatten != 1.0:
        m.transform(Matrix.Translation(centre) @ Matrix.Diagonal((1, 1, flatten, 1)) @ Matrix.Translation(-centre), faces)
    return faces



def sprinkle(m, centre, radius, tube, sprinkles, count, spread=(0.25, 0.75)):
    """`count` sprinkles in the `sprinkles` materials (one or several) on the glaze of a donut
    lying flat around `centre`, between `spread` (fractions of a half turn around the tube: 0 the
    outside, 0.5 the top) . Returns their faces."""
    sprinkles = sprinkles if isinstance(sprinkles, (list, tuple)) else [sprinkles]
    faces = []
    for i in range(count):
        phi = m.random.uniform(0, math.tau)
        theta = m.random.uniform(*spread) * math.pi
        radial = Vector((math.cos(phi), math.sin(phi), 0))
        normal = radial * math.cos(theta) + Vector((0, 0, math.sin(theta)))
        point = centre + radial * radius + normal * tube * 1.09
        along = Vector(m.random.uniform(-1, 1) for _ in range(3))
        along = (along - normal * along.dot(normal)).normalized()
        rot = along.to_track_quat("Z", "Y").to_euler()
        faces += m.cylinder(tube * 0.05, tube * 0.22, point, sprinkles[i % len(sprinkles)], rot=rot, segments=5)
    return faces


def window(m, facing, base, w, h, frame, glass, sill=None, snow=None, t=0.014, d=0.02, mullions=True):
    """A window on a wall facing -y ("front") or +x ("side"): glass, frame, muntins, sill."""

    def box(along, out, up, size, mat, bevel=0.0):
        x, y, z = base
        if facing == "front":
            at, dims = (x + along, y - out, z + up), size
        else:
            at, dims = (x + out, y + along, z + up), (size[1], size[0], size[2])
        m.box(dims, at, mat, bevel=bevel)

    box(0, 0.002, 0, (w, 0.004, h), glass)
    for up in (h / 2 + t / 2, -h / 2 - t / 2):
        box(0, d / 2, up, (w + 2 * t, d, t), frame)
    for along in (w / 2 + t / 2, -w / 2 - t / 2):
        box(along, d / 2, 0, (t, d, h), frame)
    if mullions:
        box(0, d / 3, 0, (0.008, d * 0.6, h), frame)
        box(0, d / 3, 0, (w, d * 0.6, 0.008), frame)
    if sill is not None:
        box(0, 0.02, -h / 2 - t - 0.006, (w + 2 * t + 0.02, 0.04, 0.012), sill)
    if snow is not None:
        box(0, 0.022, -h / 2 - t + 0.004, (w + 2 * t + 0.01, 0.034, 0.012), snow, bevel=0.005)
