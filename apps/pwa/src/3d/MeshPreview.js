import React, { useRef, useEffect, useCallback } from "react";
import {
  Scene as BabylonScene,
  SceneLoader,
  HemisphericLight,
  Engine,
  FlyCamera,
  Vector3,
  Color3,
  Color4,
  Camera,
  StandardMaterial,
} from "babylonjs";
import { assetLoader } from "../AssetLoader";
import {
  BoardCellTypes,
  EntityType,
} from "@battlechoc/battlechoc-shared-functions";
import "babylonjs-loaders";

const MeshPreview = (props) => {
  const { selectedEntity } = props;
  const engine = useRef();
  const camera = useRef();
  const scene = useRef();
  const container = useRef();
  const preview = useRef();

  const rotate = useCallback(() => {
    preview.current.forEach((mesh) => (mesh.rotation.y += 0.01));
  }, []);

  const estimateOrthographicSize = (camera) => {
    const width = container.current.clientWidth;
    const height = container.current.clientHeight;
    const ratio = width / height;
    const distance = 1.5;

    camera.orthoTop = distance;
    camera.orthoBottom = -distance;
    camera.orthoLeft = -distance * ratio;
    camera.orthoRight = distance * ratio;
  };

  useEffect(() => {
    engine.current = new Engine(container.current, true);

    const createScene = () => {
      const scene = new BabylonScene(engine.current);
      new HemisphericLight("light", new Vector3(0, 1, 0), scene);
      scene.clearColor = new Color4(0, 0, 0, 0);
      camera.current = new FlyCamera("camera", new Vector3(30, 30, 30), scene);
      camera.current.mode = Camera.ORTHOGRAPHIC_CAMERA;
      camera.current.minZ = 0;
      camera.current.maxZ = 100;

      estimateOrthographicSize(camera.current);
      camera.current.setTarget(Vector3.Zero());
      return scene;
    };

    scene.current = createScene();
    engine.current.runRenderLoop(() => {
      scene.current.render();
    });

    SceneLoader.ImportMesh(
      "",
      "models/",
      assetLoader.assets.models[BoardCellTypes.BROWN],
      scene.current,
      (group) => {
        const material = new StandardMaterial(
          "brown.field.material",
          scene.current
        );
        material.diffuseColor = Color3.FromHexString("#824529");
        material.sideOrientation = 0;
        group[1].material = material;
        group[1].scaling = new Vector3(1.5, 1, 1.5);
      }
    );

    const resize = () => {
      estimateOrthographicSize(camera.current);
      engine.current.resize();
      scene.current.render();
    };

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    SceneLoader.ImportMesh(
      "",
      "models/",
      assetLoader.assets.models[selectedEntity.type],
      scene.current,
      (group) => {
        if (typeof preview.current !== "undefined") {
          scene.current.unregisterBeforeRender(rotate);
          preview.current.forEach((mesh) => mesh.dispose());
        }

        preview.current = group;
        preview.current[0].getChildren().forEach((mesh) => {
          mesh.scaling = new Vector3(1, 1, 1);
        });

        if (selectedEntity.type === EntityType.CHOCOLATE_FOUNTAIN) {
          preview.current.forEach((mesh) => {
            if (mesh.material) {
              if (mesh.material.name === "Shield") {
                mesh.visibility = 0;
              }
            }
          });
        }

        scene.current.registerBeforeRender(rotate);
      }
    );
  }, [selectedEntity, rotate]);

  return <canvas ref={container} />;
};

export default MeshPreview;
