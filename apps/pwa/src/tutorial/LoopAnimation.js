export default class LoopAnimation {
    constructor(getGame, manipulate, spawnInfo, setRenderLoop, reset, loadSituation) {
        this.getGame = getGame;
        this.manipulate = manipulate;
        this.spawnInfo = spawnInfo;
        this.setRenderLoop = setRenderLoop;
        this.reset = reset;
        this.loadSituation = loadSituation;
        this.token = { cancel: null };
        this.running = false;
        this.next = null;
    }

    stop() {
        this.running = false;
        this.next = null;
        if (this.token.cancel) {
            this.token.cancel();
        }
    }
    
    start(Situation) {
        if (this.running) {
            this.stop();
            this.situation.forceStop();
            this.next = async () => {
                this.running = true;
                await this.loop(Situation);
            }
        } else {
            this.running = true;
            this.loop(Situation);
        }
    }

    async loop(Situation) {
        const sleep = (ms) => {
            if (this.running) {
                return new Promise(resolve => {
                    const timeout = setTimeout(resolve, ms);
                    this.token.cancel = () => {
                        clearTimeout(timeout);
                        this.token.cancel = null;
                        resolve();
                    }
                });
            }
        }
        await this.loadSituation(Situation);
        this.setRenderLoop(true);
        await sleep(1000);
        const game = this.getGame();
        this.situation = new Situation();
        await this.situation.play(game, this.manipulate, this.spawnInfo, sleep);
        await sleep(2000);
        this.setRenderLoop(false);
        await this.reset();
        if (this.running) {
            await this.loop(Situation);
        } else if (this.next) {
            await this.next();
        }
    }
}