// Real-time rules engine.
//
// The engine never reads a clock. Every function receives the match time `t` in integer
// milliseconds since the match was created. Timers are timestamps on the entities; advanceTo()
// processes everything that is due, applyAction() first advances to the action's time and
// then applies the action. The whole state (including the random generator) lives in the
// match object, so a match is reproducible from its seed and its action log.
//
// Functions mutate the match they receive (like reducers on an Immer draft) and return the
// events they produced. The host (local engine or server) is the only writer of a match.

const { BoardCellTypes, EntityType, isDonut, AttackType, PlayerType, EmptyPlayerStats } = require('../constants');
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
    AlreadyMolten,
    WeaponNotReadyError,
    StunnedError,
    InvalidTimeError,
} = require('../errors');
const { DefaultBalance, valueAt } = require('../balance');
const rng = require('./rng');

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

/* ---------- small helpers ---------- */

const entityOrder = entity => parseInt(entity.id.slice(1), 10);
const byEntityOrder = (a, b) => entityOrder(a) - entityOrder(b);
const isAi = type => type !== PlayerType.HUMAN;
const spec = (match, entityType) => match.balance.entities[entityType] || {};
const levelOf = (player, entityType) => (player.level && player.level[entityType]) || 0;

const field = (match, playerIndex) => match.board.fields[match.players[playerIndex].fieldIndex];

const cellAt = (match, playerIndex, row, col) => {
    const { rows, cols } = match.board.size;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rows || col >= cols) {
        return undefined;
    }
    return field(match, playerIndex).grid[row * cols + col];
};

const patch = (match, playerIndex, row, col, area) => {
    const radius = Math.floor(area / 2);
    const cells = [];
    for (let r = row - radius; r <= row + radius; r++) {
        for (let c = col - radius; c <= col + radius; c++) {
            const cell = cellAt(match, playerIndex, r, c);
            if (cell) {
                cells.push(cell);
            }
        }
    }
    return cells;
};

const contains = (cell, entityType) => cell.occupiedBy.some(entity => entity.type === entityType);
const nonDonuts = cell => cell.occupiedBy.filter(entity => !isDonut(entity.type));

const entitiesOf = (match, playerIndex) => {
    if (match.players[playerIndex].fieldIndex === null) {
        return [];
    }
    return field(match, playerIndex).grid.flatMap(cell => cell.occupiedBy);
};

const cellOfEntity = (match, playerIndex, entity) => cellAt(match, playerIndex, entity.position.row, entity.position.col);

/* ---------- derived values (no stored aggregates) ---------- */

const shieldingFountains = (match, playerIndex, row, col) => {
    const area = spec(match, EntityType.CHOCOLATE_FOUNTAIN).area || 3;
    return patch(match, playerIndex, row, col, area)
        .flatMap(cell => cell.occupiedBy.filter(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN))
        .sort(byEntityOrder);
};

const isShielded = (match, playerIndex, row, col) => shieldingFountains(match, playerIndex, row, col).length > 0;

const generatorStats = (match, playerIndex, entity) => {
    const player = match.players[playerIndex];
    const buildSpec = spec(match, entity.type).build;
    const black = cellOfEntity(match, playerIndex, entity).type === BoardCellTypes.BLACK;
    const blackSpec = match.balance.cells.black;
    const level = levelOf(player, entity.type);
    return {
        capacity: valueAt(buildSpec.capacity, level) + (black ? blackSpec.buildCapacityBonus : 0),
        intervalMs: Math.round(valueAt(buildSpec.intervalMs, level) * (black ? blackSpec.buildIntervalFactor : 1)),
    };
};

const producerStats = (match, playerIndex, entity) => {
    const player = match.players[playerIndex];
    const cacaoSpec = spec(match, entity.type).cacao;
    const white = cellOfEntity(match, playerIndex, entity).type === BoardCellTypes.WHITE;
    const level = levelOf(player, entity.type);
    return {
        amount: Math.round(valueAt(cacaoSpec.amount, level) * (white ? match.balance.cells.white.cacaoFactor : 1)),
        intervalMs: valueAt(cacaoSpec.intervalMs, level),
    };
};

const isGenerator = entity => entity.type === EntityType.FACTORY || entity.type === EntityType.FACTORY_EXTENSION;
const isProducer = entity => entity.type === EntityType.FACTORY || entity.type === EntityType.CACAOTREE;

const buildCapacity = (match, playerIndex) => entitiesOf(match, playerIndex)
    .filter(isGenerator)
    .reduce((sum, entity) => sum + generatorStats(match, playerIndex, entity).capacity, 0);

const cacaoPerSecond = (match, playerIndex) => entitiesOf(match, playerIndex)
    .filter(isProducer)
    .map(entity => producerStats(match, playerIndex, entity))
    .reduce((sum, stats) => sum + stats.amount * 1000 / stats.intervalMs, 0);

const weaponSpec = (match, weapon) => spec(match, weapon.source).weapons.find(w => w.attackType === weapon.attackType);

const weaponsOf = (match, playerIndex, attackType) => entitiesOf(match, playerIndex)
    .filter(entity => Array.isArray(entity.weapons))
    .flatMap(entity => entity.weapons
        .filter(weapon => typeof attackType === 'undefined' || weapon.attackType === attackType)
        .map(weapon => ({ entity, weapon })));

const WeaponState = Object.freeze({ CHARGING: 'charging', RUSHABLE: 'rushable', READY: 'ready' });

// progress, state, ready time and rush price of a weapon at time t
const weaponStatus = (match, weapon, t) => {
    const ws = weaponSpec(match, weapon);
    const progress = Math.min(1, Math.max(0, (t - weapon.chargedAt) / ws.cooldownMs));
    const rush = ws.rush || {};
    let state = WeaponState.CHARGING;
    if (progress >= 1) {
        state = WeaponState.READY;
    } else if (rush.enabled && progress >= rush.fromProgress) {
        state = WeaponState.RUSHABLE;
    }
    return {
        progress,
        state,
        readyAt: weapon.chargedAt + ws.cooldownMs,
        rushableAt: rush.enabled ? weapon.chargedAt + Math.ceil(ws.cooldownMs * rush.fromProgress) : null,
        rushCost: rush.enabled ? rush.cost : null,
    };
};

const hasHarmfulWeapon = (match, playerIndex) => weaponsOf(match, playerIndex)
    .some(({ weapon }) => weapon.attackType === AttackType.TRUFFLE || weapon.attackType === AttackType.HOT_CHOCOLATE);

const hasGenerator = (match, playerIndex) => entitiesOf(match, playerIndex).some(isGenerator);
const hasIncome = (match, playerIndex) => entitiesOf(match, playerIndex).some(isProducer);

/* ---------- events ---------- */

// visibleTo: player indices that may see the event; secret: host-only facts (awards), never sent to clients
const pushEvent = (match, events, type, player, visibleTo, data = {}, secret = undefined) => {
    const event = { seq: match.eventSeq++, t: match.t, type, player, visibleTo, data };
    if (typeof secret !== 'undefined') {
        event.secret = secret;
    }
    match.events.push(event);
    events.push(event);
    return event;
};

/* ---------- entities ---------- */

const newId = match => 'e' + match.nextId++;

const createEntity = (match, playerIndex, entityType, position) => {
    const player = match.players[playerIndex];
    const entity = { id: newId(match), type: entityType, position: { row: position.row, col: position.col } };
    if (isDonut(entityType)) {
        entity.hp = 1;
        entity.maxHp = 1;
        return entity;
    }
    const hp = valueAt(spec(match, entityType).hp, levelOf(player, entityType));
    entity.hp = hp;
    entity.maxHp = hp;
    return entity;
};

// starts the timers of an entity that becomes active at time t
const startTimers = (match, playerIndex, entity, t) => {
    const entitySpec = spec(match, entity.type);
    if (entitySpec.cacao) {
        entity.cacaoAt = t + producerStats(match, playerIndex, entity).intervalMs;
    }
    if (entitySpec.build) {
        entity.buildAt = t + generatorStats(match, playerIndex, entity).intervalMs;
    }
    if (entitySpec.donuts) {
        entity.donutAt = t + valueAt(entitySpec.donuts.intervalMs, levelOf(match.players[playerIndex], entity.type));
    }
    if (entitySpec.weapons && !entity.weapons) {
        entity.weapons = entitySpec.weapons.map(ws => ({
            attackType: ws.attackType,
            source: entity.type,
            chargedAt: ws.startReady ? t - ws.cooldownMs : t,
        }));
        // a fruit cannon that did not replace a truffle cannon (scenarios) still has both weapons
        if (entity.type === EntityType.FRUIT_CANNON && entitySpec.keepsTruffleWeapon) {
            entity.weapons.unshift(...spec(match, EntityType.RUM_TRUFFLE_CANNON).weapons.map(ws => ({
                attackType: ws.attackType, source: EntityType.RUM_TRUFFLE_CANNON, chargedAt: t,
            })));
        }
    }
};

const clampTokens = (match, playerIndex) => {
    if (match.balance.match.buildTokens.clampOnCapacityLoss) {
        const player = match.players[playerIndex];
        player.buildTokens = Math.min(player.buildTokens, buildCapacity(match, playerIndex));
    }
};

const removeEntity = (match, playerIndex, entity) => {
    const cell = cellOfEntity(match, playerIndex, entity);
    cell.occupiedBy = cell.occupiedBy.filter(other => other.id !== entity.id);
    if (isGenerator(entity)) {
        clampTokens(match, playerIndex);
    }
};

/* ---------- match creation ---------- */

const generateBoard = (match, size) => {
    const { creamProbability, cellTypeWeights } = match.balance.board;
    const fields = [];
    for (let f = 0; f < 2; f++) {
        const grid = [];
        for (let row = 0; row < size.rows; row++) {
            for (let col = 0; col < size.cols; col++) {
                const type = BoardCellTypes[rng.pickWeighted(match, cellTypeWeights)];
                const cell = { type, previewStyle: type.replace('BoardCellTypes.', '').toLowerCase(), row, col, occupiedBy: [], molten: false };
                if (rng.next(match) < creamProbability) {
                    cell.occupiedBy.push({ id: newId(match), type: EntityType.CREAM, hp: 1, maxHp: 1, position: { row, col } });
                }
                grid.push(cell);
            }
        }
        fields.push({ grid });
    }
    return { size: { rows: size.rows, cols: size.cols }, fields };
};

/**
 * Creates a new match in the FIELD_CHOICE phase at match time 0.
 *
 * @param {object} options
 * @param {Array<{id, name, type, level}>} options.players exactly two players
 * @param {{rows, cols}} options.boardSize
 * @param {string|number} options.seed seed of the board and of every random decision
 * @param {object} [options.balance] balance config, snapshotted into the match
 * @param {0|1} [options.fieldChooser] player choosing the field; default: the human against an AI, otherwise a coin toss
 */
const createMatch = ({ players, boardSize, seed, balance = DefaultBalance, fieldChooser }) => {
    if (!Array.isArray(players) || players.length !== 2) {
        throw new Error('A match needs exactly two players');
    }
    const snapshot = JSON.parse(JSON.stringify(balance));
    const match = {
        engineVersion: 1,
        balance: snapshot,
        seed: String(seed),
        rng: rng.seedFrom(seed),
        nextId: 1,
        eventSeq: 0,
        t: 0,
        phase: MatchPhase.FIELD_CHOICE,
        phaseEndsAt: snapshot.match.fieldChoiceTimeoutMs,
        startedAt: null,
        endsAt: null,
        fieldChooser: null,
        board: null,
        players: players.map(player => ({
            id: player.id,
            name: player.name,
            type: player.type,
            level: player.level || EmptyPlayerStats.level,
            fieldIndex: null,
            cacao: snapshot.match.startCacao,
            buildTokens: 0,
            stunnedUntil: 0,
            donuts: [],
            knownShields: [],
            statistics: {
                attacks: 0, builtEntities: 0, espionages: 0, moltenFields: 0,
                shotsFired: 0, shotsHit: 0, rushes: 0, producedCacao: 0, spentCacao: 0,
            },
        })),
        events: [],
        outcome: null,
    };
    match.board = generateBoard(match, boardSize);
    if (fieldChooser === 0 || fieldChooser === 1) {
        match.fieldChooser = fieldChooser;
    } else if (isAi(players[0].type) !== isAi(players[1].type)) {
        match.fieldChooser = isAi(players[0].type) ? 1 : 0;
    } else {
        match.fieldChooser = rng.nextInt(match, 2);
    }
    return match;
};

/* ---------- phases ---------- */

const enterPlacement = (match, events, fieldIndex, automatic = false) => {
    const chooser = match.fieldChooser;
    match.players[chooser].fieldIndex = fieldIndex;
    match.players[1 - chooser].fieldIndex = 1 - fieldIndex;
    match.phase = MatchPhase.PLACEMENT;
    match.phaseEndsAt = match.t + match.balance.match.placementTimeoutMs;
    pushEvent(match, events, 'fieldChosen', chooser, [0, 1], { fieldIndex, automatic });
};

const ownFactory = (match, playerIndex) => entitiesOf(match, playerIndex).find(entity => entity.type === EntityType.FACTORY);

const factoryPlaceable = cell => !cell.molten && nonDonuts(cell).every(entity => entity.type === EntityType.CREAM);

const placeFactoryInternal = (match, events, playerIndex, cell, automatic = false) => {
    const factory = createEntity(match, playerIndex, EntityType.FACTORY, cell);
    cell.occupiedBy.push(factory);
    match.players[playerIndex].statistics.builtEntities += 1;
    const creamed = contains(cell, EntityType.CREAM);
    pushEvent(match, events, 'factoryPlaced', playerIndex, creamed ? [playerIndex] : [0, 1],
        { row: cell.row, col: cell.col, entityId: factory.id, automatic },
        { cellType: cell.type, creamed });
    if (match.players.every((player, index) => ownFactory(match, index))) {
        match.phase = MatchPhase.COUNTDOWN;
        match.phaseEndsAt = match.t + match.balance.match.countdownMs;
        pushEvent(match, events, 'phase', null, [0, 1], { phase: match.phase, endsAt: match.phaseEndsAt });
    }
};

const autoPlaceFactories = (match, events) => {
    match.players.forEach((player, playerIndex) => {
        if (!ownFactory(match, playerIndex)) {
            const grid = field(match, playerIndex).grid;
            const creamed = grid.filter(cell => factoryPlaceable(cell) && contains(cell, EntityType.CREAM));
            const candidates = creamed.length > 0 ? creamed : grid.filter(factoryPlaceable);
            placeFactoryInternal(match, events, playerIndex, rng.pick(match, candidates), true);
        }
    });
};

const startRunning = (match, events) => {
    const t = match.t;
    match.phase = MatchPhase.RUNNING;
    match.phaseEndsAt = null;
    match.startedAt = t;
    match.endsAt = t + match.balance.match.timeLimitMs;
    match.players.forEach((player, playerIndex) => {
        entitiesOf(match, playerIndex).filter(entity => !isDonut(entity.type) && entity.type !== EntityType.CREAM)
            .forEach(entity => startTimers(match, playerIndex, entity, t));
        player.buildTokens = match.balance.match.buildTokens.startFull ? buildCapacity(match, playerIndex) : 0;
    });
    pushEvent(match, events, 'phase', null, [0, 1], { phase: match.phase, startedAt: match.startedAt, endsAt: match.endsAt });
};

const endMatch = (match, events, winners, reason) => {
    match.phase = MatchPhase.ENDED;
    match.phaseEndsAt = null;
    match.outcome = { winners, reason, t: match.t };
    match.players.forEach((player, index) => {
        player.statistics.won = winners.length === 1 && winners[0] === index;
        player.statistics.lost = winners.length === 1 && winners[0] !== index;
    });
    pushEvent(match, events, 'ended', null, [0, 1], { winners, reason });
};

const boardValue = (match, playerIndex) => match.players[playerIndex].cacao + entitiesOf(match, playerIndex)
    .filter(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type))
    .reduce((sum, entity) => sum + (entity.type === EntityType.FACTORY
        ? match.balance.match.factoryBoardValue
        : (spec(match, entity.type).costs || 0)), 0);

const treeCount = (match, playerIndex) => entitiesOf(match, playerIndex).filter(entity => entity.type === EntityType.CACAOTREE).length;

const hasLost = (match, playerIndex) => {
    if (hasHarmfulWeapon(match, playerIndex)) {
        return false;
    }
    const treeCost = spec(match, EntityType.CACAOTREE).costs;
    return !hasGenerator(match, playerIndex) ||
        (!hasIncome(match, playerIndex) && match.players[playerIndex].cacao < treeCost);
};

// decides the winner of two players that lost at the same moment: more cacao, then more trees, else a draw
const tiebreak = (match, first, second) => {
    const a = match.players[first].cacao;
    const b = match.players[second].cacao;
    if (a !== b) {
        return [a > b ? first : second];
    }
    const treesA = treeCount(match, first);
    const treesB = treeCount(match, second);
    if (treesA !== treesB) {
        return [treesA > treesB ? first : second];
    }
    return [0, 1];
};

const checkOutcome = (match, events) => {
    if (match.phase !== MatchPhase.RUNNING) {
        return;
    }
    const losers = [0, 1].filter(index => hasLost(match, index));
    if (losers.length === 1) {
        endMatch(match, events, [1 - losers[0]], OutcomeReason.ELIMINATION);
    } else if (losers.length === 2) {
        endMatch(match, events, tiebreak(match, 0, 1), OutcomeReason.ELIMINATION);
    }
};

const endByTimeLimit = (match, events) => {
    const a = boardValue(match, 0);
    const b = boardValue(match, 1);
    endMatch(match, events, a === b ? [0, 1] : [a > b ? 0 : 1], OutcomeReason.TIME_LIMIT);
};

/* ---------- timers ---------- */

const TimerKind = { CACAO: 0, BUILD: 1, DONUT: 2, DEADLINE: 3 };

const dueTimers = match => {
    const timers = [];
    if (match.phase === MatchPhase.ENDED) {
        return timers;
    }
    if (match.phase === MatchPhase.RUNNING) {
        match.players.forEach((player, playerIndex) => {
            entitiesOf(match, playerIndex).forEach(entity => {
                if (typeof entity.cacaoAt === 'number') {
                    timers.push({ at: entity.cacaoAt, kind: TimerKind.CACAO, playerIndex, entity });
                }
                if (typeof entity.buildAt === 'number') {
                    timers.push({ at: entity.buildAt, kind: TimerKind.BUILD, playerIndex, entity });
                }
                if (typeof entity.donutAt === 'number') {
                    timers.push({ at: entity.donutAt, kind: TimerKind.DONUT, playerIndex, entity });
                }
            });
        });
        timers.push({ at: match.endsAt, kind: TimerKind.DEADLINE, playerIndex: -1 });
    } else {
        timers.push({ at: match.phaseEndsAt, kind: TimerKind.DEADLINE, playerIndex: -1 });
    }
    return timers;
};

const timerOrder = (a, b) => (a.at - b.at) || (a.kind - b.kind) || (a.playerIndex - b.playerIndex) ||
    ((a.entity && b.entity) ? byEntityOrder(a.entity, b.entity) : 0);

const nextTimer = match => {
    const timers = dueTimers(match);
    if (timers.length === 0) {
        return undefined;
    }
    return timers.reduce((earliest, timer) => (timerOrder(timer, earliest) < 0 ? timer : earliest));
};

const spawnDonuts = (match, events, playerIndex, factory) => {
    const player = match.players[playerIndex];
    const donutSpec = spec(match, EntityType.DONUT_FACTORY).donuts;
    const level = levelOf(player, EntityType.DONUT_FACTORY);
    if (player.donuts.length === 0 && rng.next(match) < valueAt(donutSpec.probability, level)) {
        const set = DONUT_SETS[rng.nextInt(match, valueAt(donutSpec.types, level))];
        const pairId = set.length > 1 ? newId(match) : undefined;
        player.donuts = set.map(type => {
            const donut = { id: newId(match), type, hp: 1, maxHp: 1, position: null };
            if (pairId) {
                donut.pairId = pairId;
            }
            return donut;
        });
        pushEvent(match, events, 'donutsSpawned', playerIndex, [playerIndex], { types: set, factoryId: factory.id });
    }
};

const processTimer = (match, events, timer) => {
    const { entity, playerIndex } = timer;
    const player = playerIndex >= 0 ? match.players[playerIndex] : undefined;
    if (timer.kind === TimerKind.CACAO) {
        const stats = producerStats(match, playerIndex, entity);
        const cap = match.balance.match.cacaoCap;
        const before = player.cacao;
        player.cacao = cap === null ? player.cacao + stats.amount : Math.min(cap, player.cacao + stats.amount);
        player.statistics.producedCacao += player.cacao - before;
        entity.cacaoAt += stats.intervalMs;
    } else if (timer.kind === TimerKind.BUILD) {
        player.buildTokens = Math.min(buildCapacity(match, playerIndex), player.buildTokens + 1);
        entity.buildAt += generatorStats(match, playerIndex, entity).intervalMs;
    } else if (timer.kind === TimerKind.DONUT) {
        spawnDonuts(match, events, playerIndex, entity);
        entity.donutAt += valueAt(spec(match, EntityType.DONUT_FACTORY).donuts.intervalMs, levelOf(player, EntityType.DONUT_FACTORY));
    } else if (match.phase === MatchPhase.FIELD_CHOICE) {
        enterPlacement(match, events, rng.nextInt(match, 2), true);
    } else if (match.phase === MatchPhase.PLACEMENT) {
        autoPlaceFactories(match, events);
    } else if (match.phase === MatchPhase.COUNTDOWN) {
        startRunning(match, events);
    } else if (match.phase === MatchPhase.RUNNING) {
        endByTimeLimit(match, events);
    }
};

/**
 * Processes every timer that is due up to time t (inclusive) in a deterministic order:
 * by time, then production before deadlines, then player index, then entity creation order.
 * Returns the produced events.
 */
const advanceTo = (match, t) => {
    if (!Number.isFinite(t) || t < match.t) {
        throw new InvalidTimeError(t, match.t);
    }
    const events = [];
    let timer = nextTimer(match);
    while (timer && timer.at <= t) {
        match.t = timer.at;
        processTimer(match, events, timer);
        timer = nextTimer(match);
    }
    match.t = t;
    return events;
};

/** Time of the next timer (production, donut roll, phase deadline or time limit), or null. */
const nextTimerAt = match => {
    const timer = nextTimer(match);
    return timer ? timer.at : null;
};

/* ---------- scenarios ---------- */

/**
 * Prepares a freshly created match from a scenario, for the first game of new players,
 * debug boards and tests. Assigns the fields, rewrites cells, then either stays in the
 * placement phase (until both factories stand) or starts the running phase right away.
 *
 * @param {object} scenario
 * @param {0|1} [scenario.fieldIndex] field of the field chooser
 * @param {boolean} [scenario.clear] remove all initial cream first
 * @param {Array<{player, row, col, type, cream, entities}>} [scenario.cells] cell overrides;
 *        `entities` is a list of entity types (factory, buildings, placed donuts)
 * @param {Array<object>} [scenario.levels] Choclab level overrides per player
 * @param {Array<number>} [scenario.cacao] cacao per player
 * @param {string} [scenario.phase] MatchPhase.PLACEMENT (default) or MatchPhase.RUNNING
 */
const prepareScenario = (match, { fieldIndex = 0, clear = false, cells = [], levels = [], cacao, phase = MatchPhase.PLACEMENT } = {}) => {
    requirePhase(match, MatchPhase.FIELD_CHOICE);
    const events = [];
    levels.forEach((level, index) => {
        if (level) {
            match.players[index].level = { ...match.players[index].level, ...level };
        }
    });
    enterPlacement(match, events, fieldIndex);
    if (clear) {
        [0, 1].forEach(playerIndex => field(match, playerIndex).grid.forEach(cell => { cell.occupiedBy = []; }));
    }
    cells.forEach(({ player = 0, row, col, type, cream, entities }) => {
        const cell = cellAt(match, player, row, col);
        if (!cell) {
            throw new Error(`Scenario cell ${row}/${col} is outside the board`);
        }
        if (type) {
            cell.type = type;
            cell.previewStyle = type.replace('BoardCellTypes.', '').toLowerCase();
        }
        if (typeof cream === 'boolean' || Array.isArray(entities)) {
            const creamed = typeof cream === 'boolean' ? cream : contains(cell, EntityType.CREAM);
            cell.occupiedBy = [];
            if (creamed) {
                cell.occupiedBy.push(createEntity(match, player, EntityType.CREAM, cell));
            }
            (entities || []).forEach(entityType => cell.occupiedBy.push(createEntity(match, player, entityType, cell)));
        }
    });
    if (Array.isArray(cacao)) {
        cacao.forEach((value, index) => { match.players[index].cacao = value; });
    }
    const bothFactories = [0, 1].every(index => ownFactory(match, index));
    if (phase === MatchPhase.RUNNING) {
        if (!bothFactories) {
            autoPlaceFactories(match, events);
        }
        startRunning(match, events);
    } else if (bothFactories) {
        match.phase = MatchPhase.COUNTDOWN;
        match.phaseEndsAt = match.t + match.balance.match.countdownMs;
    }
    return events;
};

/* ---------- actions ---------- */

const requirePhase = (match, phase) => {
    if (match.phase !== phase) {
        throw new UnexpectedStateError(match.phase);
    }
};

const chooseField = (match, events, action) => {
    requirePhase(match, MatchPhase.FIELD_CHOICE);
    if (action.player !== match.fieldChooser) {
        throw new InvalidActionIssuerError(action, action.player, match.fieldChooser);
    }
    const fieldIndex = action.payload && action.payload.fieldIndex;
    if (fieldIndex !== 0 && fieldIndex !== 1) {
        throw new ActionValidationError(action);
    }
    enterPlacement(match, events, fieldIndex);
};

const placeFactory = (match, events, action) => {
    requirePhase(match, MatchPhase.PLACEMENT);
    if (ownFactory(match, action.player)) {
        throw new BuildNotPossibleError('The factory has already been placed.');
    }
    const { row, col } = action.payload || {};
    const cell = cellAt(match, action.player, row, col);
    if (!cell || !factoryPlaceable(cell)) {
        throw new BuildNotPossibleError('The factory cannot be placed on this cell.');
    }
    placeFactoryInternal(match, events, action.player, cell);
};

const creamFootprint = (match, playerIndex, row, col) => {
    const { rows, cols } = match.board.size;
    const size = spec(match, EntityType.CREAM).footprint || 1;
    const top = Math.max(0, Math.min(row, rows - size));
    const left = Math.max(0, Math.min(col, cols - size));
    const cells = [];
    for (let r = top; r < top + size; r++) {
        for (let c = left; c < left + size; c++) {
            cells.push(cellAt(match, playerIndex, r, c));
        }
    }
    return cells;
};

const countOnField = (match, playerIndex, entityType) => entitiesOf(match, playerIndex).filter(entity => entity.type === entityType).length;

const adjacentToFactory = (match, playerIndex, row, col) => [[0, -1], [0, 1], [-1, 0], [1, 0]]
    .map(([dr, dc]) => cellAt(match, playerIndex, row + dr, col + dc))
    .some(cell => cell && contains(cell, EntityType.FACTORY));

const build = (match, events, action) => {
    requirePhase(match, MatchPhase.RUNNING);
    const playerIndex = action.player;
    const player = match.players[playerIndex];
    const { entityType, row, col } = action.payload || {};
    if (!BUILDABLE.includes(entityType)) {
        throw new BuildNotPossibleError('This entity cannot be built: ' + entityType);
    }
    const cell = cellAt(match, playerIndex, row, col);
    if (!cell) {
        throw new BuildNotPossibleError('Invalid cell row: ' + row + ' col: ' + col);
    }
    if (player.buildTokens < 1) {
        throw new NoBuildingsLeftError();
    }
    const costs = spec(match, entityType).costs || 0;
    if (player.cacao < costs) {
        throw new NoCacaoLeftError();
    }

    const built = [];
    if (entityType === EntityType.CREAM) {
        const targets = creamFootprint(match, playerIndex, row, col).filter(target => !target.molten && !contains(target, EntityType.CREAM));
        if (targets.length === 0) {
            throw new BuildNotPossibleError('Every cell of the cream footprint already has cream.');
        }
        targets.forEach(target => {
            const cream = createEntity(match, playerIndex, EntityType.CREAM, target);
            target.occupiedBy.push(cream);
            built.push(cream);
        });
    } else {
        if (cell.molten) {
            throw new BuildNotPossibleError('Cannot build on molten cells.');
        }
        const maxPerField = spec(match, entityType).maxPerField;
        if (maxPerField && countOnField(match, playerIndex, entityType) >= maxPerField) {
            throw new BuildNotPossibleError('Can only build ' + maxPerField + ' of ' + entityType + '.');
        }
        const occupants = nonDonuts(cell);
        let replacedCannon;
        if (entityType === EntityType.FRUIT_CANNON) {
            replacedCannon = occupants.find(entity => entity.type === EntityType.RUM_TRUFFLE_CANNON);
            if (!replacedCannon) {
                throw new BuildNotPossibleError('A fruit cannon needs a truffle cannon on the cell.');
            }
        } else if (!occupants.every(entity => entity.type === EntityType.CREAM)) {
            throw new BuildNotPossibleError('The cell is occupied.');
        }
        if (entityType === EntityType.FACTORY_EXTENSION && !adjacentToFactory(match, playerIndex, row, col)) {
            throw new BuildNotPossibleError('A factory extension needs an adjacent factory.');
        }
        const entity = createEntity(match, playerIndex, entityType, cell);
        if (replacedCannon) {
            if (spec(match, EntityType.FRUIT_CANNON).keepsTruffleWeapon) {
                entity.weapons = replacedCannon.weapons.map(weapon => ({ ...weapon }));
                entity.weapons.push(...spec(match, EntityType.FRUIT_CANNON).weapons.map(ws => ({
                    attackType: ws.attackType, source: EntityType.FRUIT_CANNON, chargedAt: match.t,
                })));
            }
            cell.occupiedBy = cell.occupiedBy.filter(other => other.id !== replacedCannon.id);
        }
        cell.occupiedBy.push(entity);
        startTimers(match, playerIndex, entity, match.t);
        built.push(entity);
    }

    player.buildTokens -= 1;
    player.cacao -= costs;
    player.statistics.spentCacao += costs;
    player.statistics.builtEntities += 1;
    const visibleToOpponent = entityType === EntityType.CREAM || !contains(cell, EntityType.CREAM);
    pushEvent(match, events, 'built', playerIndex, visibleToOpponent ? [0, 1] : [playerIndex], {
        entityType,
        cells: built.map(entity => ({ row: entity.position.row, col: entity.position.col })),
        entityIds: built.map(entity => entity.id),
    }, { cellType: cell.type, creamed: contains(cell, EntityType.CREAM) });
};

const placeDonut = (match, events, action) => {
    requirePhase(match, MatchPhase.RUNNING);
    const playerIndex = action.player;
    const player = match.players[playerIndex];
    const { donutType, row, col } = action.payload || {};
    const donut = player.donuts.find(candidate => candidate.type === donutType);
    if (!donut) {
        throw new BuildNotPossibleError('No donut of this type to place: ' + donutType);
    }
    if (donutType === EntityType.DONUT_PORTAL_RED && player.donuts.some(candidate => candidate.type === EntityType.DONUT_PORTAL_BLUE)) {
        throw new BuildNotPossibleError('Place the blue portal donut first.');
    }
    const cell = cellAt(match, playerIndex, row, col);
    if (!cell || cell.molten || cell.occupiedBy.some(entity => isDonut(entity.type))) {
        throw new BuildNotPossibleError('The donut cannot be placed on this cell.');
    }
    donut.position = { row, col };
    cell.occupiedBy.push(donut);
    player.donuts = player.donuts.filter(candidate => candidate.id !== donut.id);
    pushEvent(match, events, 'donutPlaced', playerIndex, [playerIndex], { donutType, row, col, entityId: donut.id });
};

/* ---------- combat ---------- */

const rollDamage = (match, attacker, weapon) => {
    const ws = weaponSpec(match, weapon);
    const base = valueAt(ws.damage, levelOf(attacker, weapon.source));
    const spread = ws.spread || 0;
    return base * (1 + spread * (2 * rng.next(match) - 1));
};

const destroyIfDead = (match, attackerIndex, defenderIndex, entity, result) => {
    if (entity.hp < 1) {
        removeEntity(match, defenderIndex, entity);
        match.players[attackerIndex].statistics.attacks += 1;
        result.destroyed.push(entity.type);
        return true;
    }
    return false;
};

const convertXmasFactory = (match, defenderIndex, xmas, targetType) => {
    const cell = cellOfEntity(match, defenderIndex, xmas);
    cell.occupiedBy = cell.occupiedBy.filter(entity => entity.id !== xmas.id);
    const converted = createEntity(match, defenderIndex, targetType, cell);
    cell.occupiedBy.push(converted);
    startTimers(match, defenderIndex, converted, match.t);
    return converted;
};

const removeDonutFromField = (match, defenderIndex, donut) => {
    const cell = cellOfEntity(match, defenderIndex, donut);
    cell.occupiedBy = cell.occupiedBy.filter(entity => entity.id !== donut.id);
};

const findPartner = (match, defenderIndex, donut, partnerType) => entitiesOf(match, defenderIndex)
    .find(entity => entity.type === partnerType && entity.pairId === donut.pairId);

const applyDonutEffect = (match, effect, attackerIndex, defenderIndex, cell, result) => {
    const t = match.t;
    if (effect === DonutEffect.GREEN) {
        patch(match, defenderIndex, cell.row, cell.col, match.balance.donuts.green.area)
            .forEach(target => target.occupiedBy.forEach(entity => { entity.hp = entity.maxHp; }));
    } else if (effect === DonutEffect.WHITE) {
        patch(match, defenderIndex, cell.row, cell.col, match.balance.donuts.white.area)
            .filter(target => !target.molten && !contains(target, EntityType.CREAM))
            .forEach(target => target.occupiedBy.push(createEntity(match, defenderIndex, EntityType.CREAM, target)));
    } else if (effect === DonutEffect.PINK) {
        const attacker = match.players[attackerIndex];
        attacker.stunnedUntil = Math.max(attacker.stunnedUntil, t + match.balance.donuts.pink.stunMs);
    } else if (effect === DonutEffect.XMAS_TO_BALLISTA || effect === DonutEffect.XMAS_TO_FOUNTAIN) {
        const targetType = effect === DonutEffect.XMAS_TO_BALLISTA ? EntityType.HOT_CHOCOLATE_BALLISTA : EntityType.CHOCOLATE_FOUNTAIN;
        entitiesOf(match, defenderIndex).filter(entity => entity.type === EntityType.XMAS_FACTORY).sort(byEntityOrder)
            .forEach(xmas => convertXmasFactory(match, defenderIndex, xmas, targetType));
    }
    result.traps.push(effect);
};

// triggers the defender's donuts in the attacked cell; returns the (possibly swapped) cell contents
const triggerTraps = (match, attackerIndex, defenderIndex, cell, force, result) => {
    if (!force && isShielded(match, defenderIndex, cell.row, cell.col)) {
        return;
    }
    const blue = cell.occupiedBy.find(entity => entity.type === EntityType.DONUT_PORTAL_BLUE);
    if (blue) {
        const red = findPartner(match, defenderIndex, blue, EntityType.DONUT_PORTAL_RED);
        if (red) {
            const redCell = cellOfEntity(match, defenderIndex, red);
            removeDonutFromField(match, defenderIndex, blue);
            removeDonutFromField(match, defenderIndex, red);
            const contents = cell.occupiedBy;
            const type = cell.type;
            cell.occupiedBy = redCell.occupiedBy;
            redCell.occupiedBy = contents;
            cell.type = redCell.type;
            redCell.type = type;
            cell.previewStyle = cell.type.replace('BoardCellTypes.', '').toLowerCase();
            redCell.previewStyle = redCell.type.replace('BoardCellTypes.', '').toLowerCase();
            cell.occupiedBy.forEach(entity => { entity.position = { row: cell.row, col: cell.col }; });
            redCell.occupiedBy.forEach(entity => { entity.position = { row: redCell.row, col: redCell.col }; });
            result.traps.push(DonutEffect.PORTAL);
        }
    }
    const effects = [
        [EntityType.DONUT_HEALTH_GREEN, DonutEffect.GREEN],
        [EntityType.DONUT_CREAM_WHITE, DonutEffect.WHITE],
        [EntityType.DONUT_STOP_PINK, DonutEffect.PINK],
    ];
    for (const [donutType, effect] of effects) {
        const donut = cell.occupiedBy.find(entity => entity.type === donutType);
        if (donut) {
            removeDonutFromField(match, defenderIndex, donut);
            applyDonutEffect(match, effect, attackerIndex, defenderIndex, cell, result);
        }
    }
    const yellow = cell.occupiedBy.find(entity => entity.type === EntityType.DONUT_SURPRISE_YELLOW);
    if (yellow) {
        removeDonutFromField(match, defenderIndex, yellow);
        const effect = DonutEffect[rng.pickWeighted(match, match.balance.donuts.yellow.weights)];
        applyDonutEffect(match, effect, attackerIndex, defenderIndex, cell, result);
    }
};

const resolveBunny = (match, attackerIndex, defenderIndex, cell, bunnyEntity, result) => {
    const area = spec(match, EntityType.SPYING_EASTER_BUNNY).area || 3;
    const cells = patch(match, defenderIndex, cell.row, cell.col, area);
    const xmasFactories = cells.flatMap(target => target.occupiedBy.filter(entity => entity.type === EntityType.XMAS_FACTORY)).sort(byEntityOrder);
    if (xmasFactories.length > 0) {
        removeEntity(match, attackerIndex, bunnyEntity);
        const ballista = convertXmasFactory(match, defenderIndex, xmasFactories[0], EntityType.HOT_CHOCOLATE_BALLISTA);
        result.caught = true;
        result.ballista = { row: ballista.position.row, col: ballista.position.col };
    } else {
        match.players[attackerIndex].statistics.espionages += 1;
        cells.forEach(target => {
            if (contains(target, EntityType.CREAM)) {
                result.revealed.push({ row: target.row, col: target.col });
                target.occupiedBy = target.occupiedBy.filter(entity => entity.type !== EntityType.CREAM);
            }
        });
    }
};

const resolveHotChocolate = (match, attackerIndex, defenderIndex, cell, result) => {
    triggerTraps(match, attackerIndex, defenderIndex, cell, true, result);
    const red = cell.occupiedBy.find(entity => entity.type === EntityType.DONUT_PORTAL_RED);
    if (red) {
        const blue = findPartner(match, defenderIndex, red, EntityType.DONUT_PORTAL_BLUE);
        if (blue) {
            removeDonutFromField(match, defenderIndex, blue);
        }
    }
    if (cell.occupiedBy.some(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type))) {
        match.players[attackerIndex].statistics.moltenFields += 1;
    }
    cell.molten = true;
    [...cell.occupiedBy].forEach(entity => {
        if (isDonut(entity.type)) {
            removeDonutFromField(match, defenderIndex, entity);
        } else {
            entity.hp = 0;
            destroyIfDead(match, attackerIndex, defenderIndex, entity, result);
        }
    });
};

const resolveProjectile = (match, attackerIndex, defenderIndex, cell, weapon, result) => {
    const damage = rollDamage(match, match.players[attackerIndex], weapon);
    const ws = weaponSpec(match, weapon);
    const fountains = shieldingFountains(match, defenderIndex, cell.row, cell.col);
    if (fountains.length > 0) {
        const fountain = fountains[0];
        const factor = weapon.attackType === AttackType.TRUFFLE ? spec(match, EntityType.CHOCOLATE_FOUNTAIN).truffleFactor : 1;
        fountain.hp = Math.round(fountain.hp - damage * factor);
        result.shielded = true;
        const known = match.players[attackerIndex].knownShields;
        if (!known.some(position => position.row === cell.row && position.col === cell.col)) {
            known.push({ row: cell.row, col: cell.col });
        }
        if (destroyIfDead(match, attackerIndex, defenderIndex, fountain, result)) {
            result.fountainDestroyed = true;
            triggerTraps(match, attackerIndex, defenderIndex, cell, false, result);
        }
        return;
    }
    triggerTraps(match, attackerIndex, defenderIndex, cell, false, result);
    const factor = weapon.attackType === AttackType.FRUIT ? (ws.entityFactor || 1) : 1;
    nonDonuts(cell).forEach(entity => {
        const before = entity.hp;
        entity.hp = Math.round(entity.hp - damage * factor);
        result.hits.push({ entityType: entity.type, hpBefore: before, hpAfter: Math.max(0, entity.hp) });
        destroyIfDead(match, attackerIndex, defenderIndex, entity, result);
    });
};

const selectWeapon = (match, attackerIndex, attackType, allowRush) => {
    const candidates = weaponsOf(match, attackerIndex, attackType)
        .map(candidate => ({ ...candidate, status: weaponStatus(match, candidate.weapon, match.t) }))
        .sort((a, b) => (a.weapon.chargedAt - b.weapon.chargedAt) || byEntityOrder(a.entity, b.entity));
    if (candidates.length === 0) {
        throw new NoAttacksLeftError();
    }
    const ready = candidates.find(candidate => candidate.status.state === WeaponState.READY);
    if (ready) {
        return { ...ready, rushCost: 0 };
    }
    const rushable = candidates.find(candidate => candidate.status.state === WeaponState.RUSHABLE);
    if (rushable && allowRush) {
        if (match.players[attackerIndex].cacao < rushable.status.rushCost) {
            throw new NoCacaoLeftError();
        }
        return { ...rushable, rushCost: rushable.status.rushCost };
    }
    throw new WeaponNotReadyError();
};

const attack = (match, events, action) => {
    requirePhase(match, MatchPhase.RUNNING);
    const attackerIndex = action.player;
    const defenderIndex = 1 - attackerIndex;
    const attacker = match.players[attackerIndex];
    const { attackType, row, col, allowRush } = action.payload || {};
    if (!AttackType.isInstanceOf(attackType)) {
        throw new ActionValidationError(action);
    }
    if (match.t < attacker.stunnedUntil) {
        throw new StunnedError();
    }
    const cell = cellAt(match, defenderIndex, row, col);
    if (!cell) {
        throw new ActionValidationError(action);
    }
    if (attackType === AttackType.HOT_CHOCOLATE && cell.molten) {
        throw new AlreadyMolten();
    }
    if ((attackType === AttackType.TRUFFLE || attackType === AttackType.FRUIT) && nonDonuts(cell).length === 0) {
        throw new TargetEmptyError();
    }
    const selected = selectWeapon(match, attackerIndex, attackType, allowRush === true);
    const targetBefore = nonDonuts(cell).map(entity => entity.type);

    selected.weapon.chargedAt = match.t;
    attacker.cacao -= selected.rushCost;
    attacker.statistics.spentCacao += selected.rushCost;
    attacker.statistics.shotsFired += 1;
    if (selected.rushCost > 0) {
        attacker.statistics.rushes += 1;
    }

    const result = { shielded: false, fountainDestroyed: false, traps: [], hits: [], destroyed: [], revealed: [], caught: false };
    if (attackType === AttackType.BUNNY) {
        resolveBunny(match, attackerIndex, defenderIndex, cell, selected.entity, result);
    } else if (attackType === AttackType.HOT_CHOCOLATE) {
        resolveHotChocolate(match, attackerIndex, defenderIndex, cell, result);
    } else {
        resolveProjectile(match, attackerIndex, defenderIndex, cell, selected.weapon, result);
    }
    if (result.hits.length > 0 || result.shielded || result.destroyed.length > 0) {
        attacker.statistics.shotsHit += 1;
    }
    pushEvent(match, events, 'attack', attackerIndex, [0, 1], {
        attackType, row, col, rushCost: selected.rushCost, result,
    }, {
        targetBefore,
        oneShot: result.hits.some(hit => hit.entityType !== EntityType.CREAM && hit.hpAfter === 0 && hit.hpBefore > 0),
    });
};

const surrender = (match, events, action) => {
    if (match.phase === MatchPhase.ENDED) {
        throw new GameAlreadyEndedError(action);
    }
    endMatch(match, events, [1 - action.player], OutcomeReason.SURRENDER);
};

const handlers = {
    [MatchActionTypes.chooseField]: chooseField,
    [MatchActionTypes.placeFactory]: placeFactory,
    [MatchActionTypes.build]: build,
    [MatchActionTypes.placeDonut]: placeDonut,
    [MatchActionTypes.attack]: attack,
    [MatchActionTypes.surrender]: surrender,
};

/**
 * Applies an action { type, player, t, payload } to the match.
 * The match is first advanced to action.t. On an invalid action the advancement stays, the
 * action itself has no effect, and the returned object carries the error.
 *
 * @returns {{ok: true, events: object[]} | {ok: false, error: Error, events: object[]}}
 */
const applyAction = (match, action) => {
    if (!action || !handlers[action.type] || (action.player !== 0 && action.player !== 1)) {
        return { ok: false, error: new ActionValidationError(action || { type: 'undefined' }), events: [] };
    }
    if (!Number.isFinite(action.t) || action.t < match.t) {
        return { ok: false, error: new InvalidTimeError(action.t, match.t), events: [] };
    }
    const events = advanceTo(match, action.t);
    if (match.phase === MatchPhase.ENDED && action.type !== MatchActionTypes.surrender) {
        return { ok: false, error: new GameAlreadyEndedError(action), events };
    }
    try {
        handlers[action.type](match, events, action);
    } catch (error) {
        if (error instanceof BattlechocError) {
            return { ok: false, error, events };
        }
        throw error;
    }
    checkOutcome(match, events);
    return { ok: true, events };
};

/** Checks an action without changing the match. Returns null when it is valid, otherwise the error. */
const validateAction = (match, action) => {
    const copy = structuredClone(match);
    const result = applyAction(copy, action);
    return result.ok ? null : result.error;
};

module.exports = {
    MatchPhase,
    MatchActionTypes,
    OutcomeReason,
    DonutEffect,
    WeaponState,
    BUILDABLE,
    createMatch,
    prepareScenario,
    advanceTo,
    applyAction,
    validateAction,
    nextTimerAt,
    // derived selectors
    cellAt,
    entitiesOf,
    isShielded,
    buildCapacity,
    cacaoPerSecond,
    producerStats,
    generatorStats,
    weaponsOf,
    weaponStatus,
    hasHarmfulWeapon,
    boardValue,
    creamFootprint,
};
