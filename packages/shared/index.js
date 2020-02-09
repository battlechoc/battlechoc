const BoardCellTypes = Object.freeze({
  WHITE: 'BoardCellTypes.WHITE',
  BROWN: 'BoardCellTypes.BROWN',
  BLACK: 'BoardCellTypes.BLACK'
});

const EntityType = Object.freeze({
  CREAM: 'EntityType.CREAM',
  FACTORY: 'EntityType.FACTORY',
  FACTORY_EXTENSION: 'EntityType.FACTORY_EXTENSION',
  CACAOTREE: 'EntityType.CACAOTREE',
  RUM_TRUFFLE_CANNON: 'EntityType.RUM_TRUFFLE_CANNON',
  FRUIT_CANNON: 'EntityType.FRUIT_CANNON',
  SPYING_EASTER_BUNNY: 'EntityType.SPYING_EASTER_BUNNY',
  XMAS_FACTORY: 'EntityType.XMAS_FACTORY',
  HOT_CHOCOLATE_BALLISTA: 'EntityType.HOT_CHOCOLATE_BALLISTA',
  CHOCOLATE_FOUNTAIN: 'EntityType.CHOCOLATE_FOUNTAIN',
  DONUT_FACTORY: 'EntityType.DONUT_FACTORY',
  DONUT_PORTAL_BLUE: 'EntityType.DONUT_PORTAL_BLUE',
  DONUT_PORTAL_RED: 'EntityType.DONUT_PORTAL_RED',
  DONUT_SURPRISE_YELLOW: 'EntityType.DONUT_SURPRISE_YELLOW',
  DONUT_HEALTH_GREEN: 'EntityType.DONUT_HEALTH_GREEN',
  DONUT_STOP_PINK: 'EntityType.DONUT_STOP_PINK',
  DONUT_CREAM_WHITE: 'EntityType.DONUT_CREAM_WHITE',
  isInstanceOf: function (entityType) {
    if (entityType === EntityType.CREAM ||
      entityType === EntityType.FACTORY ||
      entityType === EntityType.CACAOTREE ||
      entityType === EntityType.RUM_TRUFFLE_CANNON ||
      entityType === EntityType.FACTORY_EXTENSION ||
      entityType === EntityType.SPYING_EASTER_BUNNY ||
      entityType === EntityType.XMAS_FACTORY ||
      entityType === EntityType.HOT_CHOCOLATE_BALLISTA ||
      entityType === EntityType.CHOCOLATE_FOUNTAIN ||
      entityType === EntityType.FRUIT_CANNON ||
      entityType === EntityType.DONUT_FACTORY ||
      entityType === EntityType.DONUT_PORTAL_RED ||
      entityType === EntityType.DONUT_PORTAL_BLUE ||
      entityType === EntityType.DONUT_SURPRISE_YELLOW ||
      entityType === EntityType.DONUT_HEALTH_GREEN ||
      entityType === EntityType.DONUT_STOP_PINK ||
      entityType === EntityType.DONUT_CREAM_WHITE) {
      return true;
    } else {
      return false;
    }
  }
});

const isDonut = entityType => [
  EntityType.DONUT_HEALTH_GREEN,
  EntityType.DONUT_STOP_PINK, 
  EntityType.DONUT_CREAM_WHITE, 
  EntityType.DONUT_PORTAL_RED, 
  EntityType.DONUT_PORTAL_BLUE, 
  EntityType.DONUT_SURPRISE_YELLOW
].includes(entityType)

const AttackType = Object.freeze({
  TRUFFLE: 'AttackType.TRUFFLE',
  FRUIT: 'AttackType.FRUIT',
  HOT_CHOCOLATE: 'AttackType.HOT_CHOCOLATE',
  BUNNY: 'AttackType.BUNNY',
  isInstanceOf: function (attackType) {
    if (attackType === AttackType.TRUFFLE ||
      attackType === AttackType.FRUIT ||
      attackType === AttackType.HOT_CHOCOLATE ||
      attackType === AttackType.BUNNY) {
      return true;
    }
    else {
      return false;
    }
  }
});

module.exports = {
  BoardCellTypes: BoardCellTypes,
  EntityType: EntityType,
  AttackType: AttackType,
  isDonut: isDonut
}