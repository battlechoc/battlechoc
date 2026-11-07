import { useImperativeHandle } from "react";
import { connect } from "react-redux";
import { assetsReady, assetsProgressed, assetsFailedChanged } from "./ui/uiSlice";
import {
  EntityType,
  BoardCellTypes,
} from "@battlechoc/battlechoc-shared-functions";
import {
  ImportMeshAsync,
  StandardMaterial,
  Color3,
  Engine,
} from "./3d/babylon";
import "./3d/gltf";
import { cellMaterial } from "./3d/look";
import { fontsLoaded, registerAssetRetry } from "./firstLoad";

class AssetLoader {
  constructor() {
    this.assets = {
      models: {
        [BoardCellTypes.WHITE]: "field.glb",
        [BoardCellTypes.BROWN]: "field.glb",
        [BoardCellTypes.BLACK]: "field.glb",
        [EntityType.FACTORY]: "factory.glb",
        [EntityType.FACTORY_EXTENSION]: "factoryExtension.glb",
        [EntityType.CACAOTREE]: "cacaotree.glb",
        [EntityType.RUM_TRUFFLE_CANNON]: "cannon.glb",
        [EntityType.CREAM]: "cream.glb",
        [EntityType.CREAM + ".AROUND.BUILDING"]: "creamAroundBuilding.glb",
        [EntityType.SPYING_EASTER_BUNNY]: "spyingEasterBunny.glb",
        [EntityType.XMAS_FACTORY]: "xmasFactory.glb",
        [EntityType.HOT_CHOCOLATE_BALLISTA]: "hotChocolateBallista.glb",
        [EntityType.CHOCOLATE_FOUNTAIN]: "chocolateFountain.glb",
        [EntityType.FRUIT_CANNON]: "fruitCannon.glb",
        [EntityType.DONUT_FACTORY]: "donutFactory.glb",
        // the trap donuts share one model, DONUT_COLORS paints them
        [EntityType.DONUT_PORTAL_RED]: "donut.glb",
        [EntityType.DONUT_PORTAL_BLUE]: "donut.glb",
        [EntityType.DONUT_SURPRISE_YELLOW]: "donut.glb",
        [EntityType.DONUT_STOP_PINK]: "donut.glb",
        [EntityType.DONUT_CREAM_WHITE]: "donut.glb",
        [EntityType.DONUT_HEALTH_GREEN]: "donut.glb",
      },
      // the interface's pictures, warmed after the models (warmImages below). The progress
      // donuts are not here: the scene loads them itself for the indicators above the units.
      images: [
        "add-icon.svg",
        "dialog-border-left.svg",
        "info-icon.svg",
        "raindrop.png",
        "apple-share-icon.svg",
        "dialog-border-right.svg",
        "info.svg",
        "refresh.svg",
        "arrow-down.svg",
        "dialog-border-top.svg",
        "instagram.svg",
        "score.svg",
        "done.svg",
        "search.svg",
        "back.svg",
        "donut-factory-icon.svg",
        "lab.svg",
        "secondary-close.svg",
        "backward-accent.svg",
        "send.svg",
        "backward.svg",
        "level.svg",
        "settings.svg",
        "ballista-icon.svg",
        "donuts-enabled.svg",
        "lock.svg",
        "share.svg",
        "battlechoc_notification_icon.png",
        "dropdown.svg",
        "logo.svg",
        "buildings-icon.svg",
        "easter-bunny-icon.svg",
        "lost.svg",
        "stop-donut-icon.svg",
        "error-icon.svg",
        "mute.svg",
        "stripes.svg",
        "facebook.svg",
        "pen.svg",
        "success-icon.svg",
        "cacao-icon.svg",
        "factory-extension-icon.svg",
        "phone-rotation.svg",
        "surprise-donut-icon.svg",
        "cacao-tree-icon.svg",
        "factory-icon.svg",
        "portal-donut-icon.svg",
        "cacao.svg",
        "fast-backward.svg",
        "primary-close.svg",
        "fast-forward.svg",
        "trophy.svg",
        "truffle-cannon-icon.svg",
        "choclab-decoration-left.svg",
        "forward.svg",
        "forward-accent.svg",
        "user.svg",
        "choclab-decoration-right.svg",
        "fountain-icon.svg",
        "volume.svg",
        "close.svg",
        "fruit-cannon-icon.svg",
        "warning-close.svg",
        "coins.svg",
        "fullscreen.svg",
        "warning-icon.svg",
        "cream-donut-icon.svg",
        "gears.svg",
        "win.svg",
        "cream-icon.svg",
        "header.svg",
        "xmas-factory-icon.svg",
        "cream.svg",
        "health-donut-icon.svg",
        "decoration.svg",
        "highscore.svg",
        "bunny-caught.svg",
        "fit-board.svg",
        "offline.svg",
        "tap-finger.svg",
      ],
    };
  }
}

const assetLoader = new AssetLoader();

// The colours of the trap donuts by material of donut.glb (linear RGB, as Blender exported them
// when every donut had its own file): "Topping" is the glaze, "Material.002" the sprinkles.
const DONUT_COLORS = {
  [EntityType.DONUT_PORTAL_RED]: {
    Topping: [0.8, 0.1208, 0.1208],
    "Material.002": [0.8, 0, 0.0104],
  },
  [EntityType.DONUT_PORTAL_BLUE]: {
    Topping: [0.3728, 0.6569, 0.8],
    "Material.002": [0.0351, 0.0017, 0.8],
  },
  [EntityType.DONUT_SURPRISE_YELLOW]: {
    Topping: [0.9221, 1, 0],
    "Material.002": [0.3863, 0.393, 0.1622],
  },
  [EntityType.DONUT_STOP_PINK]: {
    Topping: [1, 0.0805, 0.3398],
    "Material.002": [0.5813, 0, 0.1205],
  },
  [EntityType.DONUT_CREAM_WHITE]: {
    Topping: [0.8253, 0.9711, 1],
    "Material.002": [0.5641, 0.5813, 0.5813],
  },
  [EntityType.DONUT_HEALTH_GREEN]: {
    Topping: [0.1078, 1, 0.0488],
    "Material.002": [0.0177, 0.5813, 0.0781],
  },
};

const CELL_COLORS = {
  [BoardCellTypes.BROWN]: "#824529",
  [BoardCellTypes.BLACK]: "#3E211B",
  [BoardCellTypes.WHITE]: "#F8DBAF",
};

// another template from an already loaded file; the copies share the geometry
const copyModel = (root) => {
  const copy = root.clone("__root__", null);
  return [copy, ...copy.getChildMeshes(false)];
};

// turns the meshes of a model into the disabled template "<key>__root__" that Gamefield instances
const prepareModel = (key, group, scene) => {
  group.forEach((mesh, i) => {
    if (
      Object.values(BoardCellTypes).includes(key) &&
      mesh.name !== "__root__"
    ) {
      mesh.material = cellMaterial(key + ".material", CELL_COLORS[key], scene);
    }
    const colors = DONUT_COLORS[key];
    if (colors && mesh.material && colors[mesh.material.name]) {
      const color = colors[mesh.material.name];
      mesh.material = mesh.material.clone(key + "." + mesh.material.name);
      mesh.material.albedoColor = Color3.FromArray(color);
    }
    mesh.name = key + (mesh.name === "__root__" ? "__root__" : i);
    mesh.setEnabled(false);
    if (key === EntityType.CHOCOLATE_FOUNTAIN && mesh.material !== null) {
      if (mesh.material.name === "Shield") {
        let shieldMaterial = new StandardMaterial(
          key + ".Shield.material",
          scene
        );
        shieldMaterial.diffuseColor = Color3.FromHexString("#DE8731");
        shieldMaterial.alpha = 0.5;
        shieldMaterial.alphaMode = Engine.ALPHA_COMBINE;
        mesh.material = shieldMaterial;
        mesh.visibility = 0.6;
      }
    }
  });
};

// a model that does not arrive is asked for again after these pauses, then the start button offers
// another try (retryAssets in src/firstLoad.js)
const MODEL_RETRY_DELAYS_MS = [1000, 2500];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PROGRESS_INTERVAL_MS = 50;

// The interface's pictures are not waited for: a screen fetches what it shows (CSS backgrounds,
// the scene's floating infos). Once the models are in, each is still fetched once, a few at a
// time and at low priority, into the browser's cache: a match started right away finds its icons
// there, also on a device that goes offline before the service worker has stored the game. With
// a service worker in charge they are stored already. (Until 2026-11 they held the start button
// back: 92 requests next to the models, each followed by a second one for an Image nobody kept.)
const WARMED_AT_ONCE = 4;
const warmImages = (images) => {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    return;
  }
  const queue = [...images];
  const next = () => {
    const image = queue.shift();
    if (typeof image === "undefined") {
      return;
    }
    fetch("/images/" + image, { priority: "low" })
      .then((response) => response.arrayBuffer())
      // a missing picture shows as an empty icon
      .catch(() => undefined)
      .then(next);
  };
  for (let i = 0; i < WARMED_AT_ONCE; i++) {
    next();
  }
};

// The loading of the first start, once per page: the 3D models (the templates Gamefield
// instances) and the fonts; the interface's pictures follow (warmImages). The title screen does
// not wait for it; the start button shows its progress (state.ui.assetsProgress) and starts the
// game once state.ui.assetsReady.
const loading = {
  scene: null,
  callbacks: null,
  total: 0,
  done: 0,
  failed: new Map(),
  flushTimer: null,
  readySent: false,

  start(scene, callbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    const { models } = assetLoader.assets;
    this.total = Object.keys(models).length + 1;
    this.done = 0;
    // one request per file: the board cells and the trap donuts share theirs
    for (const file of new Set(Object.values(models))) {
      this.loadModel(file);
    }
    // the fonts are asked for at the start of the page (src/firstLoad.js, the menu waits for them)
    fontsLoaded().then(() => this.count(1));
  },

  async loadModel(file) {
    const { models } = assetLoader.assets;
    const keys = Object.keys(models).filter((key) => models[key] === file);
    for (let attempt = 0; ; attempt++) {
      try {
        const { meshes } = await ImportMeshAsync("/models/" + file, this.scene);
        // copy before the first template gets its names and materials
        const groups = keys.map((key, i) => (i === 0 ? meshes : copyModel(meshes[0])));
        keys.forEach((key, i) => prepareModel(key, groups[i], this.scene));
        this.failed.delete(file);
        this.count(keys.length);
        return;
      } catch (error) {
        if (attempt >= MODEL_RETRY_DELAYS_MS.length) {
          console.error("could not load", file, error);
          this.failed.set(file, true);
          this.callbacks.failed(true);
          return;
        }
        await wait(MODEL_RETRY_DELAYS_MS[attempt]);
      }
    }
  },

  // the start button's "try again": the models that did not arrive
  retry() {
    if (this.scene === null || this.failed.size === 0) {
      return;
    }
    this.callbacks.failed(false);
    for (const file of [...this.failed.keys()]) {
      this.loadModel(file);
    }
  },

  // At most one store update per PROGRESS_INTERVAL_MS: dozens of files arriving at once (the dev
  // server answers from memory) re-rendered the app dozens of times in a row, and React stopped
  // with "Maximum update depth exceeded" (dev.spec.js, 2026-11-05).
  count(amount) {
    this.done += amount;
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.done >= this.total) {
        if (!this.readySent) {
          this.readySent = true;
          this.callbacks.ready();
          warmImages(assetLoader.assets.images);
        }
      } else {
        this.callbacks.progress(Math.round((this.done / this.total) * 100));
      }
    }, PROGRESS_INTERVAL_MS);
  },
};

// the start button's "try again" after a 3D model did not load (the title screen calls it
// through src/firstLoad.js: it is there before this file has arrived)
registerAssetRetry(() => loading.retry());

// starts the loading with the scene (Scene.jsx); shows nothing itself, the start button does
const AssetLoadingView = (props) => {
  const { customRef } = props;
  useImperativeHandle(customRef, () => ({
    loadAssets(scene) {
      loading.start(scene, {
        progress: (value) => props.assetsProgressed(value),
        failed: (value) => props.assetsFailedChanged(value),
        // the progress at 100 and no failure
        ready: () => props.assetsReady(),
      });
    },
  }));
  return null;
};

const mapStateToProps = () => ({});
const mapDispatchToProps = { assetsReady, assetsProgressed, assetsFailedChanged };
const AssetLoadingViewContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(AssetLoadingView);
export { assetLoader, AssetLoadingViewContainer };
