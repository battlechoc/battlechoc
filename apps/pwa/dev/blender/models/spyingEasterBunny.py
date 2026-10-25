# The spying easter bunny: the user's model (dev/models/spyingEasterBunny.blend) in a nest of grass
# (the nest green and covered in blades) with its yellow body in crinkled metallic foil. (A ribbon
# with a bell looked too much like a well-known chocolate bunny.)
import math
import os

import bmesh
from mathutils import Vector, noise

from build import Model

SMOOTH_ANGLE = 40
MODEL = os.path.join(os.path.dirname(__file__), "..", "..", "models", "spyingEasterBunny.blend")
NEST = Vector((-0.043, 0.008, 0.0))
NEST_MATERIAL = "Material.019"
FOIL_MATERIAL = "Material.018"
# foil: metallic, roughness, base colour; full metal mirrors the green nest and the sky and turns
# olive, so the foil is part metal
FOILS = {
    None: (0.5, 0.3, (1.0, 0.75, 0.1)),
    "f2": (0.7, 0.25, (1.0, 0.8, 0.15)),
    "f3": (1.0, 0.45, (1.0, 0.82, 0.2)),
}


def build(variant=None):
    m = Model("spyingEasterBunny", seed=23)
    m.include(MODEL)
    restyle(m, NEST_MATERIAL, color=(0.07, 0.24, 0.03), roughness=0.9)
    metallic, roughness, color = FOILS.get(variant, FOILS[None])
    restyle(m, FOIL_MATERIAL, color=color, metallic=metallic, roughness=roughness)
    crinkle(m, m.materials[FOIL_MATERIAL][0])
    grass = (
        m.material("Grass Dark", (0.05, 0.2, 0.025), double_sided=True),
        m.material("Grass", (0.1, 0.32, 0.04), double_sided=True),
        m.material("Grass Light", (0.22, 0.48, 0.06), double_sided=True),
    )

    # blades all over the outside of the nest, standing on it (found by rays before any is added)
    spots = []
    for row in range(8):
        z = 0.355 + row * 0.042
        for k in range(60):
            angle = (k + 0.5 * (row % 2)) * math.tau / 60 + m.random.uniform(-0.03, 0.03)
            out = Vector((math.cos(angle), math.sin(angle), 0))
            hit = m.surface(NEST + out * 0.8 + Vector((0, 0, z)), -out, offset=0.004)
            # (above the rim a ray can reach the bunny: only the nest's outside counts)
            if hit is not None and (hit - NEST).to_2d().length > 0.4:
                spots.append((hit, out, row))
    for hit, out, row in spots:
        up = (out * m.random.uniform(0.25, 0.6) + Vector((0, 0, 1))).normalized()
        shade = min(2, max(0, int(row / 3 + m.random.uniform(-0.6, 0.9))))
        m.leaf(hit, up, out, m.random.uniform(0.05, 0.09), 0.022, grass[shade], droop=0.4, fold=0.2)

    # longer blades along the inner rim, but not where the bunny sits on it
    for i in range(120):
        angle = i * math.tau / 120 + m.random.uniform(-0.03, 0.03)
        out = Vector((math.cos(angle), math.sin(angle), 0))
        base = NEST + out * m.random.uniform(0.37, 0.42) + Vector((0, 0, 0.6))
        above = m.surface(base + Vector((0, 0, 0.8)), (0, 0, -1))
        if above is not None and above.z > base.z + 0.05:
            continue
        up = (out * m.random.uniform(0.2, 0.6) + Vector((0, 0, 1))).normalized()
        m.leaf(base, up, out, m.random.uniform(0.08, 0.14), 0.024, grass[1 + i % 2], droop=0.45, fold=0.2)
    return m


def restyle(m, name, color, roughness, metallic=0.0):
    """Changes an included material (only in the generated file, not in the user's)."""
    material = m.materials[name][1]["existing"]
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if metallic:
        bsdf.inputs["Specular IOR Level"].default_value = 0.5
    material.diffuse_color = (*color, 1)


def crinkle(m, slot, cuts=2, depth=0.006):
    """Crumples the faces of one material like foil: finer faces, pushed in and out by noise. Only
    vertices the material has to itself move, so it does not tear from its neighbours."""
    faces = [face for face in m.bm.faces if face.material_index == slot]
    edges = list({edge for face in faces for edge in face.edges})
    bmesh.ops.subdivide_edges(m.bm, edges=edges, cuts=cuts, use_grid_fill=True)
    m.bm.normal_update()
    inside = [
        vert
        for vert in m.bm.verts
        if vert.link_faces and all(face.material_index == slot for face in vert.link_faces)
    ]
    moves = []
    for vert in inside:
        p = vert.co
        bump = noise.noise(p * 45.0) * 0.7 + noise.noise(p * 110.0) * 0.3
        moves.append((vert, vert.normal * (bump * depth)))
    for vert, move in moves:
        vert.co += move
