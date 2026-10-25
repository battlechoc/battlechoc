// Lookdev: every in-game model on a board tile, under the game's camera and lights, so models
// can be compared after a Blender export without playing a match. Dev server only:
//   npm run dev  →  http://localhost:3000/dev/lookdev/
// Query parameters (all optional):
//   models=factory.glb,cannon.glb   which models (default: all that the game loads)
//   base=/models/                   where they come from (e.g. a folder of optimized exports)
//   env=0.8&fill=0.2&sun=0.75&exposure=0.9&saturation=-20&tonemap=neutral   tune the light of
//                                   src/3d/look.js
//   cols=5                          tiles per row
//   gap=1.6                         distance between the tiles (1 = the board)
// window.lookdevReady turns true once everything is drawn (for screenshots).
import {
  Engine,
  Scene,
  FlyCamera,
  Camera,
  Vector3,
  Color3,
  Color4,
  StandardMaterial,
  ImportMeshAsync,
} from "../../src/3d/babylon";
import "../../src/3d/gltf";
import { applyLook, cellMaterial, lightSettings } from "../../src/3d/look";


const GAME_MODELS = [
  "factory.glb",
  "factoryExtension.glb",
  "cacaotree.glb",
  "cannon.glb",
  "fruitCannon.glb",
  "hotChocolateBallista.glb",
  "spyingEasterBunny.glb",
  "chocolateFountain.glb",
  "xmasFactory.glb",
  "donutFactory.glb",
  "cream.glb",
  "creamAroundBuilding.glb",
  "donut.glb",
];
const FIELD_COLORS = ["#824529", "#F8DBAF", "#3E211B"];

const params = new URLSearchParams(location.search);
const models = params.has("models") ? params.get("models").split(",") : GAME_MODELS;
const base = params.get("base") || "/models/";
const cols = Number(params.get("cols") || 5);
const gap = Number(params.get("gap") || 1.6);

const canvas = document.getElementById("canvas");
const engine = new Engine(canvas, true, { stencil: true }, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 0);

const rows = Math.ceil(models.length / cols);
// aimed at the middle of the models, which stand about 0.2 to 1.5 above the tile's centre
const center = new Vector3(((rows - 1) * gap) / 2, 0.6, ((cols - 1) * gap) / 2);
const camera = new FlyCamera("camera", center.add(new Vector3(30, 30, 30)), scene);
camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
camera.minZ = 0;
camera.maxZ = 100;
camera.setTarget(center);
const fit = () => {
  const ratio = canvas.clientWidth / canvas.clientHeight;
  const half = Math.max(rows, cols) * gap * 0.7 + 0.3;
  camera.orthoTop = half / Math.min(ratio, 1.6);
  camera.orthoBottom = -camera.orthoTop;
  camera.orthoLeft = camera.orthoBottom * ratio;
  camera.orthoRight = camera.orthoTop * ratio;
};
fit();

applyLook(scene);

// the fountain's shield as src/AssetLoader.jsx replaces it
const shield = new StandardMaterial("shield", scene);
shield.diffuseColor = Color3.FromHexString("#DE8731");
shield.alpha = 0.5;
shield.alphaMode = Engine.ALPHA_COMBINE;

const fieldMaterials = FIELD_COLORS.map((hex, i) => cellMaterial("field" + i, hex, scene));

// templates below a disabled root, instances without a parent: the way src/3d/Gamefield.js
// places them (it ignores the transforms of the exported nodes)
const place = (meshes, row, col, material) => {
  const root = meshes.find((mesh) => mesh.name === "__root__");
  const first = root.getChildren()[0];
  const children = first.getChildren().length > 0 ? first.getChildren() : root.getChildren();
  meshes.forEach((mesh) => mesh.setEnabled(false));
  children
    .filter((child) => child.getTotalVertices && child.getTotalVertices() > 0)
    .forEach((child) => {
      const isShield = child.material && child.material.name === "Shield";
      if (material) {
        child.material = material;
      } else if (isShield) {
        child.material = shield;
      }
      const instance = child.createInstance(child.name + "." + row + "." + col);
      instance.parent = null;
      instance.position = new Vector3(row * gap, 0, col * gap);
      if (isShield) {
        instance.visibility = 0.6;
      }
    });
};

const loads = models.map((file, i) => {
  const row = Math.floor(i / cols);
  const col = i % cols;
  return Promise.all([
    ImportMeshAsync("/models/field.glb", scene).then(({ meshes }) =>
      place(meshes, row, col, fieldMaterials[(row + col) % 3])
    ),
    ImportMeshAsync(base + file, scene).then(({ meshes }) => place(meshes, row, col)),
  ]).catch((error) => console.error(file, error));
});

document.getElementById("legend").textContent =
  models.map((file, i) => `${Math.floor(i / cols)},${i % cols} ${file}`).join("\n") +
  `\n${Object.entries(lightSettings())
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ")} · ${base}`;

Promise.all(loads).then(() =>
  scene.executeWhenReady(() => {
    scene.render();
    window.lookdevReady = true;
  })
);
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => {
  fit();
  engine.resize();
});
