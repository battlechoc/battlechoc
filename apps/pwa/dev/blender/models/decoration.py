# The title screen's decoration (public/images/decoration.svg): a glazed donut on a whole bar of
# chocolate with chunky squares, like the user's drawing it replaces. Not a game model;
# render_icons.py renders it.
import math

import bmesh
from mathutils import Matrix, Vector

from build import TILE, Model
from models.parts import sprinkle

SEGMENT = (0.5, 0.26, 0.2)  # one square of the bar: length, width, height
CHAMFER = 0.07  # the slanted rim around the top of a square
COLUMNS, ROWS = 3, 5  # the bar's squares
RADIUS = 0.25  # the donut's, to the middle of its tube


def build(variant=None):
    m = Model("decoration", seed=43)
    # milk chocolate (the icons' look darkens browns)
    chocolate = m.material("Chocolate", (0.42, 0.2, 0.08), roughness=0.6)
    dough = m.material("Dough", (0.8, 0.33, 0.04), roughness=0.75)
    glaze = m.material("Glaze Pink", (0.85, 0.12, 0.3), roughness=0.5)
    sprinkles = [
        m.material(name, color)
        for name, color in (
            ("Sprinkle White", (0.9, 0.9, 0.9)),
            ("Sprinkle Yellow", (0.9, 0.7, 0.05)),
            ("Sprinkle Blue", (0.1, 0.35, 0.9)),
        )
    ]

    sx, sy, sz = SEGMENT
    for i in range(COLUMNS):
        for j in range(ROWS):
            square(m, chocolate, Vector((i * sx, j * sy, sz / 2)))
    # the bar's middle at the origin
    m.transform(Matrix.Translation((-COLUMNS * sx / 2, -ROWS * sy / 2, 0)))
    # plump like the old drawing's: taller than round, the dough's lower half showing
    tube = RADIUS / 2
    centre = Vector((0.0, 0.0, sz + tube * 1.35))
    faces = list(m.ring(centre, (0, 0, 1), RADIUS, tube, dough, segments=48, minor=24))
    faces += icing(m, centre, RADIUS, tube, glaze)
    faces += sprinkle(m, centre, RADIUS, tube, sprinkles, 250, spread=(0.2, 0.8))
    m.transform(Matrix.Translation(centre) @ Matrix.Diagonal((1, 1, 1.35, 1)) @ Matrix.Translation(-centre), faces)
    # standing where the models stand: on top of a board tile
    m.transform(Matrix.Translation((0, 0, TILE)))
    return m


def icing(m, centre, radius, tube, mat, drips=11, segments=120, minor=28):
    """The donut's glaze: over the top and running down the outside in `drips` drips of different
    lengths and widths, a rounded lip along its edge. Built along its edge (not cut out of a
    torus), so the drips are smooth."""
    shell = tube * 1.07
    drops = [(m.random.uniform(0, math.tau), m.random.uniform(0.1, 0.22), m.random.uniform(0.25, 1.05)) for _ in range(drips)]

    def down(phi, scale=1.0):
        """How far the glaze runs down at `phi`, in tube radii."""
        longest = 0.0
        for at, width, length in drops:
            x = (math.remainder(phi - at, math.tau)) / width
            if abs(x) < 1:
                longest = max(longest, length * scale * (1 - x * x) ** 2)
        return longest

    def at(phi, theta):
        radial = Vector((math.cos(phi), math.sin(phi), 0))
        return centre + radial * (radius + shell * math.cos(theta)) + Vector((0, 0, shell * math.sin(theta)))

    columns = []
    for k in range(segments):
        phi = math.tau * k / segments
        wobble = 0.06 * math.sin(3 * phi + 1.0)
        outer = math.asin(max(-0.95, min(0.95, 0.1 + wobble - down(phi))))
        inner = math.pi - math.asin(max(-0.95, min(0.95, 0.25 - down(phi, 0.3))))
        columns.append([at(phi, outer + (inner - outer) * t / minor) for t in range(minor + 1)])
    verts = [[m.bm.verts.new(point) for point in column] for column in columns]
    faces = []
    for k in range(segments):
        a, b = verts[k], verts[(k + 1) % segments]
        for t in range(minor):
            face = m.bm.faces.new((a[t], b[t], b[t + 1], a[t + 1]))
            face.material_index = mat
            face.smooth = True
            faces.append(face)
    bmesh.ops.recalc_face_normals(m.bm, faces=faces)
    # the lip: the glaze is thick, its edge round
    for edge in (0, minor):
        faces += m.tube([column[edge] for column in columns], tube * 0.06, mat, segments=8, closed=True)
    return faces


def square(m, mat, corner):
    """One square of the bar: a block with a chamfered top and slightly rounded edges, its corner
    at `corner` (+x, +y); neighbours touch at the bottom, so the chamfers make the grooves between
    them."""
    sx, sy, sz = SEGMENT
    made = bmesh.ops.create_cube(m.bm, size=1.0, matrix=Matrix.Translation(corner + Vector((sx / 2, sy / 2, 0))) @ Matrix.Diagonal((sx, sy, sz, 1)))
    faces = list({face for vert in made["verts"] for face in vert.link_faces})
    top = max(faces, key=lambda face: face.calc_center_median().z)
    bevelled = bmesh.ops.bevel(m.bm, geom=list(top.edges), offset=CHAMFER, offset_type="OFFSET", segments=1, affect="EDGES")
    faces = [face for face in faces if face.is_valid] + list(bevelled["faces"])
    edges = list({edge for face in faces for edge in face.edges})
    rounded = bmesh.ops.bevel(m.bm, geom=edges, offset=0.008, offset_type="OFFSET", segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    faces = [face for face in faces if face.is_valid] + list(rounded["faces"])
    for face in faces:
        face.material_index = mat
    return faces
