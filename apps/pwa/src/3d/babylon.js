// The parts of Babylon.js the game uses, imported module by module. Importing "@babylonjs/core"
// as a whole put all of Babylon (physics, node materials, flow graphs, audio, …) into the bundle,
// about 5 MB of JavaScript to download and parse. Import Babylon classes from here, and add a
// class here when a new one is needed.
//
// The ".js" extensions let node load this file too (test/unit/gamefield.test.js).
export { Engine } from "@babylonjs/core/Engines/engine.js";
export { Scene } from "@babylonjs/core/scene.js";
export { Camera } from "@babylonjs/core/Cameras/camera.js";
export { FlyCamera } from "@babylonjs/core/Cameras/flyCamera.js";
export { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
export { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
export { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
export { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
export { ColorCurves } from "@babylonjs/core/Materials/colorCurves.js";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
export { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
export { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
export { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture.js";
export { Mesh } from "@babylonjs/core/Meshes/mesh.js";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
export { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer.js";
export { Animation } from "@babylonjs/core/Animations/animation.js";
export { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
export { SolidParticleSystem } from "@babylonjs/core/Particles/solidParticleSystem.js";
export { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
export { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader.js";

import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { SceneLoaderFlags } from "@babylonjs/core/Loading/sceneLoaderFlags.js";

// the builders in use; Babylon's MeshBuilder brings all 25
export const MeshBuilder = { CreatePlane, CreateSphere, CreateTorus, CreateBox };

// What the barrel import used to register for us:
import "@babylonjs/core/Animations/animatable.js"; // scene.beginAnimation & co.
import "@babylonjs/core/Culling/ray.js"; // picking (the board clicks)
import "@babylonjs/core/Meshes/instancedMesh.js"; // mesh.createInstance
import "@babylonjs/core/Particles/particleSystemComponent.js"; // particle systems in a scene
import "@babylonjs/core/Engines/thinEngine.scissor.js"; // engine.enableScissor (the board preview)

// The game shows its own progress; Babylon's loading screen is not even bundled any more.
SceneLoaderFlags.ShowLoadingScreen = false;
