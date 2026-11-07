// The engine's fixed vocabulary: the phases of a match, the actions a player can take, why a
// match ended, what a donut does and what can be built.

const { EntityType } = require('../constants');

const MatchPhase = Object.freeze({
    FIELD_CHOICE: 'MatchPhase.FIELD_CHOICE',
    PLACEMENT: 'MatchPhase.PLACEMENT',
    COUNTDOWN: 'MatchPhase.COUNTDOWN',
    RUNNING: 'MatchPhase.RUNNING',
    ENDED: 'MatchPhase.ENDED',
});

const MatchActionTypes = Object.freeze({
    chooseField: 'battlechoc/match/chooseField',
    placeFactory: 'battlechoc/match/placeFactory',
    build: 'battlechoc/match/build',
    placeDonut: 'battlechoc/match/placeDonut',
    attack: 'battlechoc/match/attack',
    surrender: 'battlechoc/match/surrender',
});

const OutcomeReason = Object.freeze({
    ELIMINATION: 'OutcomeReason.ELIMINATION',
    TIME_LIMIT: 'OutcomeReason.TIME_LIMIT',
    SURRENDER: 'OutcomeReason.SURRENDER',
});

const DonutEffect = Object.freeze({
    PORTAL: 'DonutEffect.PORTAL',
    GREEN: 'DonutEffect.GREEN',
    WHITE: 'DonutEffect.WHITE',
    PINK: 'DonutEffect.PINK',
    XMAS_TO_BALLISTA: 'DonutEffect.XMAS_TO_BALLISTA',
    XMAS_TO_FOUNTAIN: 'DonutEffect.XMAS_TO_FOUNTAIN',
});

const BUILDABLE = [
    EntityType.CREAM,
    EntityType.FACTORY_EXTENSION,
    EntityType.CACAOTREE,
    EntityType.RUM_TRUFFLE_CANNON,
    EntityType.FRUIT_CANNON,
    EntityType.SPYING_EASTER_BUNNY,
    EntityType.XMAS_FACTORY,
    EntityType.CHOCOLATE_FOUNTAIN,
    EntityType.DONUT_FACTORY,
];

const DONUT_SETS = [
    [EntityType.DONUT_PORTAL_BLUE, EntityType.DONUT_PORTAL_RED],
    [EntityType.DONUT_HEALTH_GREEN],
    [EntityType.DONUT_STOP_PINK],
    [EntityType.DONUT_CREAM_WHITE],
    [EntityType.DONUT_SURPRISE_YELLOW],
];

module.exports = { MatchPhase, MatchActionTypes, OutcomeReason, DonutEffect, BUILDABLE, DONUT_SETS };
