// battlechoc definitions shared by the PWA and the API: constants, entity stats per Choclab
// level, errors, translations, the real-time rules engine (engine/) and the live match
// protocol (live/). The turn-based engine was removed with the switch to real time.

const {
    BoardCellTypes,
    EntityType,
    isDonut,
    AttackType,
    PlayerType,
    EmptyPlayerStats,
    finalLevel,
    linearGrowFunction,
    exponentialGrowFunction,
} = require('./constants');
const {
    BattlechocError,
    ActionValidationError,
    InvalidActionIssuerError,
    NoBuildingsLeftError,
    NoCacaoLeftError,
    BuildNotPossibleError,
    NoAttacksLeftError,
    TargetEmptyError,
    UnexpectedStateError,
    GameAlreadyEndedError,
    GameNotRunningError,
    AlreadyMolten,
    NoHealthyInternetConnectionError,
} = require('./errors');

const SurrenderCosts = 20;

const EntityDescriptors = Object.freeze(new Map([
    [EntityType.CREAM, () => ({
        level: { max: 1 },
        hp: 1,
        area: 1,
        costs: 10
    })],
    [EntityType.FACTORY, level => ({
        hp: linearGrowFunction(level, 11, 52),
        cacaoPerTurn: linearGrowFunction(level, 15, 35),
        buildingsPerTurn: (() => {
            if (level > 14) {
                return 4;
            } else if (level > 6) {
                return 3;
            } else {
                return 2;
            }
        })(),
        costs: 0,
        coins: exponentialGrowFunction(level, 102, 13002)
    })],
    [EntityType.FACTORY_EXTENSION, level => ({
        hp: linearGrowFunction(level, 11, 52),
        buildingsPerTurn: (() => {
            if (level > 14) {
                return 4;
            } else if (level > 6) {
                return 3;
            } else {
                return 2;
            }
        })(),
        costs: 120,
        coins: exponentialGrowFunction(level, 71, 12201)
    })],
    [EntityType.CACAOTREE, level => ({
        hp: linearGrowFunction(level, 5, 19),
        cacaoPerTurn: linearGrowFunction(level, 30, 52),
        costs: 20,
        coins: exponentialGrowFunction(level, 24, 8650)
    })],
    [EntityType.RUM_TRUFFLE_CANNON, level => ({
        hp: linearGrowFunction(level, 12, 42),
        attack: linearGrowFunction(level, 9, 53),
        costs: 40,
        coins: exponentialGrowFunction(level, 55, 11203),
        attackType: AttackType.TRUFFLE,
        attacksPerTurn: 1
    })],
    [EntityType.FRUIT_CANNON, level => ({
        hp: linearGrowFunction(level, 12, 42),
        attack: linearGrowFunction(level, 9, 53),
        costs: 40,
        coins: exponentialGrowFunction(level, 55, 11203),
        attackType: AttackType.FRUIT,
        attacksPerTurn: 1
    })],
    [EntityType.SPYING_EASTER_BUNNY, level => ({
        hp: linearGrowFunction(level, 7, 23),
        area: 3,
        costs: 120,
        coins: exponentialGrowFunction(level, 43, 9120),
        attackType: AttackType.BUNNY,
        attacksPerTurn: 1
    })],
    [EntityType.XMAS_FACTORY, level => ({
        hp: linearGrowFunction(level, 11, 45),
        area: 3,
        costs: 80,
        coins: exponentialGrowFunction(level, 32, 8267)
    })],
    [EntityType.HOT_CHOCOLATE_BALLISTA, level => ({
        hp: linearGrowFunction(level, 11, 46),
        costs: 0,
        coins: exponentialGrowFunction(level, 68, 10020),
        attackType: AttackType.HOT_CHOCOLATE,
        attacksPerTurn: 1
    })],
    [EntityType.CHOCOLATE_FOUNTAIN, level => ({
        hp: linearGrowFunction(level, 18, 78),
        costs: 120,
        coins: exponentialGrowFunction(level, 46, 8402)
    })],
    [EntityType.DONUT_FACTORY, level => ({
        hp: linearGrowFunction(level, 8, 31),
        donutProbability: (() => {
            if (level > 14) {
                return 0.999;
            } else if (level > 6) {
                return 0.75;
            } else {
                return 0.666;
            }
        })(),
        donutTypes: (() => {
            if (level > 16) {
                return 5;
            } else if (level > 12) {
                return 4;
            } else {
                return 3;
            }
        })(),
        costs: 240,
        coins: exponentialGrowFunction(level, 44, 10050)
    })]
]));

function getEntityDescriptor(entityType, level) {
    if (isDonut(entityType)) {
        return {
            type: entityType,
            hp: 1,
            costs: 0,
            coins: 0,
            max: { hp: 1 }
        };
    }

    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let descriptor = { type: entityType, ...EntityDescriptors.get(entityType)(level[entityType]) }
        descriptor.max = { hp: descriptor.hp }
        return descriptor;
    }
}

module.exports.BoardCellTypes = BoardCellTypes;
module.exports.EntityType = EntityType;
module.exports.AttackType = AttackType;
module.exports.isDonut = isDonut;
module.exports.getEntityDescriptor = getEntityDescriptor;
module.exports.EntityDescriptors = EntityDescriptors;
module.exports.finalLevel = finalLevel;

// ingredients and progress outside a match
const ingredients = require('./ingredients');
const progression = require('./progression');
module.exports.Rarity = ingredients.Rarity;
module.exports.Ingredient = ingredients.Ingredient;
module.exports.Ingredients = ingredients.Ingredients;
module.exports.SpecialIngredient = progression.SpecialIngredient;
module.exports.ChoclabMilestones = progression.ChoclabMilestones;
module.exports.choclabCost = progression.choclabCost;
module.exports.DropTables = progression.DropTables;
module.exports.DropRules = progression.DropRules;
module.exports.achievementXp = progression.achievementXp;
module.exports.rollDrops = progression.rollDrops;
module.exports.levelRefund = progression.levelRefund;
module.exports.StarterKit = progression.StarterKit;
const equipment = require('./equipment');
module.exports.Items = equipment.Items;
module.exports.Tier = equipment.Tier;
module.exports.Stat = equipment.Stat;
module.exports.LOADOUT_BUDGET = equipment.LOADOUT_BUDGET;
module.exports.SLOTS_PER_BUILDING = equipment.SLOTS_PER_BUILDING;
module.exports.sanitizeLoadout = equipment.sanitizeLoadout;
module.exports.loadoutPoints = equipment.loadoutPoints;
module.exports.applyStat = equipment.applyStat;
const rating = require('./rating');
module.exports.updateRating = rating.updateRating;
module.exports.rateMatch = rating.rateMatch;
module.exports.EmptyPlayerStats = EmptyPlayerStats;
module.exports.PlayerType = PlayerType;

module.exports.BattlechocError = BattlechocError;
module.exports.NoHealthyInternetConnectionError = NoHealthyInternetConnectionError;
module.exports.AlreadyMolten = AlreadyMolten;
module.exports.GameNotRunningError = GameNotRunningError;
module.exports.ActionValidationError = ActionValidationError;
module.exports.NoBuildingsLeftError = NoBuildingsLeftError;
module.exports.NoCacaoLeftError = NoCacaoLeftError;
module.exports.BuildNotPossibleError = BuildNotPossibleError;
module.exports.TargetEmptyError = TargetEmptyError;
module.exports.NoAttacksLeftError = NoAttacksLeftError;
module.exports.UnexpectedStateError = UnexpectedStateError;
module.exports.InvalidActionIssuerError = InvalidActionIssuerError;
module.exports.GameAlreadyEndedError = GameAlreadyEndedError;
module.exports.SurrenderCosts = SurrenderCosts;

// Translations begin

function fmt(str, values) {
    return str.replace(/\{\{(\w+)\}\}/g, function (match, key) {
        return values[key];
    });
};

const validLanguages = ['en', 'de', 'jp', 'es', 'fr', 'it', 'pt', 'vn'];
const referenceLanguage = 'en';
const strings = {
    en: require('./translations/en_strings.js'),
    de: require('./translations/de_strings.js'),
    jp: require('./translations/jp_strings.js'),
    es: require('./translations/es_strings.js'),
    fr: require('./translations/fr_strings.js'),
    it: require('./translations/it_strings.js'),
    pt: require('./translations/pt_strings.js'),
    vn: require('./translations/vn_strings.js')
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
    PLAYER_NAME_GENERATED_BODY: function (strings, name) {
        return fmt(strings.PLAYER_NAME_GENERATED_BODY, { name: name });
    },
    LAB_TABLE_HINT: function (strings, ingredient) {
        return fmt(strings.LAB_TABLE_HINT, { ingredient: ingredient });
    },
    LAB_NEEDS_SPECIAL: function (strings, ingredient) {
        return fmt(strings.LAB_NEEDS_SPECIAL, { ingredient: ingredient });
    },
    LAB_DISCOVERED_BY: function (strings, name) {
        return fmt(strings.LAB_DISCOVERED_BY, { name: name });
    },
    LAB_UNDISCOVERED: function (strings, count) {
        return fmt(strings.LAB_UNDISCOVERED, { count: count });
    },
    LAB_POINTS: function (strings, points) {
        return fmt(strings.LAB_POINTS, { points: points });
    },
    LAB_SLOT_LABEL: function (strings, slot) {
        return fmt(strings.LAB_SLOT_LABEL, { slot: slot });
    },
    END_BAG_FROM: function (strings, achievement) {
        return fmt(strings.END_BAG_FROM, { achievement: achievement });
    },
    MATCHMAKING_AI_IN: function (strings, seconds) {
        return fmt(strings.MATCHMAKING_AI_IN, { seconds: seconds });
    },
    PANTRY_SPOILS_IN: function (strings, time) {
        return fmt(strings.PANTRY_SPOILS_IN, { time: time });
    },
    COINS_FOR_NEXT_FEATURE_TITLE: function (strings, feature) {
        return fmt(strings.COINS_FOR_NEXT_FEATURE_TITLE, { feature: feature });
    },
    COINS_FOR_NEXT_FEATURE_BODY: function (strings, feature, missingScore) {
        return fmt(strings.COINS_FOR_NEXT_FEATURE_BODY, { feature: feature, missingScore: missingScore });
    },
    MULTIPLAYER_AUTOMATICALLY_LOSE: function (strings, hours, minutes) {
        return fmt(strings.MULTIPLAYER_AUTOMATICALLY_LOSE, { hours: hours, minutes: minutes });
    },
    MULTIPLAYER_AUTOMATICALLY_WIN: function (strings, hours, minutes) {
        return fmt(strings.MULTIPLAYER_AUTOMATICALLY_WIN, { hours: hours, minutes: minutes });
    },
    SERVER_NOTIFICATION_REMEMBER_TURN_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_REMEMBER_TURN_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_CHALLENGE_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_CHALLENGE_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_GAME_LOST_BODY: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_GAME_LOST_BODY, { name: name });
    },
    SERVER_NOTIFICATION_TURN_FINISHED_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_TURN_FINISHED_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_OPPONENT_SURENDERED_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_OPPONENT_SURENDERED_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE, { name: name });
    },
    SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY, { name: name });
    },
    SERVER_NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: function (strings, name) {
        return fmt(strings.SERVER_NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE, { name: name });
    },
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

const translationKeys = { ...strings[referenceLanguage], ...translationPredicates };
Object.keys(translationKeys).forEach(key => translationKeys[key] = key);
const translationRefKeys = Object.freeze(translationKeys);

class Translation {
    constructor() {
        this.currentLanguage = validLanguages[0];
    }

    isValid(language) {
        return validLanguages.includes(language);
    }
}

const translation = new Translation();

function setCurrentLanguage(language, onSuccess) {
    if (translation.isValid(language)) {
        translation.currentLanguage = language;
        if (typeof onSuccess === 'function') {
            onSuccess();
        }
    } else {
        console.error("invalid language " + language + " given. Current language " + translation.currentLanguage + " used.");
    }
}

function getCurrentLanguage() {
    return translation.currentLanguage;
}

function translate(key) {
    if (typeof key === 'undefined') {
        console.error("invalid translation key given");
        return '';
    } else {
        const currentTranslation = translations[translation.currentLanguage];
        if (typeof currentTranslation === 'undefined') {
            console.warn("translations data for current language " + translation.currentLanguage + " undefined. this is weired.");
            return '';
        } else {
            if (translations.isPredicate(key)) {
                return translations.callPredicate(translation.currentLanguage, key, ...([].slice.call(arguments, 1)));
            } else if (typeof currentTranslation[key] === 'string') {
                return currentTranslation[key];
            } else {
                console.warn("Undefined text key in current translation: {} {}", translation.currentLanguage, key);
                return '';
            }
        }
    }
}

module.exports.setCurrentLanguage = setCurrentLanguage;
module.exports.getCurrentLanguage = getCurrentLanguage;
module.exports.isValidLanguage = (language) => { return validLanguages.includes(language); }
module.exports.getDefaultLanguage = () => { return referenceLanguage; }
module.exports.translate = translate;
module.exports.translationKeys = translationRefKeys;

// Translations end

// Real-time engine
const realtimeEngine = require('./engine');
const { getPlayerView } = require('./engine/view');
const { computeMatchAwards, matchAwards, isMatchWinner } = require('./engine/awards');
const { Agent, RandomBot, playMatch } = require('./engine/agents');
const { TomToffee } = require('./engine/ai/tomToffee');
const { GustavGanache, Personality } = require('./engine/ai/gustavGanache');
const { DefaultBalance, valueAt } = require('./balance');
const hosting = require('./engine/hosting');
const setup = require('./engine/setup');
const protocol = require('./live/protocol');
const { ClockSync } = require('./live/clockSync');

module.exports.engine = {
    ...realtimeEngine,
    getPlayerView,
    computeMatchAwards,
    matchAwards,
    isMatchWinner,
    Agent,
    RandomBot,
    playMatch,
    ai: { TomToffee, GustavGanache, Personality, ScriptedAgent: require('./engine/ai/scripted').ScriptedAgent },
    ...hosting,
    ...setup,
};
module.exports.live = { ...protocol, ClockSync };
module.exports.DefaultBalance = DefaultBalance;
module.exports.valueAt = valueAt;
module.exports.WeaponNotReadyError = require('./errors').WeaponNotReadyError;
module.exports.StunnedError = require('./errors').StunnedError;
module.exports.InvalidTimeError = require('./errors').InvalidTimeError;
