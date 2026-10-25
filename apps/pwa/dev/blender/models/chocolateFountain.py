# The chocolate fountain: a stainless party fountain with three tiers, chocolate running over each
# rim, a pool in the basin and strawberries on its edge. "Shield" is the dome of the fountain's
# shield, which the game paints itself: it keeps the old size (radius 2, over the 3x3 cells around).
import math

import bmesh

from build import TILE, Model

TIERS = ((0.24, 0.5), (0.17, 0.71), (0.11, 0.88))  # bowl radius, height above the tile


def build(variant=None):
    m = Model("chocolateFountain", seed=29)
    steel = m.material("Steel", (0.6, 0.6, 0.62), metallic=1.0, roughness=0.6)
    steel_dark = m.material("Steel Dark", (0.25, 0.25, 0.27), metallic=1.0, roughness=0.6)
    chocolate = m.material("Chocolate", (0.1, 0.04, 0.015), roughness=0.5)
    strawberry = m.material("Strawberry", (0.55, 0.03, 0.03))
    leaf = m.material("Fruit Leaf", (0.06, 0.25, 0.03))
    shield = m.material("Shield", (0.3, 0.1, 0.03), double_sided=True)

    m.cylinder(0.2, 0.12, (0, 0, TILE + 0.06), steel, radius2=0.16, segments=28, bevel=0.01)
    m.cylinder(0.02, 0.02, (0.0, -0.19, TILE + 0.06), steel_dark, rot=(math.pi / 2, 0, 0), segments=10)
    m.cylinder(0.34, 0.06, (0, 0, TILE + 0.15), steel, radius2=0.36, segments=32, bevel=0.012)
    m.cylinder(0.33, 0.012, (0, 0, TILE + 0.18), chocolate, segments=32)
    m.cylinder(0.025, 0.85, (0, 0, TILE + 0.6), steel, segments=12)
    falls_to = TILE + 0.18
    for radius, height in TIERS:
        z = TILE + height
        m.cylinder(radius * 0.4, 0.05, (0, 0, z - 0.025), steel, radius2=radius, segments=28)
        m.cylinder(radius * 0.98, 0.008, (0, 0, z + 0.002), chocolate, segments=28)
        drop = z - falls_to
        # the chocolate curtain from the rim down to the bowl below, flaring as it falls
        m.cylinder(radius * 1.12, drop, (0, 0, z - drop / 2), chocolate, radius2=radius * 1.01, segments=28, caps=False)
        for k in range(10):
            angle = k * math.tau / 10 + 0.3
            m.sphere(0.012, (math.cos(angle) * radius * 1.12, math.sin(angle) * radius * 1.12, falls_to + 0.006), chocolate, scale=(1, 1, 0.7), segments=8, rings=5)
        falls_to = z
    m.sphere(0.06, (0, 0, TILE + 0.95), chocolate, scale=(1, 1, 0.8), segments=16, rings=10)
    for k in range(6):
        angle = k * math.tau / 6 + 0.5
        x, y = math.cos(angle) * 0.34, math.sin(angle) * 0.34
        m.sphere(0.028, (x, y, TILE + 0.2), strawberry, scale=(1, 1, 1.2), segments=10, rings=7)
        m.cylinder(0.022, 0.01, (x, y, TILE + 0.235), leaf, radius2=0.006, segments=7)

    # the shield's dome: the upper half of an ellipsoid, radius 2 around, from 0.34 up to 1.86
    made = bmesh.ops.create_uvsphere(m.bm, u_segments=32, v_segments=16, radius=1.0)
    lower = [face for face in {f for v in made["verts"] for f in v.link_faces} if face.calc_center_median().z < 0]
    bmesh.ops.delete(m.bm, geom=lower, context="FACES")
    dome = [vert for vert in made["verts"] if vert.is_valid]
    for vert in dome:
        vert.co.x *= 2.0
        vert.co.y *= 2.0
        vert.co.z = vert.co.z * 1.52 + 0.34
    m._part(dome, shield, normals=False)
    return m
