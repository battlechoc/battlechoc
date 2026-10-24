// The light of the 3D scenes (match board, lab preview, dev/lookdev) and the material fixes that
// go with it, in one place so that all of them look the same.
//
// Image-based light from a CC0 sky (Poly Haven's "Kloofendal 48d Partly Cloudy (Pure Sky)", in
// public/textures/sky.env, made from its 1k .hdr with Babylon's CreateEnvTextureAsync: 256 px,
// WebP faces, 92 KB), a warm fill with a chocolate ground colour and a sun for the shape, tone
// mapped with Khronos PBR Neutral, which keeps the base colours and only rolls off highlights.
// (Chosen 2026-10 over the old light, a 0.1 fill that left the shadow sides almost black.)
import {
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
  CubeTexture,
  ImageProcessingConfiguration,
  PBRMaterial,
} from "./babylon";
import { requestedLight } from "../testHooks";

// Dev server and test builds can try other values in the URL: ?env=0.7&fill=0.2&sun=0.8&exposure=1
const LIGHT = { env: 0.8, fill: 0.2, sun: 0.75, exposure: 0.95 };

export const lightSettings = () => ({ ...LIGHT, ...requestedLight });

export const applyLook = (scene) => {
  const light = lightSettings();
  const processing = scene.imageProcessingConfiguration;
  processing.toneMappingEnabled = true;
  processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  processing.exposure = light.exposure;
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData("/textures/sky.env", scene);
  scene.environmentIntensity = light.env;
  const fill = new HemisphericLight("light", new Vector3(40, 44, 1), scene);
  fill.diffuse = new Color3(1.0, 0.97, 0.93);
  // light bouncing off the chocolate board onto the undersides
  fill.groundColor = Color3.FromHexString("#6B4632");
  fill.intensity = light.fill;
  const sun = new DirectionalLight("spot", new Vector3(0, -1, -1), scene);
  sun.position = new Vector3(35, 35, 35);
  sun.intensity = light.sun;
};

// A board cell's material: PBR like the models, so that the cells get the sky's light too
export const cellMaterial = (name, hex, scene) => {
  const material = new PBRMaterial(name, scene);
  // hex colours are sRGB, PBR albedo is linear
  material.albedoColor = Color3.FromHexString(hex).toLinearSpace();
  material.metallic = 0;
  material.roughness = 0.75;
  return material;
};
