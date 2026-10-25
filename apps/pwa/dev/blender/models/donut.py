# A donut trap: it lies where the tile would be (the game removes the tile under a donut), the size
# of a cell. The game paints the six trap colours on the materials "Topping" (glaze) and
# "Material.002" (sprinkles), so those names must stay.
from build import Model
from models.parts import donut


def build(variant=None):
    m = Model("donut", seed=17)
    dough = m.material("Material.001", (0.75, 0.32, 0.08), roughness=0.8)
    glaze = m.material("Topping", (0.37, 0.66, 0.8), roughness=0.6)
    sprinkles = m.material("Material.002", (0.04, 0.0, 0.8))
    donut(m, (0.0, 0.0, 0.11), 0.31, 0.17, dough, glaze, sprinkles, count=110, flatten=1.4)
    return m
