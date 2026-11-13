// The texts of the game by key, in eight languages (translations/). `translate(key, ...values)`
// answers in the current language, `translateIn(language, key, ...values)` in a given one (the
// server writes each player in their own language).
//
// English is always there. The other tables are registered: `i18n/all.js` registers every
// language (the server, the tests), the game registers the one its player reads.

const { EntityType, AttackType } = require('../constants');

const referenceLanguage = 'en';
const languages = Object.freeze(['en', 'de', 'ja', 'es', 'fr', 'it', 'pt', 'vi']);
// the first versions named Japanese and Vietnamese by their countries; devices and the
// players table still hold these codes
const legacyCodes = Object.freeze({ jp: 'ja', vn: 'vi' });

const tables = { [referenceLanguage]: require('../translations/en_strings.js') };

/**
 * The game's code for a language tag: 'ja-JP', 'JA' and the old 'jp' give 'ja'. Undefined for
 * a language the game has no texts in.
 */
const normalizeLanguage = (tag) => {
    if (typeof tag !== 'string') {
        return undefined;
    }
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    const code = legacyCodes[primary] || primary;
    return languages.includes(code) ? code : undefined;
};

const isValidLanguage = language => typeof normalizeLanguage(language) !== 'undefined';

/** Makes the texts of a language available (its table is one of translations/<code>_strings.js). */
const registerTranslations = (language, table) => {
    const code = normalizeLanguage(language);
    if (typeof code === 'undefined') {
        throw new Error('no such language: ' + language);
    }
    tables[code] = table;
};

const hasTranslations = language => typeof tables[normalizeLanguage(language)] !== 'undefined';

function fmt(str, values) {
    return str.replace(/\{\{(\w+)\}\}/g, function (match, key) {
        return values[key];
    });
}

// Texts with {{placeholders}}: translate(key, ...values) fills them in this order.
const placeholders = Object.freeze({
    RECOVERY_WORDS_WORD: ['n'],
    WORDS_COUNT: ['n'],
    WARNING_PLAYER_NOT_FOUND: ['name'],
    PLAYER_NAME_GENERATED_BODY: ['name'],
    LAB_TABLE_HINT: ['ingredient'],
    LAB_NEEDS_SPECIAL: ['ingredient'],
    LAB_DISCOVERED_BY: ['name'],
    LAB_UNDISCOVERED: ['count'],
    LAB_POINTS: ['points'],
    LAB_SLOT_LABEL: ['slot'],
    END_BAG_FROM: ['achievement'],
    MATCHMAKING_AI_IN: ['seconds'],
    PANTRY_SPOILS_IN: ['time'],
    COINS_FOR_NEXT_FEATURE_TITLE: ['feature'],
    UNLOCK_FEATURE_ONE_GAME: ['feature'],
    UNLOCK_FEATURE_GAMES: ['feature', 'count'],
    UNLOCK_ONLINE_GAMES: ['count'],
    NAME_CONFLICT_TEXT: ['name', 'generated'],
    PROFILE_XP: ['xp', 'next'],
    CHALLENGE_HEADLINE: ['name'],
    CHALLENGE_PRIMER: ['name'],
    CHALLENGE_ON_THE_WAY: ['name'],
    CHALLENGE_AWAY: ['name'],
    REMATCH_OFFER: ['name'],
    REMATCH_WAITING: ['name'],
    REMATCH_DECLINED: ['name'],
    REMATCH_GONE: ['name'],
    CHALLENGE_CODE: ['code'],
    SECONDS_LEFT: ['seconds'],
    CHALLENGE_PREVIEW_TITLE: ['name'],
    INFO_LAST_UPDATE: ['time'],
    INFO_MADE_BY: ['names'],
    WALLET_WRONG_NETWORK: ['network'],
    LINK_CONTINUE: ['wallet'],
    LINK_DETAILS: ['detail'],
    PASSKEYS_SET_UP: ['count'],
    WALLETS_CONNECTED: ['count'],
    DETAILS_TEST_NETWORK: ['network'],
    TEST_NETWORK_TEXT: ['network'],
});

// Texts that are picked or put together by code; each gets the language's table first.
const special = {
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
                return strings['TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];
            default: return strings.TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
};

const translationKeys = { ...tables[referenceLanguage], ...placeholders, ...special };
Object.keys(translationKeys).forEach(key => translationKeys[key] = key);
Object.freeze(translationKeys);

function translateIn(language, key, ...values) {
    if (typeof key === 'undefined') {
        console.error('invalid translation key given');
        return '';
    }
    const table = tables[normalizeLanguage(language)];
    if (typeof table === 'undefined') {
        console.warn('no texts registered for the language ' + language);
        return '';
    }
    if (Object.hasOwn(special, key)) {
        return special[key](table, ...values);
    }
    if (typeof table[key] !== 'string') {
        console.warn('Undefined text key in the translation: ' + language + ' ' + key);
        return '';
    }
    if (Object.hasOwn(placeholders, key)) {
        return fmt(table[key], Object.fromEntries(placeholders[key].map((name, index) => [name, values[index]])));
    }
    return table[key];
}

let currentLanguage = referenceLanguage;

/**
 * Switches the language `translate` answers in; its texts must be registered. `onSuccess`
 * runs when the switch happened.
 */
function setCurrentLanguage(language, onSuccess) {
    const code = normalizeLanguage(language);
    if (typeof code === 'undefined' || !hasTranslations(code)) {
        console.error('invalid language ' + language + ' given. Current language ' + currentLanguage + ' used.');
        return;
    }
    currentLanguage = code;
    if (typeof onSuccess === 'function') {
        onSuccess();
    }
}

const getCurrentLanguage = () => currentLanguage;

const translate = (key, ...values) => translateIn(currentLanguage, key, ...values);

module.exports = {
    languages,
    normalizeLanguage,
    isValidLanguage,
    registerTranslations,
    hasTranslations,
    getDefaultLanguage: () => referenceLanguage,
    setCurrentLanguage,
    getCurrentLanguage,
    translate,
    translateIn,
    translationKeys,
};
