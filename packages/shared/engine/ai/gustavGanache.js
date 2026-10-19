// The strong AI. Tick-driven and limited to its own player view (no hidden information):
// - remembers what it has seen on the opponent's field, even after it was creamed again,
//   and the shielded cells it ran into,
// - has a personality (defensive, aggressive, balanced) that shifts a "rage" value rolled
//   once per time window; rage drives how offensive it plays and when it rushes,
// - the handicap (0 strongest .. 4 weakest) sets its reaction time and which buildings it
//   may use, like the turn-based Augustus did.

const { BoardCellTypes, EntityType, AttackType, isDonut } = require('../../constants');
const { MatchPhase, MatchActionTypes, WeaponState, creamArea } = require('../index');
const { Agent } = require('../agents');

const Personality = Object.freeze({
    DEFENSIVE: 'Personality.DEFENSIVE',
    AGGRESSIVE: 'Personality.AGGRESSIVE',
    BALANCED: 'Personality.BALANCED',
});

// attack priority of remembered or visible opponent entities, highest first
const TARGET_PRIORITY = [
    EntityType.FACTORY,
    EntityType.FACTORY_EXTENSION,
    EntityType.HOT_CHOCOLATE_BALLISTA,
    EntityType.FRUIT_CANNON,
    EntityType.RUM_TRUFFLE_CANNON,
    EntityType.SPYING_EASTER_BUNNY,
    EntityType.DONUT_FACTORY,
    EntityType.CACAOTREE,
    EntityType.CHOCOLATE_FOUNTAIN,
    EntityType.XMAS_FACTORY,
];

const key = cell => `${cell.row}:${cell.col}`;
const hasCream = cell => cell.occupiedBy.some(entity => entity.type === EntityType.CREAM);
const buildings = cell => cell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM && !isDonut(entity.type));
const isFree = cell => !cell.molten && buildings(cell).length === 0;
const contains = (cell, type) => cell.occupiedBy.some(entity => entity.type === type);
const neighbours4 = (grid, size, cell) => [[0, -1], [0, 1], [-1, 0], [1, 0]]
    .map(([dr, dc]) => [cell.row + dr, cell.col + dc])
    .filter(([row, col]) => row >= 0 && col >= 0 && row < size.rows && col < size.cols)
    .map(([row, col]) => grid[row * size.cols + col]);

class GustavGanache extends Agent {
    /**
     * @param {object} options
     * @param {number} [options.handicap] 0 (strongest) .. 4
     * @param {string} [options.personality] one of Personality, random by default
     */
    constructor({ playerIndex, seed, handicap = 0, personality, reactionTimeMs }) {
        super({ playerIndex, seed, reactionTimeMs: reactionTimeMs || 1000 });
        this.handicap = Math.max(0, Math.min(4, handicap));
        // probability of playing a decision well: 1.0 at handicap 0 down to 0.2 at handicap 4
        this.skill = 1 - this.handicap * 0.2;
        this.personality = personality || this.pick(Object.values(Personality));
        this.memory = {};
        this.rage = 0.5;
        this.rageUntil = -1;
    }

    nextReactionTime() {
        const byHandicap = [800, 1000, 1400, 2000, 3600];
        const base = byHandicap[this.handicap];
        return base + Math.floor(this.nextRandom() * base * 0.25);
    }

    exportState() {
        return { memory: this.memory, rage: this.rage, rageUntil: this.rageUntil, personality: this.personality };
    }

    importState(state) {
        Object.assign(this, state || {});
    }

    allowed(type) {
        const gates = {
            [EntityType.CHOCOLATE_FOUNTAIN]: 2,
            [EntityType.FRUIT_CANNON]: 2,
            [EntityType.SPYING_EASTER_BUNNY]: 3,
            [EntityType.XMAS_FACTORY]: 3,
            [EntityType.FACTORY_EXTENSION]: 4,
            [EntityType.DONUT_FACTORY]: 1,
        };
        return typeof gates[type] === 'undefined' || this.handicap < gates[type];
    }

    rollRage(t) {
        if (t >= this.rageUntil) {
            const shift = this.personality === Personality.AGGRESSIVE ? 0.25 : this.personality === Personality.DEFENSIVE ? -0.25 : 0;
            this.rage = Math.max(0, Math.min(1, this.nextRandom() + shift));
            this.rageUntil = t + 30000;
        }
    }

    // keeps what was visible on the opponent's field; forgets cells seen empty or molten
    remember(view, t) {
        this.opponentGrid(view).forEach(cell => {
            if (this.nextRandom() > this.skill) {
                return;
            }
            const visible = buildings(cell);
            const id = key(cell);
            if (cell.molten) {
                delete this.memory[id];
            } else if (!hasCream(cell)) {
                if (visible.length > 0) {
                    this.memory[id] = { types: visible.map(entity => entity.type), seenAt: t };
                } else {
                    delete this.memory[id];
                }
            }
        });
    }

    decide(view, t) {
        if (view.phase === MatchPhase.PLACEMENT) {
            return this.placeFactory(view);
        }
        if (view.phase !== MatchPhase.RUNNING) {
            return null;
        }
        this.rollRage(t);
        this.remember(view, t);
        return this.attack(view, t) || this.build(view, t) || this.attack(view, t, true);
    }

    placeFactory(view) {
        const grid = this.ownGrid(view);
        if (grid.some(cell => contains(cell, EntityType.FACTORY))) {
            return null;
        }
        const free = grid.filter(isFree);
        const score = cell => (hasCream(cell) ? 2 : 0) + (cell.type === BoardCellTypes.BLACK ? 1 : 0) +
            neighbours4(grid, view.board.size, cell).filter(isFree).length * 0.1;
        const best = Math.max(...free.map(score));
        const cell = this.pick(free.filter(candidate => score(candidate) === best));
        return { type: MatchActionTypes.placeFactory, payload: { row: cell.row, col: cell.col } };
    }

    /* ---------- attacking ---------- */

    usableWeapon(view, t, attackType, allowRush) {
        const me = view.players[this.playerIndex];
        const status = this.weaponStates(view, t)[attackType];
        if (!status || t < me.stunnedUntil) {
            return null;
        }
        if (status.state === WeaponState.READY) {
            return { rush: false };
        }
        const reserve = this.personality === Personality.AGGRESSIVE ? 20 : this.personality === Personality.DEFENSIVE ? 120 : 60;
        if (allowRush && this.skill >= 0.6 && status.state === WeaponState.RUSHABLE && me.cacao - status.rushCost >= reserve && this.rage > 0.4) {
            return { rush: true };
        }
        return null;
    }

    targetFor(view, attackType) {
        const grid = this.opponentGrid(view);
        const me = view.players[this.playerIndex];
        const knownShield = cell => me.knownShields.some(position => position.row === cell.row && position.col === cell.col) || cell.shielded;
        const targetable = cell => !cell.molten && (attackType === AttackType.HOT_CHOCOLATE || attackType === AttackType.BUNNY || cell.occupiedBy.length > 0);
        const remembered = cell => (this.memory[key(cell)] || { types: [] }).types;
        const priority = cell => {
            const types = [...buildings(cell).map(entity => entity.type), ...remembered(cell)];
            const ranks = types.map(type => TARGET_PRIORITY.indexOf(type)).filter(rank => rank >= 0);
            return ranks.length > 0 ? Math.min(...ranks) : TARGET_PRIORITY.length;
        };

        if (attackType === AttackType.BUNNY) {
            // reveal the 3x3 area with the most cream that hides nothing remembered
            const candidates = grid.filter(cell => !cell.molten);
            const creamAround = cell => grid.filter(other => Math.abs(other.row - cell.row) <= 1 && Math.abs(other.col - cell.col) <= 1 &&
                hasCream(other) && remembered(other).length === 0).length;
            const best = Math.max(...candidates.map(creamAround));
            return best > 1 ? this.pick(candidates.filter(cell => creamAround(cell) === best)) : null;
        }
        if (attackType === AttackType.FRUIT) {
            const shielded = grid.filter(cell => targetable(cell) && knownShield(cell));
            return shielded.length > 0 ? this.pick(shielded) : null;
        }

        const candidates = grid.filter(targetable)
            .filter(cell => attackType !== AttackType.TRUFFLE || !knownShield(cell) || !this.hasWeapon(view, AttackType.FRUIT));
        if (candidates.length === 0) {
            return null;
        }
        if (attackType === AttackType.TRUFFLE && this.nextRandom() > this.skill) {
            return this.pick(candidates);
        }
        const best = Math.min(...candidates.map(priority));
        if (best < TARGET_PRIORITY.length) {
            return this.pick(candidates.filter(cell => priority(cell) === best));
        }
        if (attackType === AttackType.HOT_CHOCOLATE) {
            // do not waste a ballista shot on a random cell
            return null;
        }
        const creamed = candidates.filter(hasCream);
        return this.pick(creamed.length > 0 ? creamed : candidates);
    }

    hasWeapon(view, attackType) {
        return typeof this.weaponStates(view, 0)[attackType] !== 'undefined';
    }

    attack(view, t, allowRush = false) {
        const order = [AttackType.HOT_CHOCOLATE, AttackType.BUNNY, AttackType.FRUIT, AttackType.TRUFFLE];
        for (const attackType of order) {
            const usable = this.usableWeapon(view, t, attackType, allowRush);
            if (!usable) {
                continue;
            }
            const cell = this.targetFor(view, attackType);
            if (cell) {
                return { type: MatchActionTypes.attack, payload: { attackType, row: cell.row, col: cell.col, allowRush: usable.rush } };
            }
        }
        return null;
    }

    /* ---------- building ---------- */

    build(view, t) {
        const me = view.players[this.playerIndex];
        const grid = this.ownGrid(view);
        const size = view.board.size;
        if (me.donuts.length > 0) {
            const donutCells = grid.filter(cell => !cell.molten && !cell.occupiedBy.some(entity => isDonut(entity.type)));
            const valuable = donutCells.filter(cell => buildings(cell).length > 0);
            const cell = this.pick(valuable.length > 0 ? valuable : donutCells);
            if (cell) {
                return { type: MatchActionTypes.placeDonut, payload: { donutType: me.donuts[0].type, row: cell.row, col: cell.col } };
            }
        }
        if (me.buildTokens < 1) {
            return null;
        }
        const costs = type => view.balance.entities[type].costs || 0;
        const count = type => grid.filter(cell => contains(cell, type)).length;
        const affordable = type => this.allowed(type) && me.cacao >= costs(type);
        const free = grid.filter(isFree);
        const hidden = free.filter(hasCream);
        const factoryCell = grid.find(cell => contains(cell, EntityType.FACTORY));
        const minutes = (t - (view.startedAt || 0)) / 60000;
        const place = (entityType, cells) => {
            const options = cells && cells.length > 0 ? cells : (hidden.length > 0 ? hidden : free);
            const cell = this.pick(options);
            return cell ? { type: MatchActionTypes.build, payload: { entityType, row: cell.row, col: cell.col } } : null;
        };

        // a weaker Gustav sometimes just builds something affordable
        if (this.nextRandom() > this.skill) {
            const basic = [EntityType.CACAOTREE, EntityType.RUM_TRUFFLE_CANNON].filter(affordable);
            return basic.length > 0 ? place(this.pick(basic)) : null;
        }

        // 1. hide exposed own buildings
        const exposed = grid.filter(cell => buildings(cell).length > 0 && !hasCream(cell) && !cell.molten);
        if (exposed.length > 0 && this.rage < 0.75 && this.nextRandom() < this.skill) {
            const exposedKeys = new Set(exposed.map(key));
            const anchors = grid.map(cell => ({
                cell,
                covers: creamArea(view.balance, size, cell.row, cell.col).filter(position => exposedKeys.has(key(position))).length,
            }));
            const best = Math.max(...anchors.map(anchor => anchor.covers));
            const anchor = this.pick(anchors.filter(candidate => candidate.covers === best)).cell;
            return { type: MatchActionTypes.build, payload: { entityType: EntityType.CREAM, row: anchor.row, col: anchor.col } };
        }

        const trees = count(EntityType.CACAOTREE);
        const cannons = count(EntityType.RUM_TRUFFLE_CANNON) + count(EntityType.FRUIT_CANNON);
        const treeTarget = Math.round(2 + minutes + (1 - this.rage) * 2);
        const cannonTarget = Math.round(1 + minutes * (0.5 + this.rage) + this.rage * 2);

        // 2. economy first in the opening, then keep a mix
        if (trees < 2 && affordable(EntityType.CACAOTREE)) {
            const white = hidden.filter(cell => cell.type === BoardCellTypes.WHITE);
            return place(EntityType.CACAOTREE, white);
        }
        if (cannons < 1 && affordable(EntityType.RUM_TRUFFLE_CANNON)) {
            return place(EntityType.RUM_TRUFFLE_CANNON);
        }
        // 3. specials
        if (factoryCell && affordable(EntityType.FACTORY_EXTENSION) && count(EntityType.FACTORY_EXTENSION) < 2 && this.rage < 0.6) {
            const adjacent = neighbours4(grid, size, factoryCell).filter(isFree);
            if (adjacent.length > 0) {
                const black = adjacent.filter(cell => cell.type === BoardCellTypes.BLACK);
                return place(EntityType.FACTORY_EXTENSION, black.length > 0 ? black : adjacent);
            }
        }
        if (factoryCell && affordable(EntityType.CHOCOLATE_FOUNTAIN) && count(EntityType.CHOCOLATE_FOUNTAIN) < 1 && !factoryCell.shielded) {
            const near = free.filter(cell => Math.abs(cell.row - factoryCell.row) <= 1 && Math.abs(cell.col - factoryCell.col) <= 1);
            if (near.length > 0) {
                return place(EntityType.CHOCOLATE_FOUNTAIN, near);
            }
        }
        if (affordable(EntityType.FRUIT_CANNON) && me.knownShields.length > 0 && count(EntityType.FRUIT_CANNON) < 1) {
            const truffleCells = grid.filter(cell => contains(cell, EntityType.RUM_TRUFFLE_CANNON));
            if (truffleCells.length > 0) {
                return place(EntityType.FRUIT_CANNON, truffleCells);
            }
        }
        if (affordable(EntityType.SPYING_EASTER_BUNNY) && count(EntityType.SPYING_EASTER_BUNNY) < 1 && this.rage > 0.5) {
            return place(EntityType.SPYING_EASTER_BUNNY);
        }
        if (affordable(EntityType.XMAS_FACTORY) && count(EntityType.XMAS_FACTORY) < 1 && minutes > 1) {
            return place(EntityType.XMAS_FACTORY);
        }
        if (affordable(EntityType.DONUT_FACTORY) && count(EntityType.DONUT_FACTORY) < 1 && minutes > 1.5) {
            return place(EntityType.DONUT_FACTORY);
        }
        // 4. mix of trees and cannons by rage
        if (cannons < cannonTarget && affordable(EntityType.RUM_TRUFFLE_CANNON) && this.nextRandom() < 0.4 + this.rage * 0.5) {
            return place(EntityType.RUM_TRUFFLE_CANNON);
        }
        if (trees < treeTarget && affordable(EntityType.CACAOTREE)) {
            const white = hidden.filter(cell => cell.type === BoardCellTypes.WHITE);
            return place(EntityType.CACAOTREE, white);
        }
        if (affordable(EntityType.RUM_TRUFFLE_CANNON) && me.cacao > 100) {
            return place(EntityType.RUM_TRUFFLE_CANNON);
        }
        return null;
    }
}

module.exports = { GustavGanache, Personality };
