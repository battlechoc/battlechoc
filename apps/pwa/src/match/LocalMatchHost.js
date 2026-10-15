import { engine } from "@battlechoc/battlechoc-shared-functions";
import { MatchClock } from "./clock";
import { matchUpdated, matchPaused, matchAwarded } from "./matchSlice";
import logger from "../helper/logger";

const LOCAL_PLAYER = 0;
const SAVE_FORMAT = 1;
const SAVE_THROTTLE_MS = 5000;

/**
 * Hosts a real-time match on this device: it owns the full engine state, the match clock
 * and the AI agents, wakes up when the next timer or agent decision is due, and publishes
 * the local player's view to Redux. The local player is always player 0.
 */
class LocalMatchHost {
  constructor({ dispatch, clock = new MatchClock(), save, onEnded } = {}) {
    this.dispatch = dispatch;
    this.clock = clock;
    this.save = save || (() => Promise.resolve());
    this.onEnded = onEnded || (() => {});
    this.timeout = undefined;
    this.lastSeq = -1;
    this.lastSave = 0;
    this.userPaused = false;
    this.stopped = false;
    this.endNotified = false;
    this.visibilityListener = () => {
      if (document.visibilityState === "hidden") {
        this.persist(true);
        this.pause(false);
      } else if (!this.userPaused) {
        this.resume(false);
      }
    };
    document.addEventListener("visibilitychange", this.visibilityListener);
    if (typeof clock.onAdvance === "function") {
      clock.onAdvance(() => this.tick());
    }
  }

  startNew({ players, boardSize, seed, agents, scenario, balance }) {
    this.match = engine.createMatch({ players, boardSize, seed, balance, fieldChooser: LOCAL_PLAYER });
    if (typeof scenario !== "undefined") {
      engine.prepareScenario(this.match, scenario);
    }
    this.agents = agents.map((descriptor) => engine.createAgent(descriptor));
    this.clock.start(0);
    this.publish();
    this.schedule();
  }

  restore(saved) {
    if (!saved || saved.format !== SAVE_FORMAT) {
      throw new Error("Unsupported saved match");
    }
    this.match = saved.match;
    this.agents = saved.agents.map((descriptor) => engine.createAgent(descriptor));
    this.clock.start(this.match.t);
    this.lastSeq = -1;
    this.publish();
    this.schedule();
  }

  serialize() {
    return {
      format: SAVE_FORMAT,
      savedAt: Date.now(),
      match: structuredClone(this.match),
      agents: this.agents.map((agent) => engine.serializeAgent(agent)),
    };
  }

  now() {
    return Math.max(this.match.t, this.clock.now());
  }

  /** Applies an action of the local player; resolves with the events or rejects with the BattlechocError. */
  submit(type, payload = {}) {
    if (this.stopped || !this.match) {
      return Promise.reject(new Error("No running match"));
    }
    if (!this.clock.running && this.match.phase !== engine.MatchPhase.ENDED) {
      return Promise.reject(new Error("The match is paused"));
    }
    const result = engine.applyAction(this.match, { type, player: LOCAL_PLAYER, t: this.now(), payload });
    this.runAgents();
    this.publish();
    this.schedule();
    return result.ok ? Promise.resolve(result.events) : Promise.reject(result.error);
  }

  runAgents() {
    engine.runDueAgents(this.match, this.agents, {
      onRejected: (error) => logger.info("agent action rejected", error.message),
    });
  }

  tick() {
    if (this.stopped || !this.match || !this.clock.running) {
      return;
    }
    // every timer and agent decision at its own time, also after a long jump of the clock
    const now = this.now();
    let next = engine.nextWakeAt(this.match, this.agents);
    while (next !== null && next <= now) {
      engine.advanceTo(this.match, next);
      this.runAgents();
      next = engine.nextWakeAt(this.match, this.agents);
    }
    engine.advanceTo(this.match, now);
    this.runAgents();
    this.publish();
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timeout);
    const next = engine.nextWakeAt(this.match, this.agents);
    if (this.stopped || !this.clock.running || next === null) {
      return;
    }
    const delay = Math.max(0, next - this.clock.now());
    // a ManualClock only moves on advance(), which ticks the host itself
    if (this.clock instanceof MatchClock) {
      this.timeout = setTimeout(() => this.tick(), Math.min(delay, 60000));
    }
  }

  publish() {
    const view = engine.getPlayerView(this.match, LOCAL_PLAYER, { eventsAfter: this.lastSeq });
    const events = view.events;
    if (events.length > 0) {
      this.lastSeq = events[events.length - 1].seq;
    }
    this.dispatch(matchUpdated({ view: { ...view, events: [] }, events }));

    if (this.match.phase === engine.MatchPhase.ENDED && !this.endNotified) {
      this.endNotified = true;
      this.dispatch(matchAwarded(this.result().awards));
      this.save(undefined);
      this.onEnded(this.result());
    } else {
      this.persist(false);
    }
  }

  persist(force) {
    if (this.match.phase === engine.MatchPhase.ENDED) {
      return;
    }
    const now = Date.now();
    if (force || now - this.lastSave > SAVE_THROTTLE_MS) {
      this.lastSave = now;
      this.save(this.serialize()).catch((error) => logger.warn(error));
    }
  }

  /** Outcome, awards and statistics of the local player once the match has ended. */
  result() {
    const outcome = this.match.outcome;
    if (!outcome) {
      return undefined;
    }
    return {
      won: outcome.winners.length === 1 && outcome.winners[0] === LOCAL_PLAYER,
      draw: outcome.winners.length === 2,
      reason: outcome.reason,
      winners: outcome.winners.map((index) => ({ ...this.match.players[index], idx: index })),
      statistics: structuredClone(this.match.players[LOCAL_PLAYER].statistics),
      awards: engine.computeMatchAwards(this.match, LOCAL_PLAYER).map((award) => ({ key: award.key, xp: award.xp })),
    };
  }

  pause(byUser = true) {
    if (byUser) {
      this.userPaused = true;
      this.persist(true);
    }
    this.clock.pause();
    clearTimeout(this.timeout);
    this.dispatch(matchPaused(true));
  }

  resume(byUser = true) {
    if (byUser) {
      this.userPaused = false;
    }
    if (this.userPaused || this.stopped) {
      return;
    }
    this.clock.resume();
    this.dispatch(matchPaused(false));
    this.tick();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timeout);
    document.removeEventListener("visibilitychange", this.visibilityListener);
  }
}

// the host of the running match, if any (like the multiplayer singleton)
const matchSession = {
  host: undefined,
};

export { LocalMatchHost, matchSession, LOCAL_PLAYER };
