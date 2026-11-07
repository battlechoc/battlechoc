import { EntityType } from "@battlechoc/battlechoc-shared-functions";
import {
  ParticleSystem,
  Vector3,
  Color4,
  SolidParticleSystem,
  Texture,
  MeshBuilder,
} from "./babylon.js";
import { cellMeshes, departure } from "./cellMeshes.js";
import { OneShots } from "./oneShots.js";

// the opponent's weapons turn round to face the own board
const WEAPONS = [
  EntityType.RUM_TRUFFLE_CANNON,
  EntityType.FRUIT_CANNON,
  EntityType.SPYING_EASTER_BUNNY,
  EntityType.HOT_CHOCOLATE_BALLISTA,
];

// Only entities appearing, disappearing or changing type need other meshes; hp and the timers
// of real-time entities change constantly and are not shown by meshes.
const signature = (cell) =>
  `${cell.molten}/` +
  cell.occupiedBy.map((entity) => `${entity.id}:${entity.type}`).join("|");
const key = ({ phenotype, id }) => `${phenotype}|${id}`;

// One board in the scene: the instances of the models on its cells, kept in step with the
// board of the match view.
class Gamefield {
  constructor(
    isPlayerGameField,
    position,
    getPlayerField,
    fieldIdx,
    size,
    scene,
    action,
    setRenderLoop,
    // draws the scene once soon; the scene coalesces several requests into one frame
    requestRender = () => scene.render()
  ) {
    this.isPlayerGameField = isPlayerGameField;
    this.rows = size.rows;
    this.cols = size.cols;
    this.position = position;
    this.fieldIdx = fieldIdx;
    this.scene = scene;
    this.action = action;
    this.getPlayerField = () => getPlayerField();
    this.setRenderLoop = setRenderLoop;
    this.requestRender = requestRender;
    // explosions and melting cells on their way, and their timers
    this.effects = new OneShots();
    // per cell, the meshes it shows: { phenotype, id, meshes }
    this.cells = [];
    this.build();
  }

  // the name and id of the meshes of a model on a cell
  meshId(phenotype, cell) {
    return `${this.fieldIdx}.${phenotype}.${cell.row}.${cell.col}`;
  }

  build() {
    // the field as last drawn; views are never changed once made (Redux freezes them), so it
    // needs no copy
    this.playerField = this.getPlayerField();
    const grid = this.playerField.grid;
    this.cells = grid.map((cell) =>
      cellMeshes(cell, this.isPlayerGameField).map((wanted) =>
        this.place(wanted, cell, grid)
      )
    );
  }

  // Every cell that changed gets the meshes it should have now (cellMeshes): what is still
  // wanted stays, what is new appears, and what is no longer wanted leaves (departure).
  update() {
    const field = this.getPlayerField();
    field.grid.forEach((after, i) => {
      const before = this.playerField.grid[i];
      if (signature(after) !== signature(before)) {
        this.redraw(i, before, after, field.grid);
      }
    });
    this.playerField = field;
  }

  redraw(i, before, after, grid) {
    const wanted = cellMeshes(after, this.isPlayerGameField);
    const wantedKeys = new Set(wanted.map(key));
    const present = this.cells[i];
    const presentKeys = new Set(present.map(key));
    present
      .filter((entry) => !wantedKeys.has(key(entry)))
      .forEach((entry) => this.leave(entry, departure(entry, before, after)));
    this.cells[i] = [
      ...present.filter((entry) => wantedKeys.has(key(entry))),
      ...wanted
        .filter((entry) => !presentKeys.has(key(entry)))
        .map((entry) => this.place(entry, after, grid)),
    ];
  }

  leave({ meshes }, how) {
    if (how === "burst") {
      meshes.forEach((mesh) => this.explode(mesh));
    } else if (how === "later") {
      // until then the building stands where the cream was
      this.effects.later(
        () => meshes.forEach((mesh) => this.explode(mesh)),
        1000,
        () => meshes.forEach((mesh) => mesh.dispose())
      );
    } else if (how === "melt") {
      const [tile, ...rest] = meshes;
      rest.forEach((mesh) => mesh.dispose());
      this.animateHotChocolate(tile);
    } else {
      meshes.forEach((mesh) => mesh.dispose());
    }
  }

  // the instances of a model on a cell, one per part of its template
  place({ phenotype, id }, cell, grid) {
    const name = this.meshId(phenotype, cell);
    const root = this.scene.getMeshByName(phenotype + "__root__");
    const parts =
      root.getChildren()[0].getChildren().length > 0
        ? root.getChildren()[0].getChildren()
        : root.getChildren();
    const meshes = parts.map((part) => {
      const mesh = part.createInstance(name);
      // instances inherit the parent of their source since babylon 5, but the
      // templates live below a disabled root node
      mesh.parent = null;
      mesh.id = name;
      mesh.position = this.position.add(new Vector3(cell.row, 0, cell.col));
      if (part.material.name !== phenotype + ".Shield.material") {
        // the scene's one pointer handler (Scene.jsx) finds the cell of a picked mesh here
        mesh.metadata = { gamefield: this, row: cell.row, col: cell.col };
      } else {
        mesh.isPickable = false;
      }
      if (phenotype === EntityType.FACTORY_EXTENSION) {
        mesh.rotation.y = this.extensionTurn(cell, grid);
      } else if (!this.isPlayerGameField && WEAPONS.includes(phenotype)) {
        mesh.rotation.y = Math.PI;
      }
      return mesh;
    });
    return { phenotype, id, meshes };
  }

  // an extension's pipes reach into the factory's cell: right, above, below, else left
  extensionTurn(cell, grid) {
    const factoryAt = (row, col) =>
      grid[row * this.cols + col].occupiedBy.some(
        (entity) => entity.type === EntityType.FACTORY
      );
    const { row, col } = cell;
    if (factoryAt(row, Math.min(col + 1, this.cols - 1))) {
      return 0;
    } else if (factoryAt(Math.max(row - 1, 0), col)) {
      return -Math.PI / 2;
    } else if (factoryAt(Math.min(row + 1, this.rows - 1), col)) {
      return Math.PI / 2;
    }
    return Math.PI;
  }

  animateHotChocolate(field) {
    this.setRenderLoop();
    let fountain = MeshBuilder.CreateBox("foutain", { size: 1.0 }, this.scene);
    fountain.position.addInPlace(field.position);
    fountain.isVisible = false;
    if (this.isPlayerGameField) {
      fountain.position.addInPlace(new Vector3(-0.2, 4, -0.2));
    } else {
      fountain.position.addInPlace(new Vector3(0.2, 4, 0.2));
    }

    let particleSystem = new ParticleSystem("particles", 2000, this.scene);
    particleSystem.particleTexture = new Texture(
      "/images/raindrop.png",
      this.scene
    );

    particleSystem.emitter = fountain;
    particleSystem.minEmitBox = new Vector3(0, 0, 0);
    particleSystem.maxEmitBox = new Vector3(0.3, 0.3, 0.3);

    particleSystem.color1 = Color4.FromHexString("#824529FF");
    particleSystem.color2 = Color4.FromHexString("#3E211BFF");
    particleSystem.colorDead = new Color4(0, 0, 0, 0);

    particleSystem.minSize = 0.02;
    particleSystem.maxSize = 0.1;

    particleSystem.minLifeTime = 0.4;
    particleSystem.maxLifeTime = 1.5;

    particleSystem.emitRate = 1500;
    particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    particleSystem.gravity = new Vector3(0, 12 * -9.81, 0);

    particleSystem.direction1 = new Vector3(
      Math.random(),
      Math.random(),
      Math.random()
    );
    particleSystem.direction2 = new Vector3(
      Math.random(),
      Math.random(),
      Math.random()
    );

    particleSystem.minAngularSpeed = 0;
    particleSystem.maxAngularSpeed = Math.PI;

    particleSystem.minEmitPower = 1;
    particleSystem.maxEmitPower = 3;
    particleSystem.updateSpeed = 0.005;

    particleSystem.start();
    this.scene.beginAnimation(fountain, 0, 100, true);
    const disposeTile = () => field.dispose();
    this.effects.later(disposeTile, 1000, disposeTile);

    const end = this.effects.start(() => {
      this.scene.stopAnimation(fountain);
      this.setRenderLoop(false);
      particleSystem.dispose();
      fountain.dispose();
      this.requestRender();
    });
    this.effects.later(end, 3000);
  }

  // ends the explosions and melting cells on their way at once
  stopAllAnimations() {
    this.effects.stopAll();
  }

  // the board leaves the scene: its effects end, its meshes go
  dispose() {
    this.effects.stopAll();
    this.cells.forEach((entries) =>
      entries.forEach((entry) => entry.meshes.forEach((mesh) => mesh.dispose()))
    );
    this.cells = [];
  }

  explode(mesh) {
    // a mesh that is not there cannot explode; never let an animation take the match down
    if (!mesh || mesh.isDisposed()) {
      return;
    }
    // In units and seconds: the pieces burst up and out in every direction, tumble, fall back
    // and shrink away within the lifetime, at the same pace on a 60 and a 120 Hz screen.
    // (Per-frame steps with positive random speeds sent every explosion off to one side,
    // across half the screen.)
    const gravity = -18;
    const lifetime = 1.2;
    let age = 0;
    let delta = 0;
    let solidParticleSystem = new SolidParticleSystem(
      "solidParticleSystem",
      this.scene
    );
    solidParticleSystem.digest(mesh, { number: 32 });
    let particleMesh = solidParticleSystem.buildMesh();
    particleMesh.material = mesh.material;
    particleMesh.material.freeze();
    solidParticleSystem.refreshVisibleSize();

    solidParticleSystem.updateParticle = (particle) => {
      const velocity = particle.velocity;
      velocity.y += gravity * delta;
      particle.position.addInPlaceFromFloats(
        velocity.x * delta,
        velocity.y * delta,
        velocity.z * delta
      );
      particle.rotation.x += velocity.z * delta * 2;
      particle.rotation.z -= velocity.x * delta * 2;
      particle.scaling.setAll(Math.max(0, 1 - age / lifetime));
      return particle;
    };

    solidParticleSystem.initParticles = () => {
      for (
        let particle = 0;
        particle < solidParticleSystem.nbParticles;
        particle++
      ) {
        solidParticleSystem.particles[particle].rotation.addInPlace(
          mesh.rotation
        );
        solidParticleSystem.particles[particle].position.addInPlace(
          mesh.position
        );
      }
    };

    solidParticleSystem.computeParticleTexture = false;
    solidParticleSystem.computeParticleColor = false;

    solidParticleSystem.isAlwaysVisible = true;
    solidParticleSystem.initParticles();
    solidParticleSystem.setParticles();

    let setParticles = () => {
      // seconds since the last frame, capped so that the first frame after a pause does not jump
      delta = Math.min(this.scene.getEngine().getDeltaTime() / 1000, 0.05);
      age += delta;
      solidParticleSystem.setParticles();
    };

    this.setRenderLoop();
    for (
      let particle = 0;
      particle < solidParticleSystem.nbParticles;
      particle++
    ) {
      const angle = Math.random() * 2 * Math.PI;
      const speed = 1.5 + Math.random() * 2.5;
      solidParticleSystem.particles[particle].velocity.set(
        Math.cos(angle) * speed,
        3 + Math.random() * 4,
        Math.sin(angle) * speed
      );
    }
    this.scene.registerBeforeRender(setParticles);

    const end = this.effects.start(() => {
      this.scene.unregisterBeforeRender(setParticles);
      solidParticleSystem.dispose();
      solidParticleSystem = null;
      this.setRenderLoop(false);
    });
    this.effects.later(end, lifetime * 1000 + 100);
    mesh.dispose();
  }
}

export default Gamefield;
