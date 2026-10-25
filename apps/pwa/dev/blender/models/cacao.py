# The cacao resource picture (cacao.svg, cacao-icon.svg): a cacao pod broken open, its lower half
# lying with a row of pale beans in the white pulp, the upper half tipped over beside it, like
# the user's old picture. Ridged like the pods on the cacao tree. Not a game model.
import math

import bmesh
from mathutils import Matrix, Vector

from build import TILE, Model

LENGTH, RADIUS = 0.62, 0.2
RIDGES = 5
HUSKS = {None: (0.62, 0.42, 0.14), "dark": (0.42, 0.24, 0.07)}
LID_AT = (-0.24, 0.2, 0.12)
# the beans: as in a real pod, packed around a central strand like kernels on a cob, each with its
# long side pointing out; semi-axes along the pod, around it and outwards
BEAN = (0.05, 0.034, 0.062)
STRAND = 0.02  # the strand's radius
BEAN_TOP = -0.004  # how high the bean mass reaches (the rim is at 0)
SHELL = 0.78  # the inside's size against the outside (a thick rim)


def build(variant=None):
    m = Model("cacao", seed=47)
    outside = m.material("Pod", (0.6, 0.32, 0.02), roughness=0.55)
    lid_outside = m.material("Pod Red", (0.42, 0.04, 0.02), roughness=0.55)
    inside = m.material("Pulp", (0.85, 0.82, 0.72), roughness=0.8)
    # the husk's cut and inner side: darker than the white pulp, like a real pod's
    husk = m.material("Husk", HUSKS.get(variant, HUSKS[None]), roughness=0.75)
    # fresh beans are rosy beige, still moist from the pulp
    bean = m.material("Bean", (0.7, 0.47, 0.38), roughness=0.45)

    # the lower half, lying along x, cut open at the top
    lower = half_pod(m, outside, husk, top=False)
    beans(m, inside, bean)
    # the upper half, turned over and leaning against the lower one
    lid = half_pod(m, lid_outside, husk, top=True)
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


def beans(m, pulp, bean):
    """The upper half of the bean "cob" in the open half: rings of beans along the pod, staggered,
    each turned to point away from the strand, the gaps white with pulp."""
    # white pulp filling the bowl under the beans, showing between them
    m.sphere(1.0, (0, 0, -0.09), pulp, scale=(LENGTH / 2 * 0.62, RADIUS * SHELL * 0.78, 0.03), segments=28, rings=14)
    rings = 7
    spacing = 2 * BEAN[0] * 0.8
    for i in range(rings):
        x = (i - (rings - 1) / 2) * spacing
        t = x / LENGTH + 0.5
        # smaller towards the ends, where the pod narrows, the strand nearer the rim
        size = max(0.5, math.sin(math.pi * t) ** 0.6)
        radius = (STRAND + BEAN[2]) * size
        axis_z = BEAN_TOP - (STRAND + 2 * BEAN[2]) * size
        # packed tight: the beans press against each other
        step = 2 * BEAN[1] * size * 0.78 / radius
        count = 5 if i % 2 == 0 else 4
        for k in range(count):
            a = (k - (count - 1) / 2) * step + m.random.uniform(-0.06, 0.06)
            if abs(a) > math.radians(75):
                continue
            jitter = m.random.uniform(0.9, 1.08)
            centre = Vector((x + m.random.uniform(-0.004, 0.004), math.sin(a) * radius, axis_z + math.cos(a) * radius))
            m.sphere(
                1.0,
                centre,
                bean,
                scale=(BEAN[0] * size * jitter, BEAN[1] * size * jitter, BEAN[2] * size * jitter),
                rot=(-a, m.random.uniform(-0.18, 0.18), 0),
                segments=14,
                rings=10,
            )
