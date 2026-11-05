import { useImperativeHandle } from "react";
import { connect } from "react-redux";
import { assetsReady, loadUiState } from "./ui/UiActions";
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
        "progress-10.svg",
        "trophy.svg",
        "progress-100.svg",
        "truffle-cannon-icon.svg",
        "choclab-decoration-left.svg",
        "forward.svg",
        "forward-accent.svg",
        "progress-20.svg",
        "user.svg",
        "choclab-decoration-right.svg",
        "fountain-icon.svg",
        "progress-30.svg",
        "volume.svg",
        "close.svg",
        "fruit-cannon-icon.svg",
        "progress-40.svg",
        "warning-close.svg",
        "coins.svg",
        "fullscreen.svg",
        "progress-50.svg",
        "warning-icon.svg",
        "cream-donut-icon.svg",
        "gears.svg",
        "progress-60.svg",
        "win.svg",
        "cream-icon.svg",
        "header.svg",
        "progress-70.svg",
        "xmas-factory-icon.svg",
        "cream.svg",
        "health-donut-icon.svg",
        "progress-80.svg",
        "decoration.svg",
        "highscore.svg",
        "progress-90.svg",
        "attacks-per-turn.svg",
        "buildings-per-turn.svg",
        "bunny-caught.svg",
        "cacao-per-turn.svg",
        "fruit-attacks-per-turn.svg",
        "spy-attacks-per-turn.svg",
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

// the menu also waits for the fonts (src/index.css), but never longer than FONT_TIMEOUT:
// a font that does not load must not keep the game from starting
const FONTS = ["1em Bangers", "1em Montserrat"];
const FONT_TIMEOUT = 5000;
const loadFonts = () =>
  Promise.race([
    document.fonts
      ? Promise.all(FONTS.map((font) => document.fonts.load(font)))
      : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT)),
  ]).catch(() => undefined);

// a model that does not arrive is asked for again after these pauses, then the start button offers
// another try (retryAssets)
const MODEL_RETRY_DELAYS_MS = [1000, 2500];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", src);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        new Image().src = src;
        resolve(xhr.response);
      } else {
        reject({ status: xhr.status, statusText: xhr.statusText });
      }
    };
    xhr.onerror = () => reject({ status: xhr.status, statusText: xhr.statusText });
    xhr.send();
  });

// The loading of the first start, once per page: the 3D models (the templates Gamefield
// instances), the interface pictures and the fonts. The title screen does not wait for it; the
// start button shows its progress (state.ui.assetsProgress) and starts the game once
// state.ui.assetsReady.
const loading = {
  scene: null,
  callbacks: null,
  total: 0,
  done: 0,
  failed: new Map(),

  start(scene, callbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    const { models, images } = assetLoader.assets;
    this.total = Object.keys(models).length + images.length + 1;
    this.done = 0;
    // one request per file: the board cells and the trap donuts share theirs
    for (const file of new Set(Object.values(models))) {
      this.loadModel(file);
    }
    loadFonts().then(() => {
      this.callbacks.fontsReady();
      this.count(1);
    });
    for (const image of images) {
      // a missing picture shows as an empty icon; it must not keep the game from starting
      loadImage("/images/" + image)
        .catch((error) => console.warn("could not load", image, error))
        .then(() => this.count(1));
    }
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

  count(amount) {
    this.done += amount;
    if (this.done >= this.total) {
      this.callbacks.ready();
    } else {
      this.callbacks.progress(Math.round((this.done / this.total) * 100));
    }
  },
};

/** The start button's "try again" after a 3D model did not load. */
export const retryAssets = () => loading.retry();

// starts the loading with the scene (Scene.jsx); shows nothing itself, the start button does
const AssetLoadingView = (props) => {
  const { customRef } = props;
  useImperativeHandle(customRef, () => ({
    loadAssets(scene) {
      loading.start(scene, {
        fontsReady: () => props.loadUiState({ fontsReady: true }),
        progress: (value) => props.loadUiState({ assetsProgress: value }),
        failed: (value) => props.loadUiState({ assetsFailed: value }),
        ready: () => {
          props.loadUiState({ assetsProgress: 100, assetsFailed: false });
          props.assetsReady();
        },
      });
    },
  }));
  return null;
};

const mapStateToProps = () => ({});
const mapDispatchToProps = { assetsReady, loadUiState };
const AssetLoadingViewContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(AssetLoadingView);
export { assetLoader, AssetLoadingViewContainer };
