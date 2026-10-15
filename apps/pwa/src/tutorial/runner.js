import { engine } from "@battlechoc/battlechoc-shared-functions";
import { LocalMatchHost, matchSession } from "../match/LocalMatchHost";
import { MatchClock, ManualClock } from "../match/clock";
import { matchCleared } from "../match/matchSlice";
import { selectAttack, selectBuilding, deselectAttack, deselectBuildings, focusBoard } from "../ui/UiActions";
import { lessonMatch } from "./lesson";
import { demos, demoMatch } from "./demos";

const TICK_MS = 50;
const LOOP_PAUSE_MS = 1500;

/**
 * Hosts the tutorial's matches on this device: the interactive lesson on the normal match
 * clock, and the demos on a manual clock that a ticker fast-forwards (demo.speed), looping
 * until the player moves on. The scene renders them like any real-time match.
 */
class TutorialRunner {
  constructor({ dispatch, clearScene, testClock = false }) {
    this.dispatch = dispatch;
    this.clearScene = clearScene;
    this.testClock = testClock;
    this.ticker = undefined;
    this.restart = undefined;
  }

  stop() {
    clearInterval(this.ticker);
    clearTimeout(this.restart);
    this.ticker = undefined;
    if (typeof matchSession.host !== "undefined") {
      matchSession.host.stop();
      matchSession.host = undefined;
    }
    this.dispatch(matchCleared());
    this.dispatch(deselectAttack());
    this.dispatch(deselectBuildings());
    this.clearScene();
  }

  host(clock, onEnded) {
    const host = new LocalMatchHost({ dispatch: this.dispatch, clock, onEnded });
    matchSession.host = host;
    window.__battlechoc = { host, engine };
    return host;
  }

  startLesson({ playerName, onEnded }) {
    this.stop();
    const clock = this.testClock ? new ManualClock() : new MatchClock();
    this.host(clock, onEnded).startNew(lessonMatch({ playerName }));
  }

  startDemo(id, { playerName }) {
    this.stop();
    const demo = demos[id];
    const clock = new ManualClock();
    this.host(clock).startNew(demoMatch(id, { playerName }));
    let cue = 0;
    this.ticker = setInterval(() => {
      if (!clock.running) {
        return;
      }
      clock.advance(TICK_MS * demo.speed);
      while (cue < demo.cues.length && demo.cues[cue].at <= clock.now()) {
        const { attack, building } = demo.cues[cue];
        this.dispatch(attack ? selectAttack(attack) : selectBuilding(building));
        this.dispatch(focusBoard(attack ? "opponent" : "own"));
        cue += 1;
      }
      if (clock.now() >= demo.duration) {
        clearInterval(this.ticker);
        this.restart = setTimeout(() => this.startDemo(id, { playerName }), LOOP_PAUSE_MS);
      }
    }, TICK_MS);
  }
}

export { TutorialRunner };
