// The floating infos over the boards (+cacao, -cacao, +1 building, +1 shot, a caught bunny, a
// trap that went off): a picture with a number that rises and fades.
import {
  AttackType,
  EntityType,
} from "@battlechoc/battlechoc-shared-functions";
import {
  DynamicTexture,
  StandardMaterial,
  MeshBuilder,
  Mesh,
  Vector3,
  Animation,
} from "./babylon.js";
import { InfoType } from "./InfoType.js";

// a floating info rises and fades over this many frames (at 60 a second)
const POP_FRAMES = 120;

// the palette icon of the weapon that has a shot ready
const SHOT_ICONS = {
  [AttackType.TRUFFLE]: "truffle-cannon-icon",
  [AttackType.FRUIT]: "fruit-cannon-icon",
  [AttackType.BUNNY]: "easter-bunny-icon",
  [AttackType.HOT_CHOCOLATE]: "ballista-icon",
};
// the icon of the donut that went off (the pink stop donut unless another one)
const DONUT_ICONS = {
  [EntityType.DONUT_PORTAL_BLUE]: "portal-donut-icon",
  [EntityType.DONUT_HEALTH_GREEN]: "health-donut-icon",
  [EntityType.DONUT_CREAM_WHITE]: "cream-donut-icon",
  [EntityType.DONUT_SURPRISE_YELLOW]: "surprise-donut-icon",
};

// What each kind of info shows: its picture, the colour of its text (`gain` or `cost`, the
// theme's) and the text. `plain` pictures are palette icons, drawn into a fixed box.
const INFOS = {
  [InfoType.CACAO_HARVESTED]: ({ amount }) => ({
    image: "/images/cacao.svg",
    color: "gain",
    text: "+" + amount,
  }),
  [InfoType.CACAO_CONSUMED]: ({ amount }) => ({
    image: "/images/cacao.svg",
    color: "cost",
    text: "-" + amount,
  }),
  [InfoType.BUILDING_READY]: ({ amount }) => ({
    image: "/images/buildings-icon.svg",
    color: "gain",
    text: "+" + amount,
    plain: true,
  }),
  [InfoType.SHOT_READY]: ({ amount, kind }) => ({
    image: `/images/${SHOT_ICONS[kind] || SHOT_ICONS[AttackType.TRUFFLE]}.svg`,
    color: "gain",
    text: "+" + amount,
    plain: true,
  }),
  [InfoType.BUNNY_CAUGHT]: () => ({ image: "/images/bunny-caught.svg" }),
  [InfoType.DONUT_TRAP]: ({ kind }) => ({
    image: `/images/${DONUT_ICONS[kind] || "stop-donut-icon"}.svg`,
    plain: true,
  }),
};

// what an info of `type` shows (see INFOS), undefined for an unknown type
export const infoPicture = (type, amount, kind) =>
  INFOS[type] ? INFOS[type]({ amount, kind }) : undefined;

// a "#rrggbb" colour lighter (amount > 0) or darker
const shade = (color, amount) =>
  "#" +
  color
    .replace(/^#/, "")
    .replace(/../g, (channel) =>
      (
        "0" +
        Math.min(255, Math.max(0, parseInt(channel, 16) + amount)).toString(16)
      ).substr(-2)
    );

// the picture and the text into the info's texture; the picture's size and where the text
// starts depend on the picture
const draw = (texture, image, { image: filename, color, text, plain }) => {
  const context = texture.getContext();
  let top = 120;
  let left = 70;
  if (plain) {
    // palette icons come in different sizes: draw them into a fixed box
    context.drawImage(image, 0, 0, 130, 130);
    top = 130;
    left = 90;
  } else if (filename === "/images/cacao.svg") {
    context.drawImage(image, 0, 0, image.width * 0.5, image.height * 0.5);
    top = 100;
    left = 56;
  } else {
    context.drawImage(image, 0, 0, image.width * 0.8, image.height * 0.8);
  }
  texture.update();
  if (typeof text !== "undefined") {
    const font = "bold 68px Bangers, Impact, sans-serif";
    texture.drawText(
      text,
      left + 2,
      top + 2,
      font,
      shade(color, -128),
      null,
      true,
      true
    );
    texture.drawText(text, left, top, font, color, null, true, true);
  }
};

/**
 * A floating info over a board cell.
 * @param {object} context
 * @param {Scene} context.scene
 * @param {OneShots} context.pops the infos on their way (src/3d/oneShots.js): stopAll takes
 *   them away, also those whose picture is still loading
 * @param {(run?: boolean) => void} context.setRenderLoop
 * @param {number} context.height where it starts: right above the units of the board
 * @param {{gain: string, cost: string}} context.colors the text colours
 * @param {string} type an InfoType
 * @param {Vector3|{row, col}} position on the own board, or a Vector3 anywhere (its y is
 *   replaced)
 * @param {number} [amount] the number it shows
 * @param {string} [kind] the attack type of a shot, the donut type of a trap
 */
export const spawnInfoPop = (
  { scene, pops, setRenderLoop, height, colors },
  type,
  position,
  amount,
  kind
) => {
  const info = infoPicture(type, amount, kind);
  if (!info) {
    return;
  }
  if (!(position instanceof Vector3)) {
    position = new Vector3(position.row, height, position.col);
  }

  const id = Date.now();
  const mesh = MeshBuilder.CreatePlane(
    "info_" + id,
    { width: 1.15, height: 1.15 },
    scene
  );
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
  mesh.position = position;
  mesh.position.y = height;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;

  const texture = new DynamicTexture("info_texture_" + id, 208, scene);
  const material = new StandardMaterial("info_material_" + id, scene);
  material.emissiveTexture = texture;
  material.ambientTexture = texture;
  material.opacityTexture = texture;
  mesh.material = material;

  // until its picture has loaded the info is only a mesh; once it rises, it holds the render
  // loop until its end
  let rising = false;
  const end = pops.start(() => {
    if (rising) {
      scene.stopAnimation(mesh);
    }
    mesh.dispose();
    texture.dispose();
    material.dispose();
    if (rising) {
      setRenderLoop(false);
    }
  });

  const image = new Image();
  image.src = info.image;
  image.onload = () => {
    if (!pops.isRunning(end)) {
      return;
    }
    setRenderLoop();
    rising = true;
    draw(texture, image, {
      ...info,
      color: info.color && colors[info.color],
    });

    const flyaway = new Animation(
      "flyaway_" + id,
      "position.y",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    const fade = new Animation(
      "fade",
      "visibility",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    fade.setKeys([
      { frame: 0, value: 1.0 },
      { frame: POP_FRAMES - 20, value: 0.8 },
      { frame: POP_FRAMES, value: 0.0 },
    ]);
    flyaway.setKeys([
      { frame: 0, value: mesh.position.y },
      { frame: POP_FRAMES, value: mesh.position.y + 1.4 },
    ]);
    mesh.animations = [flyaway, fade];
    // up to the last key (POP_FRAMES): the pop is invisible from there on, and until it
    // ends the render loop runs
    scene.beginAnimation(mesh, 0, POP_FRAMES, false, 1, end);
  };
};
