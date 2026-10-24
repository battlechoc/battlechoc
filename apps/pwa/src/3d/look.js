// The light of the 3D scenes (match board, lab preview, dev/lookdev) and the material fixes that
// go with it, in one place so that all of them look the same.
//
// Three looks to compare (2026-10): "classic" (the old light: a 0.1 fill, so shadow sides are
// almost black), "bright" (a stronger warm fill and tone mapping) and "sky" (image-based light
// from a CC0 sky, Poly Haven's "Kloofendal 48d Partly Cloudy (Pure Sky)", in
// public/textures/sky.env, made from its 1k .hdr with Babylon's CreateEnvTextureAsync: 256 px,
// WebP faces, 92 KB). Dev server and test builds pick one with ?look=<name>.
import {
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
  CubeTexture,
  ImageProcessingConfiguration,
  PBRMaterial,
  StandardMaterial,
} from "./babylon";
import { requestedLook } from "../testHooks";

export const LOOKS = ["classic", "bright", "sky"];
export const DEFAULT_LOOK = "classic";

export const currentLook = () => (LOOKS.includes(requestedLook) ? requestedLook : DEFAULT_LOOK);

export const applyLook = (scene, look = currentLook()) => {
  const fill = new HemisphericLight("light", new Vector3(40, 44, 1), scene);
  fill.diffuse = new Color3(1.0, 0.97, 0.93);
  const sun = new DirectionalLight("spot", new Vector3(0, -1, -1), scene);
  sun.position = new Vector3(35, 35, 35);
  if (look === "classic") {
    fill.intensity = 0.1;
    sun.intensity = 1;
    return;
  }
  // tone mapping that keeps the base colours (Khronos PBR Neutral) and only rolls off highlights
  const processing = scene.imageProcessingConfiguration;
  processing.toneMappingEnabled = true;
  processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  // light bouncing off the chocolate board onto the undersides
  fill.groundColor = Color3.FromHexString("#6B4632");
  if (look === "bright") {
    fill.intensity = 0.7;
    sun.intensity = 1.0;
  } else {
    scene.environmentTexture = CubeTexture.CreateFromPrefilteredData("/textures/sky.env", scene);
    scene.environmentIntensity = 1.0;
    fill.intensity = 0.25;
    sun.intensity = 0.9;
  }
};

// A board cell's material. In the sky look a PBR material, so that the cells get the sky's light
// like the models do (a standard material only sees the two lights).
export const cellMaterial = (name, hex, scene, look = currentLook()) => {
  if (look === "sky") {
    const material = new PBRMaterial(name, scene);
    // hex colours are sRGB, PBR albedo is linear
    material.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    material.metallic = 0;
    material.roughness = 0.75;
    return material;
  }
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  return material;
};

// The scenes have no environment map in the classic look, so a metallic surface would only mirror
// black (the donut factory's bucket came out black, silver in its icon): every model renders as a
// non-metal. White emission stood in for light on cream, snow and the bunny under the dark
// classic fill; the brighter looks keep a little of it (bright) or none (sky, whose light is
// enough), and all of the coloured emission (windows, fairy lights).
const prepared = new WeakSet();
export const prepareMaterials = (meshes, look = currentLook()) =>
  meshes.forEach((mesh) => {
    const material = mesh.material;
    // materials can be shared between templates: only once each
    if (!material || typeof material.metallic !== "number" || prepared.has(material)) {
      return;
    }
    prepared.add(material);
    material.metallic = 0;
    const { r, g, b } = material.emissiveColor;
    const max = Math.max(r, g, b);
    if (look !== "classic" && max > 0 && (max - Math.min(r, g, b)) / max < 0.05) {
      material.emissiveColor = look === "bright" ? material.emissiveColor.scale(0.35) : Color3.Black();
    }
  });
