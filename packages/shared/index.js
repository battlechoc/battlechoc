// battlechoc definitions shared by the PWA and the API, in one place for both: constants,
// entity stats per Choclab level, rule errors, texts (i18n/), the real-time rules engine
// (engine/) and the live match protocol (live/). This file only gathers them.

const {
    BoardCellTypes,
    EntityType,
    isDonut,
    AttackType,
    PlayerType,
    EmptyPlayerStats,
    finalLevel,
} = require('./constants');
const { EntityDescriptors, getEntityDescriptor } = require('./entityDescriptors');

const SurrenderCosts = 20;

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
module.exports.BuildingUnlocks = progression.BuildingUnlocks;
module.exports.UnlockGames = progression.UnlockGames;
module.exports.buildingsUnlockedBetween = progression.buildingsUnlockedBetween;
module.exports.gamesPlayed = progression.gamesPlayed;
module.exports.unlocks = progression.unlocks;
module.exports.LevelXp = progression.LevelXp;
module.exports.playerLevel = progression.playerLevel;
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

// the rule errors, each under its class name
Object.assign(module.exports, require('./errors'));
module.exports.SurrenderCosts = SurrenderCosts;

// The texts (i18n/). Only English is built in: the game loads the one language its player
// reads (translations/<code>), the server requires i18n/all for every language.
const i18n = require('./i18n');
module.exports.languages = i18n.languages;
module.exports.normalizeLanguage = i18n.normalizeLanguage;
module.exports.registerTranslations = i18n.registerTranslations;
module.exports.hasTranslations = i18n.hasTranslations;
module.exports.setCurrentLanguage = i18n.setCurrentLanguage;
module.exports.getCurrentLanguage = i18n.getCurrentLanguage;
module.exports.isValidLanguage = i18n.isValidLanguage;
module.exports.getDefaultLanguage = i18n.getDefaultLanguage;
module.exports.translate = i18n.translate;
module.exports.translateIn = i18n.translateIn;
module.exports.translationKeys = i18n.translationKeys;

// Real-time engine
const realtimeEngine = require('./engine');
const { getPlayerView } = require('./engine/view');
const { computeMatchAwards, matchAwards, isMatchWinner } = require('./engine/awards');
const { Agent, RandomBot, playMatch } = require('./engine/agents');
const { TomToffee } = require('./engine/ai/tomToffee');
const { GustavGanache, Personality } = require('./engine/ai/gustavGanache');
const { ScriptedAgent } = require('./engine/ai/scripted');
const { DefaultBalance, valueAt } = require('./balance');
const hosting = require('./engine/hosting');
const setup = require('./engine/setup');
const protocol = require('./live/protocol');
const { ClockSync } = require('./live/clockSync');
const challengeCode = require('./live/challengeCode');

module.exports.engine = {
    ...realtimeEngine,
    getPlayerView,
    computeMatchAwards,
    matchAwards,
    isMatchWinner,
    Agent,
    RandomBot,
    playMatch,
    ai: { TomToffee, GustavGanache, Personality, ScriptedAgent },
    ...hosting,
    ...setup,
};
module.exports.live = { ...protocol, ...challengeCode, ClockSync };
module.exports.DefaultBalance = DefaultBalance;
module.exports.valueAt = valueAt;
