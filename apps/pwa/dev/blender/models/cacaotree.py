# The cacao tree: a thin, slightly bent trunk, a crown of leaves on three clusters (a dark core
# keeps the gaps between the leaves from showing the sky) and ridged pods hanging from the trunk,
# like a real cacao tree.
import math

import bmesh
from mathutils import Vector

from build import TILE, Model

GOLDEN_ANGLE = math.pi * (3 - math.sqrt(5))

# crown clusters: centre, radii, leaves
CLUSTERS = (
    ((0.0, 0.0, TILE + 0.93), (0.29, 0.27, 0.2), 230),
    ((0.2, -0.12, TILE + 0.8), (0.15, 0.14, 0.11), 95),
    ((-0.18, 0.13, TILE + 0.82), (0.15, 0.14, 0.11), 95),
)
# pods: height on the trunk, direction around it (radians), length
PODS = ((0.28, 0.4, 0.12), (0.4, 2.5, 0.11), (0.47, 4.4, 0.12), (0.34, 5.6, 0.1))


def build(variant=None):
    model = Model("cacaotree", seed=7)
    bark = model.material("Bark", (0.1, 0.05, 0.025))
    core = model.material("Crown", (0.035, 0.13, 0.02))
    leaves = (
        model.material("Leaf Dark", (0.04, 0.16, 0.025), roughness=0.75, double_sided=True),
        model.material("Leaf", (0.07, 0.25, 0.035), roughness=0.75, double_sided=True),
        model.material("Leaf Light", (0.14, 0.38, 0.05), roughness=0.75, double_sided=True),
    )
    pods = (
        model.material("Pod Red", (0.5, 0.04, 0.02)),
        model.material("Pod Orange", (0.68, 0.22, 0.02)),
        model.material("Pod Yellow", (0.75, 0.5, 0.03)),
    )

    trunk = [(0, 0, TILE), (0.015, 0.0, TILE + 0.2), (-0.01, 0.015, TILE + 0.45), (0.005, 0.01, TILE + 0.68), (0, 0, TILE + 0.85)]
    model.tube(trunk, [0.04, 0.032, 0.026, 0.022, 0.018], bark, segments=8)
    model.cylinder(0.05, 0.04, (0, 0, TILE + 0.02), bark, radius2=0.036, segments=10)
    fork = Vector((0.003, 0.008, TILE + 0.66))
    for centre, _, _ in CLUSTERS:
        model.tube([fork, fork.lerp(Vector(centre), 0.5) + Vector((0, 0, 0.03)), Vector(centre)], [0.016, 0.012, 0.01], bark, segments=6)

    for centre, radii, count in CLUSTERS:
        centre, radii = Vector(centre), Vector(radii)
        model.blob(1.0, centre, core, scale=radii * 0.78, subdivisions=2, noise=0.05)
        for i in range(count):
            # spread evenly over the cluster (Fibonacci sphere), with some jitter
            y = 1 - 2 * (i + 0.5) / count
            ring = math.sqrt(max(0.0, 1 - y * y))
            phi = i * GOLDEN_ANGLE + model.random.uniform(-0.2, 0.2)
            unit = Vector((math.cos(phi) * ring, math.sin(phi) * ring, y))
            if unit.z < -0.8:
                continue
            point = centre + Vector(a * b for a, b in zip(unit, radii)) * 0.95
            normal = Vector(a / b for a, b in zip(unit, radii)).normalized()
            sideways = Vector(model.random.uniform(-1, 1) for _ in range(3))
            sideways = (sideways - normal * sideways.dot(normal)).normalized()
            # lying on the crown like shingles, tips a little out and down
            direction = (sideways + normal * 0.3 + Vector((0, 0, -0.3))).normalized()
            # the sunny top lighter, the shaded bottom darker
            shade = (unit.z + 1) / 2 + model.random.uniform(-0.35, 0.35)
            model.leaf(
                point - normal * 0.03,
                direction,
                normal,
                model.random.uniform(0.1, 0.14),
                model.random.uniform(0.045, 0.06),
                leaves[0 if shade < 0.35 else 1 if shade < 0.75 else 2],
                droop=0.3,
            )

    for i, (height, angle, length) in enumerate(PODS):
        out = Vector((math.cos(angle), math.sin(angle), 0))
        attach = Vector((0.0, 0.0, TILE + height)) + out * 0.02
        direction = (out * 0.45 + Vector((0, 0, -1))).normalized()
        centre = attach + direction * (length / 2 + 0.012)
        model.tube([attach, attach + direction * 0.016], 0.006, bark, segments=5)
        pod(model, centre, direction, length, 0.034, pods[i % len(pods)])
    # sized to fill its cell like the other buildings
    model.grow(1.15)
    return model


def pod(model, centre, direction, length, radius, mat):
    """A cacao pod: an ellipsoid with five ridges and pointed ends."""
    made = bmesh.ops.create_uvsphere(model.bm, u_segments=10, v_segments=8, radius=1.0)
    turn = Vector((0, 0, 1)).rotation_difference(direction).to_matrix()
    for vert in made["verts"]:
        x, y, z = vert.co
        theta = math.atan2(y, x)
        radial = (max(0.0, 1 - z * z)) ** 0.4 * radius * (1 + 0.13 * math.cos(5 * theta))
        local = Vector((math.cos(theta) * radial, math.sin(theta) * radial, z * length / 2))
        vert.co = centre + turn @ local
    model._part(made["verts"], mat)
