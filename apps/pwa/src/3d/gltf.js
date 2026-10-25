// The glTF 2.0 loader and the extensions that Blender exports (and dev/optimize-models.mjs) use.
// Babylon's registerBuiltInLoaders() also registered FBX, OBJ, STL, SPLAT, USD, BVH and every glTF
// extension, each as a chunk that the build emitted and the service worker precached (about 350
// files) although the game never loads them. A model that needs another extension fails to load
// with "Required extension … is not supported": add its module here.
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_ior.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_unlit.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform.js";
import "@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js";
