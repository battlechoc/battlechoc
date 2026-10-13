import { engine } from "@battlechoc/battlechoc-shared-functions";
import { MatchClock } from "./clock";
import { matchUpdated, matchPaused, matchAwarded } from "./matchSlice";
import logger from "../helper/logger";

const LOCAL_PLAYER = 0;
const SAVE_FORMAT = 1;
const SAVE_THROTTLE_MS = 5000;

// AIs live in the shared package so the server and the simulations use the same ones
const agentKinds = {
  TomToffee: engine.ai.TomToffee,
  GustavGanache: engine.ai.GustavGanache,
};

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

  static createAgent({ kind, playerIndex, seed, reactionTimeMs, rng, wakeAt, options, state }) {
    const AgentClass = agentKinds[kind];
    const agent = new AgentClass({ playerIndex, seed, reactionTimeMs, ...(options || {}) });
    agent.kind = kind;
    agent.options = options;
    if (typeof rng === "number") {
      agent.random.rng = rng;
    }
    if (typeof state !== "undefined") {
      agent.importState(state);
    }
    agent.wakeAt = typeof wakeAt === "number" ? wakeAt : reactionTimeMs;
    return agent;
  }

  startNew({ players, boardSize, seed, agents }) {
    this.match = engine.createMatch({ players, boardSize, seed, fieldChooser: LOCAL_PLAYER });
    this.agents = agents.map((descriptor) => LocalMatchHost.createAgent(descriptor));
    this.clock.start(0);
    this.publish();
    this.schedule();
  }

  restore(saved) {
    if (!saved || saved.format !== SAVE_FORMAT) {
      throw new Error("Unsupported saved match");
    }
    this.match = saved.match;
    this.agents = saved.agents.map((descriptor) => LocalMatchHost.createAgent(descriptor));
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
      agents: this.agents.map((agent) => ({
        kind: agent.kind,
        playerIndex: agent.playerIndex,
        seed: agent.seed,
        reactionTimeMs: agent.reactionTimeMs,
        rng: agent.random.rng,
        wakeAt: agent.wakeAt,
        options: agent.options,
        state: structuredClone(agent.exportState()),
      })),
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
    const t = this.match.t;
    this.agents
      .filter((agent) => agent.wakeAt <= t)
      .forEach((agent) => {
        if (this.match.phase !== engine.MatchPhase.ENDED) {
          try {
            const decision = agent.decide(engine.getPlayerView(this.match, agent.playerIndex), t);
            if (decision) {
              const result = engine.applyAction(this.match, { ...decision, player: agent.playerIndex, t });
              if (!result.ok) {
                logger.info("agent action rejected", result.error.message);
              }
            }
          } catch (error) {
            logger.warn(error);
          }
        }
        agent.wakeAt = t + agent.nextReactionTime();
      });
  }

  tick() {
    if (this.stopped || !this.match || !this.clock.running) {
      return;
    }
    engine.advanceTo(this.match, this.now());
    this.runAgents();
    this.publish();
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timeout);
    if (this.stopped || !this.clock.running || this.match.phase === engine.MatchPhase.ENDED) {
      return;
    }
    const candidates = [engine.nextTimerAt(this.match), ...this.agents.map((agent) => agent.wakeAt)]
      .filter((value) => typeof value === "number");
    const next = Math.min(...candidates);
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
      awards: engine.computeMatchAwards(this.match, LOCAL_PLAYER).map((award) => ({ key: award.key, coins: award.coins })),
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
