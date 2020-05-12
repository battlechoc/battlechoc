import { EntityType, AttackType } from 'battlechoc-shared-functions';
import fmt from '../Fmt';

const referenceLanguage = 'en';
const strings = {
    en: require('./en_strings.js'),
    de: require('./de_strings.js'),
    jp: require('./jp_strings.js')
};

const translationPredicates = {
    TOOLTIP_INITIAL_TURN_OPPONENT: function (strings, name) {
        return name + strings.TOOLTIP_INITIAL_TURN_OPPONENT;
    },
    TOOLTIP_BUILDING_TITLE: function (strings, type) {
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
                return strings['TOOLTIP_BUILDING_TITLE_' + type.replace('EntityType.', '')];
            default: return strings.TOOLTIP_BUILDING_TITLE_UNKNOWN;
        }
    },
    TOOLTIP_BUILDING_INFO: function (strings, type, building) {
        switch (type) {
            case EntityType.CREAM:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_CREAM,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.FACTORY_EXTENSION:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_FACTORY_EXTENSION,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_BUILDINGS_PER_TURN + building.buildingsPerTurn
                }
            case EntityType.CACAOTREE:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_CACAOTREE,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_CACAO_PER_TURN + building.cacaoPerTurn
                }
            case EntityType.RUM_TRUFFLE_CANNON:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_RUM_TRUFFLE_CANNON,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_ATTACKS_PER_TURN
                }
            case EntityType.XMAS_FACTORY:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_XMAS_FACTORY,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.SPYING_EASTER_BUNNY:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_SPYING_EASTER_BUNNY,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_SPYING_PER_TURN
                }
            case EntityType.CHOCOLATE_FOUNTAIN:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN_ADVANTAGE
                }
            case EntityType.FRUIT_CANNON:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_FRUIT_CANNON,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_FRUIT_CANNON_ADVANTAGE
                }
            case EntityType.DONUT_FACTORY:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_FACTORY,
                    costs: strings.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: strings.TOOLTIP_BUILDING_INFO_DONUT_FACTORY_ADVANTAGE_PART + `${building.donutProbability * 100}%`
                }
            case EntityType.DONUT_PORTAL_RED:
            case EntityType.DONUT_PORTAL_BLUE:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_PORTAL_RED_BLUE
                }
            case EntityType.DONUT_CREAM_WHITE:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_CREAM_WHITE
                }
            case EntityType.DONUT_HEALTH_GREEN:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_HEALTH_GREEN
                }
            case EntityType.DONUT_STOP_PINK:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_STOP_PINK
                }
            case EntityType.DONUT_SURPRISE_YELLOW:
                return {
                    info: strings.TOOLTIP_BUILDING_INFO_DONUT_SURPRISE_YELLOW
                }
            default: return { info: strings.TOOLTIP_BUILDING_INFO_UNKNOWN }
        }
    },
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE: function (strings, attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return strings['TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];
            default: return strings.TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE: function (strings, attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return strings['TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];;
            default: return strings.TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    ATTRIBUTE_NAME: function (strings, attribute) {
        switch (attribute) {
            case 'hp':
            case 'area':
            case 'buildingsPerTurn':
            case 'cacaoPerTurn':
            case 'attack':
            case 'fortune':
            case 'donutProbability':
            case 'donutTypes':
                return strings['ATTRIBUTE_NAME_' + attribute];
            default: return strings.ATTRIBUTE_NAME_UNKNOWN;
        }
    },
    WARNING_PLAYER_NOT_FOUND: function (strings, name) {
        return fmt(strings.WARNING_PLAYER_NOT_FOUND, { name: name });
    },
    SURRENDER_GAME_TEXT: function (strings, name, coins) {
        return fmt(strings.SURRENDER_GAME_TEXT, { name: name, coins: coins })
    },
    UPDATE_LEVEL_FAILED: function (strings, upgrade) {
        return upgrade ? strings.UPDATE_LEVEL_FAILED_UPGRADE : strings.UPDATE_LEVEL_FAILED_DOWNGRADE;
    },
    NOTIFICATION_UNLOCK_EXTENSION_MESSAGE: function (strings, coins) {
        return fmt(strings.NOTIFICATION_UNLOCK_EXTENSION_MESSAGE, { coins: coins });
    },
    NOTIFICATION_UNLOCK_BUNNY_MESSAGE: function (strings, coins) {
        return fmt(strings.NOTIFICATION_UNLOCK_BUNNY_MESSAGE, { coins: coins });
    },
    NOTIFICATION_UNLOCK_FOUNTAIN_MESSAGE: function (strings, coins) {
        return fmt(strings.NOTIFICATION_UNLOCK_FOUNTAIN_MESSAGE, { coins: coins });
    },
    PLAYER_NAME_GENERATED_BODY: function (strings, name) {
        return fmt(strings.PLAYER_NAME_GENERATED_BODY, { name: name });
    },
    COINS_FOR_NEXT_FEATURE_TITLE: function (strings, feature) {
        return fmt(strings.COINS_FOR_NEXT_FEATURE_TITLE, { feature: feature });
    },
    COINS_FOR_NEXT_FEATURE_BODY: function (strings, feature, missingScore) {
        return fmt(strings.COINS_FOR_NEXT_FEATURE_BODY, { feature: feature, missingScore: missingScore });
    }
};

const predicateNames = Object.freeze(Object.keys(translationPredicates));

const translations = {
    ...strings,
    isPredicate: (predicateName) => {
        return predicateNames.includes(predicateName);
    },
    callPredicate: (language, predicateName, ...rest) => {
        if (translationPredicates[predicateName] === 'Undefined') {
            console.warn("Could not find predicate function with given key in translations: {}", predicateName);
            return "";
        } else {
            return translationPredicates[predicateName](translations[language], ...([].slice.call(rest, 0)));
        }
    }
}

const keys = { ...strings[referenceLanguage], ...translationPredicates };
Object.keys(keys).forEach(key => keys[key] = key);
const referenceKeys = Object.freeze(keys);

export { translations, referenceKeys };