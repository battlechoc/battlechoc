# The title screen's decoration (public/images/decoration.svg): a glazed donut on a broken bar of
# chocolate, like the user's drawing it replaces. Not a game model; render_icons.py renders it.
from mathutils import Matrix, Vector

from build import TILE, Model
from models.parts import donut

SEGMENT = (0.34, 0.22, 0.11)  # one square of the bar: length, width, height above the base
BASE = 0.05  # the bar's back plate
GAP = 0.025  # the groove between two squares


def build(variant=None):
    m = Model("decoration", seed=43)
    # milk chocolate (the icons' look darkens browns)
    chocolate = m.material("Chocolate", (0.36, 0.135, 0.045), roughness=0.6)
    dough = m.material("Dough", (0.75, 0.32, 0.08), roughness=0.8)
    glaze = m.material("Glaze Pink", (0.85, 0.12, 0.3), roughness=0.55)
    sprinkles = [
        m.material(name, color)
        for name, color in (
            ("Sprinkle White", (0.9, 0.9, 0.9)),
            ("Sprinkle Yellow", (0.9, 0.7, 0.05)),
            ("Sprinkle Blue", (0.1, 0.35, 0.9)),
        )
    ]

    # three pieces broken off one bar, lying a little apart and askew: (squares long, squares
    # wide, where, turn)
    for length, width, at, turn in (
        (3, 2, (0.0, 0.0), 0.0),
        (2, 1, (-0.16, 0.6), 0.05),
        (1, 2, (1.2, -0.04), -0.1),
    ):
        piece(m, chocolate, length, width, Vector((*at, 0.0)), turn)

    donut(m, (0.42, 0.24, BASE + SEGMENT[2] + 0.1), 0.21, 0.11, dough, glaze, sprinkles, count=90, flatten=1.0)
    # standing where the models stand: on top of a board tile
    m.transform(Matrix.Translation((0, 0, TILE)))
    return m


def piece(m, mat, length, width, at, turn):
    """Squares of a chocolate bar on a thin back plate, each with chamfered edges."""
    sx, sy, sz = SEGMENT
    total = Vector((length * sx + (length - 1) * GAP, width * sy + (width - 1) * GAP))
    faces = m.box((total.x + 0.02, total.y + 0.02, BASE), at + Vector((total.x / 2, total.y / 2, BASE / 2)), mat, bevel=0.006)
    for i in range(length):
        for j in range(width):
            centre = at + Vector((i * (sx + GAP) + sx / 2, j * (sy + GAP) + sy / 2, BASE + sz / 2))
            faces += m.box((sx, sy, sz), centre, mat, bevel=0.035, segments=1)
    pivot = at + Vector((total.x / 2, total.y / 2, 0))
    m.transform(Matrix.Translation(pivot) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Translation(-pivot), faces)
    return faces
