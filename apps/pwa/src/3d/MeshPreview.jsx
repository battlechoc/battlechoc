import React, { useRef, useEffect, useCallback } from "react";
import {
  Scene as BabylonScene,
  ImportMeshAsync,
  Engine,
  FlyCamera,
  Vector3,
  Color4,
  Camera,
  TransformNode,
} from "./babylon";
import { assetLoader } from "../AssetLoader";
import { applyLook, cellMaterial } from "./look";
import {
  BoardCellTypes,
  EntityType,
} from "@battlechoc/battlechoc-shared-functions";

const MeshPreview = (props) => {
  const { selectedEntity } = props;
  const engine = useRef();
  const camera = useRef();
  const scene = useRef();
  const container = useRef();
  const preview = useRef();
  // the building turns around this node, which sits under the model's centre
  const pivot = useRef();

  // 0.6 rad per second, whatever the display's frame rate
  const rotate = useCallback(() => {
    pivot.current.rotation.y += 0.0006 * engine.current.getDeltaTime();
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
    // sharp on high-density screens, but never more than twice the CSS pixels
    engine.current = new Engine(container.current, true, { limitDeviceRatio: 2 }, true);

    const createScene = () => {
      const scene = new BabylonScene(engine.current);
      // the game's light, so that the building looks the same in the lab and on the board
      applyLook(scene);
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

    ImportMeshAsync(
      "models/" + assetLoader.assets.models[BoardCellTypes.BROWN],
      scene.current
    )
      .then(({ meshes: group }) => {
        if (scene.current.isDisposed) {
          return;
        }
        const material = cellMaterial("brown.field.material", "#824529", scene.current);
        material.sideOrientation = 0;
        group[1].material = material;
        group[1].scaling = new Vector3(1.5, 1, 1.5);
      })
      .catch((error) => console.error(error));

    const resize = () => {
      estimateOrthographicSize(camera.current);
      engine.current.resize();
      scene.current.render();
    };

    window.addEventListener("resize", resize);
    // the canvas also changes size with the layout around it (e.g. the lab's flexible stage)
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(resize);
    if (observer && container.current) {
      observer.observe(container.current);
    }
    return () => {
      window.removeEventListener("resize", resize);
      if (observer) {
        observer.disconnect();
      }
      // without this the render loop kept turning the building after the lab closed, and
      // every visit left a WebGL context behind
      engine.current.dispose();
    };
  }, []);

  useEffect(() => {
    ImportMeshAsync(
      "models/" + assetLoader.assets.models[selectedEntity.type],
      scene.current
    )
      .then(({ meshes: group }) => {
        if (scene.current.isDisposed) {
          return;
        }
        if (typeof preview.current !== "undefined") {
          scene.current.unregisterBeforeRender(rotate);
          pivot.current.dispose();
        }

        preview.current = group;
        preview.current[0].getChildren().forEach((mesh) => {
          mesh.scaling = new Vector3(1, 1, 1);
        });

        // Turning every mesh of the model around its own origin made the building wobble (and
        // the glTF root ignores rotation.y, it has a rotationQuaternion): one pivot turns the
        // whole model around the vertical axis through its centre.
        const root = group[0];
        // (the fountain's shield is hidden below, so it does not count)
        const { min, max } = root.getHierarchyBoundingVectors(
          true,
          (mesh) => !(mesh.material && mesh.material.name === "Shield")
        );
        pivot.current = new TransformNode("preview.pivot", scene.current);
        root.parent = pivot.current;
        root.position.x -= (min.x + max.x) / 2;
        root.position.z -= (min.z + max.z) / 2;

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
      })
      .catch((error) => console.error(error));
  }, [selectedEntity, rotate]);

  return <canvas ref={container} />;
};

export default MeshPreview;
