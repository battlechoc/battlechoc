import {
  engine,
  EntityType,
  AttackType,
  isDonut,
} from "@battlechoc/battlechoc-shared-functions";

const { Agent, MatchPhase, MatchActionTypes, WeaponState } = engine;

const hasCream = (cell) =>
  cell.occupiedBy.some((entity) => entity.type === EntityType.CREAM);
const isBuildable = (cell) =>
  !cell.molten &&
  cell.occupiedBy.every(
    (entity) => entity.type === EntityType.CREAM || isDonut(entity.type)
  );

/**
 * The easy AI. Tick-driven: the host wakes it every 2.5 to 4 s of match time and it
 * returns at most one action. It builds mostly cacao trees and some truffle cannons,
 * hides them under existing cream when it can, never rushes and shoots at random cells
 * that show something (cream or a visible building).
 */
export default class TomToffee extends Agent {
  constructor({ playerIndex, seed, reactionTimeMs = 3000 }) {
    super({ playerIndex, seed, reactionTimeMs });
  }

  nextReactionTime() {
    return 2500 + Math.floor(this.nextRandom() * 1500);
  }

  decide(view, t) {
    if (view.phase === MatchPhase.PLACEMENT) {
      return this.placeFactory(view);
    }
    if (view.phase !== MatchPhase.RUNNING) {
      return null;
    }
    return this.attack(view, t) || this.build(view);
  }

  placeFactory(view) {
    const grid = this.ownGrid(view);
    if (
      grid.some((cell) =>
        cell.occupiedBy.some((entity) => entity.type === EntityType.FACTORY)
      )
    ) {
      return null;
    }
    const free = grid.filter(isBuildable);
    const hidden = free.filter(hasCream);
    const cell = this.pick(hidden.length > 0 ? hidden : free);
    return {
      type: MatchActionTypes.placeFactory,
      payload: { row: cell.row, col: cell.col },
    };
  }

  attack(view, t) {
    const me = view.players[this.playerIndex];
    const truffle = this.weaponStates(view, t)[AttackType.TRUFFLE];
    if (!truffle || truffle.state !== WeaponState.READY || t < me.stunnedUntil) {
      return null;
    }
    const targets = this.opponentGrid(view).filter(
      (cell) => !cell.molten && cell.occupiedBy.length > 0
    );
    if (targets.length === 0) {
      return null;
    }
    const visible = targets.filter((cell) =>
      cell.occupiedBy.some((entity) => entity.type !== EntityType.CREAM)
    );
    const cell = this.pick(
      visible.length > 0 && this.nextRandom() < 0.5 ? visible : targets
    );
    return {
      type: MatchActionTypes.attack,
      payload: { attackType: AttackType.TRUFFLE, row: cell.row, col: cell.col },
    };
  }

  build(view) {
    const me = view.players[this.playerIndex];
    if (me.buildTokens < 1) {
      return null;
    }
    const costs = (type) => view.balance.entities[type].costs;
    let entityType;
    if (this.nextRandom() < 0.8 && me.cacao >= costs(EntityType.CACAOTREE)) {
      entityType = EntityType.CACAOTREE;
    } else if (me.cacao >= costs(EntityType.RUM_TRUFFLE_CANNON)) {
      entityType = EntityType.RUM_TRUFFLE_CANNON;
    } else {
      return null;
    }
    const free = this.ownGrid(view).filter(
      (cell) =>
        isBuildable(cell) &&
        !cell.occupiedBy.some((entity) => entity.type !== EntityType.CREAM)
    );
    if (free.length === 0) {
      return null;
    }
    const hidden = free.filter(hasCream);
    const cell = this.pick(hidden.length > 0 ? hidden : free);
    return {
      type: MatchActionTypes.build,
      payload: { entityType, row: cell.row, col: cell.col },
    };
  }
}
