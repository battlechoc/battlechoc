// The scene renders on demand: a frame when something changed, and continuously only while
// something moves. `request` renders once in the next frame however often it is asked before
// (every view update used to render right away); `run(true)` starts the render loop for an
// animation and `run(false)` gives it back: the loop runs while any animation holds it.
export class RenderLoop {
  constructor(engine, scene) {
    this.engine = engine;
    this.scene = scene;
    // how many animations hold the loop
    this.repetitions = 0;
    this.requested = false;
    this.animate = () => this.scene.render();
  }

  request = () => {
    // the loop, while it runs, renders anyway
    if (this.repetitions > 0 || this.requested) {
      return;
    }
    this.requested = true;
    requestAnimationFrame(() => {
      this.requested = false;
      if (!this.scene.isDisposed) {
        this.scene.render();
      }
    });
  };

  run = (run = true) => {
    if (run) {
      if (this.repetitions === 0) {
        this.engine.runRenderLoop(this.animate);
      }
      this.repetitions += 1;
    } else {
      this.repetitions -= 1;
      if (this.repetitions === 0) {
        this.engine.stopRenderLoop(this.animate);
      }
    }
  };
}
