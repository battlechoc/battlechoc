// The look of everything minting shows (the owner's mockup "Prägen: der Ablauf", board 1, and the
// sign page): one place for its colours and sizes, which the card's marks, the dialog and its
// parts share. The stamp's own gold is itemText.js's MINT.
import { MINT } from "../lab/itemText.js";

export const MINT_LOOK = {
  // a panel (a checklist line, a cost row, an explainer card): dark blue with a light blue rim
  panel: "#163F55",
  rim: "#3190C3",
  // a line that is not met yet, the minted box: the gold rim
  gold: MINT.gold,
  goldDark: MINT.dark,
  goldInk: MINT.ink,
  // the text under a title, the "checked later" mark
  soft: "#CFE9F7",
  // "Minted stays minted", the wallet step's notes
  note: "#FFE9A6",
  // what the player gives and gets on the wallet step
  give: "#FFC2D6",
  get: "#C9F27A",
  // the box of what the wallet will show
  walletBox: "#0F2E3F",
  walletRim: "#5DB3E0",
  // sizes (px at the mockup's 390 px phone; the dialog's own em scale where it has one)
  radius: 14,
  titleSize: 18,
  textSize: 14,
  noteSize: 13,
  amountSize: 22,
  // the pulse of something being minted (scale 1 → 1.12 → 1; a sheet puts the frames at its top
  // level as "@keyframes", where JSS can build them, and turns the pulse off for reduced motion)
  pulseFrames: {
    "0%": { transform: "scale(1)" },
    "50%": { transform: "scale(1.12)" },
    "100%": { transform: "scale(1)" },
  },
  pulse: "1.2s ease-in-out infinite",
};
