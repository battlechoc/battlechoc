# The cacao resource picture (cacao.svg, cacao-icon.svg): a cacao pod broken open, its lower half
# lying with a row of pale beans in the white pulp, the upper half tipped over beside it, like
# the user's old picture. Ridged like the pods on the cacao tree. Not a game model.
import math

import bmesh
from mathutils import Matrix, Vector

from build import TILE, Model

LENGTH, RADIUS = 0.62, 0.2
RIDGES = 5
LID_AT = (-0.24, 0.2, 0.12)
PULP_DEPTH = 0.075  # how far the pulp's surface lies below the rim
SHELL = 0.78  # the inside's size against the outside (a thick rim)


def build(variant=None):
    m = Model("cacao", seed=47)
    outside = m.material("Pod", (0.6, 0.32, 0.02), roughness=0.55)
    lid_outside = m.material("Pod Red", (0.42, 0.04, 0.02), roughness=0.55)
    inside = m.material("Pulp", (0.85, 0.82, 0.72), roughness=0.8)
    bean = m.material("Bean", (0.62, 0.45, 0.25), roughness=0.6)

    # the lower half, lying along x, cut open at the top
    lower = half_pod(m, outside, inside, top=False)
    # the white pulp filling the open half, a little domed (the beans floated over the hollow
    # shell), below the rim, so the shell holds the beans like a bowl
    m.sphere(1.0, (0, 0, -PULP_DEPTH), inside, scale=(LENGTH / 2 * 0.74, RADIUS * 0.7, 0.03), segments=32, rings=12)
    # beans in two rows, sunk half into the pulp
    for row in (-1, 1):
        for i in range(5):
            x = -0.2 + i * 0.1
            taper = 1 - (abs(x) / (LENGTH / 2)) ** 2
            at = Vector((x * 0.92, row * 0.05 * taper, -PULP_DEPTH + 0.018 + 0.016 * taper))
            m.sphere(1.0, at, bean, scale=(0.045, 0.032 * taper + 0.008, 0.028), rot=(0, 0, row * 0.15), segments=12, rings=8)
    # the upper half, turned over and leaning against the lower one
    lid = half_pod(m, lid_outside, inside, top=True)
    # (behind the open half, on the right in the picture, its red outside towards the camera)
    m.transform(Matrix.Translation(LID_AT) @ Matrix.Rotation(1.15, 4, "X") @ Matrix.Rotation(-0.35, 4, "Z"), lid)
    m.transform(Matrix.Translation((0, 0, TILE + RADIUS * 0.7)))
    return m


def half_pod(m, outside, inside, top):
    """Half a ridged cacao pod along x, cut at z = 0 (the lower half, or the upper with `top`),
    with a thin shell: outside and inside surfaces joined at the rim."""
    segments, rings = 40, 24
    faces = []
    shells = []
    for scale, mat in ((1.0, outside), (SHELL, inside)):
        rows = []
        for i in range(rings + 1):
            t = i / rings
            x = (t - 0.5) * LENGTH
            profile = math.sin(math.pi * t) ** 0.7
            row = []
            for k in range(segments + 1):
                a = math.pi * k / segments + (0 if top else math.pi)
                ridge = 1 + 0.08 * math.cos(2 * RIDGES * a)
                r = RADIUS * profile * ridge * scale
                row.append(m.bm.verts.new((x, math.cos(a) * r, math.sin(a) * r * 0.95)))
            rows.append(row)
        part = []
        for i in range(rings):
            for k in range(segments):
                quad = (rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k])
                part.append(m.bm.faces.new(quad if (mat is inside) == top else quad[::-1]))
        for face in part:
            face.material_index = mat
            face.smooth = True
        faces += part
        shells.append(rows)
    # the rim between outside and inside
    outer, inner = shells
    for i in range(rings):
        for k in (0, segments):
            quad = (outer[i][k], outer[i + 1][k], inner[i + 1][k], inner[i][k])
            face = m.bm.faces.new(quad if (k == 0) != top else quad[::-1])
            face.material_index = inside
            face.smooth = True
            faces.append(face)
    bmesh.ops.remove_doubles(m.bm, verts=list({v for f in faces for v in f.verts}), dist=1e-5)
    return [f for f in faces if f.is_valid]
