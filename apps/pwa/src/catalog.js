import {
  AttackType,
  BoardCellTypes,
  EntityType,
} from "@battlechoc/battlechoc-shared-functions";

// What the game shows for each thing of the rules: the picture of a building, an attack and a
// trap donut (public/images/<icon>-icon.svg) and the 3D model of a cell, a building or a donut
// (public/models/<model>). The palettes, the lab, the dialogs and the asset loader take them
// from here.

/** public/images/<name>-icon.svg */
export const iconUrl = (name) => `/images/${name}-icon.svg`;

/** The picture of each building (and of cream). */
export const BUILDING_ICON = Object.freeze({
  [EntityType.FACTORY]: "factory",
  [EntityType.CACAOTREE]: "cacao-tree",
  [EntityType.RUM_TRUFFLE_CANNON]: "truffle-cannon",
  [EntityType.FACTORY_EXTENSION]: "factory-extension",
  [EntityType.SPYING_EASTER_BUNNY]: "easter-bunny",
  [EntityType.XMAS_FACTORY]: "xmas-factory",
  [EntityType.CHOCOLATE_FOUNTAIN]: "fountain",
  [EntityType.FRUIT_CANNON]: "fruit-cannon",
  [EntityType.HOT_CHOCOLATE_BALLISTA]: "ballista",
  [EntityType.DONUT_FACTORY]: "donut-factory",
  [EntityType.CREAM]: "cream",
});

/** The picture of each attack: the building that fires it. */
export const ATTACK_ICON = Object.freeze({
  [AttackType.TRUFFLE]: BUILDING_ICON[EntityType.RUM_TRUFFLE_CANNON],
  [AttackType.FRUIT]: BUILDING_ICON[EntityType.FRUIT_CANNON],
  [AttackType.BUNNY]: BUILDING_ICON[EntityType.SPYING_EASTER_BUNNY],
  [AttackType.HOT_CHOCOLATE]: BUILDING_ICON[EntityType.HOT_CHOCOLATE_BALLISTA],
});

/** The picture of each trap donut (both portals share one). */
export const DONUT_ICON = Object.freeze({
  [EntityType.DONUT_PORTAL_BLUE]: "portal-donut",
  [EntityType.DONUT_PORTAL_RED]: "portal-donut",
  [EntityType.DONUT_SURPRISE_YELLOW]: "surprise-donut",
  [EntityType.DONUT_HEALTH_GREEN]: "health-donut",
  [EntityType.DONUT_STOP_PINK]: "stop-donut",
  [EntityType.DONUT_CREAM_WHITE]: "cream-donut",
});

/** What the build palette of a match offers, in its order (the factory is placed before). */
export const BUILD_PALETTE = Object.freeze([
  EntityType.CACAOTREE,
  EntityType.RUM_TRUFFLE_CANNON,
  EntityType.CREAM,
  EntityType.FACTORY_EXTENSION,
  EntityType.SPYING_EASTER_BUNNY,
  EntityType.XMAS_FACTORY,
  EntityType.CHOCOLATE_FOUNTAIN,
  EntityType.FRUIT_CANNON,
  EntityType.DONUT_FACTORY,
]);

/** The weapons of a match, in the palette's order. */
export const WEAPON_PALETTE = Object.freeze([
  AttackType.TRUFFLE,
  AttackType.FRUIT,
  AttackType.BUNNY,
  AttackType.HOT_CHOCOLATE,
]);

/** The buildings the Choclab equips, in its order. */
export const LAB_BUILDINGS = Object.freeze([
  EntityType.FACTORY,
  EntityType.CACAOTREE,
  EntityType.RUM_TRUFFLE_CANNON,
  EntityType.FACTORY_EXTENSION,
  EntityType.SPYING_EASTER_BUNNY,
  EntityType.XMAS_FACTORY,
  EntityType.CHOCOLATE_FOUNTAIN,
  EntityType.FRUIT_CANNON,
  EntityType.HOT_CHOCOLATE_BALLISTA,
  EntityType.DONUT_FACTORY,
]);

/** The 3D model of each cell, building and donut (public/models/): keys sharing a file get
 * copies of one import (AssetLoader). */
export const MODEL = Object.freeze({
  [BoardCellTypes.WHITE]: "field.glb",
  [BoardCellTypes.BROWN]: "field.glb",
  [BoardCellTypes.BLACK]: "field.glb",
  [EntityType.FACTORY]: "factory.glb",
  [EntityType.FACTORY_EXTENSION]: "factoryExtension.glb",
  [EntityType.CACAOTREE]: "cacaotree.glb",
  [EntityType.RUM_TRUFFLE_CANNON]: "cannon.glb",
  [EntityType.CREAM]: "cream.glb",
  [EntityType.CREAM + ".AROUND.BUILDING"]: "creamAroundBuilding.glb",
  [EntityType.SPYING_EASTER_BUNNY]: "spyingEasterBunny.glb",
  [EntityType.XMAS_FACTORY]: "xmasFactory.glb",
  [EntityType.HOT_CHOCOLATE_BALLISTA]: "hotChocolateBallista.glb",
  [EntityType.CHOCOLATE_FOUNTAIN]: "chocolateFountain.glb",
  [EntityType.FRUIT_CANNON]: "fruitCannon.glb",
  [EntityType.DONUT_FACTORY]: "donutFactory.glb",
  // the trap donuts share one model, DONUT_COLORS (AssetLoader) paints them
  [EntityType.DONUT_PORTAL_RED]: "donut.glb",
  [EntityType.DONUT_PORTAL_BLUE]: "donut.glb",
  [EntityType.DONUT_SURPRISE_YELLOW]: "donut.glb",
  [EntityType.DONUT_STOP_PINK]: "donut.glb",
  [EntityType.DONUT_CREAM_WHITE]: "donut.glb",
  [EntityType.DONUT_HEALTH_GREEN]: "donut.glb",
});

/** Every icon of the catalog as a file name in public/images (for the asset loader). */
export const catalogIconFiles = () => [
  ...new Set(
    [...Object.values(BUILDING_ICON), ...Object.values(DONUT_ICON)].map((name) => `${name}-icon.svg`)
  ),
];
