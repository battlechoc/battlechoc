import { EntityType, AttackType } from 'battlechoc-shared-functions';
const strings = require('./ja_strings.json');

const texts = {
    ...strings,
    TOOLTIP_INITIAL_TURN_OPPONENT: function (name) {
        return name + this.TOOLTIP_INITIAL_TURN_OPPONENT_PART;
    },
    TOOLTIP_BUILDING_TITLE: function (type) {
        switch (type) {
            case EntityType.CREAM:
            case EntityType.FACTORY_EXTENSION:
            case EntityType.FACTORY:
            case EntityType.HOT_CHOCOLATE_BALLISTA:
            case EntityType.CACAOTREE:
            case EntityType.RUM_TRUFFLE_CANNON:
            case EntityType.XMAS_FACTORY:
            case EntityType.SPYING_EASTER_BUNNY:
            case EntityType.CHOCOLATE_FOUNTAIN:
            case EntityType.FRUIT_CANNON:
            case EntityType.DONUT_FACTORY:
            case EntityType.DONUT_PORTAL_RED:
            case EntityType.DONUT_PORTAL_BLUE:
            case EntityType.DONUT_STOP_PINK:
            case EntityType.DONUT_SURPRISE_YELLOW:
            case EntityType.DONUT_HEALTH_GREEN:
            case EntityType.DONUT_CREAM_WHITE:
                return this['TOOLTIP_BUILDING_TITLE_' + type.replace('EntityType.', '')];
            default: return this.TOOLTIP_BUILDING_TITLE_UNKNOWN;
        }
    },
    TOOLTIP_BUILDING_INFO: function (type, building) {
        switch (type) {
            case EntityType.CREAM:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_CREAM,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.FACTORY_EXTENSION:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_FACTORY_EXTENSION,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_BUILDINGS_PER_TURN + building.buildingsPerTurn
                }
            case EntityType.CACAOTREE:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_CACAOTREE,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_CACAO_PER_TURN + building.cacaoPerTurn
                }
            case EntityType.RUM_TRUFFLE_CANNON:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_RUM_TRUFFLE_CANNON,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_ATTACKS_PER_TURN
                }
            case EntityType.XMAS_FACTORY:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_XMAS_FACTORY,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.SPYING_EASTER_BUNNY:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_SPYING_EASTER_BUNNY,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_SPYING_PER_TURN
                }
            case EntityType.CHOCOLATE_FOUNTAIN:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN_ADVANTAGE
                }
            case EntityType.FRUIT_CANNON:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_FRUIT_CANNON,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_FRUIT_CANNON_ADVANTAGE
                }
            case EntityType.DONUT_FACTORY:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_FACTORY,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_DONUT_FACTORY_ADVANTAGE_PART + `${building.donutProbability * 100}%`
                }
            case EntityType.DONUT_PORTAL_RED:
            case EntityType.DONUT_PORTAL_BLUE:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_PORTAL_RED_BLUE
                }
            case EntityType.DONUT_CREAM_WHITE:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_CREAM_WHITE
                }
            case EntityType.DONUT_HEALTH_GREEN:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_HEALTH_GREEN
                }
            case EntityType.DONUT_STOP_PINK:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_STOP_PINK
                }
            case EntityType.DONUT_SURPRISE_YELLOW:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_SURPRISE_YELLOW
                }
            default: return { info: this.TOOLTIP_BUILDING_INFO_UNKNOWN }
        }
    },
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE: function (attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return this['TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];
            default: return this.TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE: function (attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return this['TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];;
            default: return this.TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    ATTRIBUTE_NAME: function (attribute) {
        switch (attribute) {
            case 'hp':
            case 'area':
            case 'buildingsPerTurn':
            case 'cacaoPerTurn':
            case 'attack':
            case 'fortune':
            case 'donutProbability':
            case 'donutTypes':
                return this['ATTRIBUTE_NAME_' + attribute];
            default: return this.ATTRIBUTE_NAME_UNKNOWN;
        }
    },
    WARNING_PLAYER_NOT_FOUND: function (name) {
        return this.WARNING_PLAYER_NOT_FOUND_PRE_PART + name + this.WARNING_PLAYER_NOT_FOUND_PRE_PART
    },
    SURRENDER_GAME_TEXT: function (name) {
        return this.SURRENDER_GAME_TEXT_PART + name
    },
    UPDATE_LEVEL_FAILED: function (upgrade) {
        return upgrade ? this.UPDATE_LEVEL_FAILED_UPGRADE : this.UPDATE_LEVEL_FAILED_DOWNGRADE;
    }
};

export default texts;