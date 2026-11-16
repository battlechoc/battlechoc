// The style sheets of minting's components (react-jss createUseStyles takes each), in one module
// that node can load: test/unit/mintSheets.test.js builds every one with the repo's own jss and
// its default preset, as react-jss does, so a rule JSS cannot build fails a unit test and not
// the first render. Every visual value comes from mintLook.js or the theme.
import { MINT_LOOK } from "./mintLook.js";
import { STAMP } from "../lab/itemText.js";

/**
 * A wide dialog (a desktop or a tablet held sideways): the dialog uses its width, so a step's
 * texts take fewer lines and its buttons stand side by side; everything a player reads before
 * the step's main button fits a 1280×720 screen. Phones keep the mockup's narrow column.
 */
export const WIDE =
  "@media screen and (min-width: 900px) and (orientation: landscape)";

/** The minted item's icon on the dialog's last step (the mockup's 110 px). */
export const DONE_ICON = "6.9em";

/** The minting dialog (MintDialog.jsx). */
export const dialogSheet = (theme) => ({
  "@keyframes mintPulse": MINT_LOOK.pulseFrames,
  // as high as its content, at most the dialog's: then only `scroll` scrolls, and the step's
  // buttons stay in sight below it (as Highscore keeps its page buttons below the list)
  body: {
    alignSelf: "flex-start",
    boxSizing: "border-box",
    maxHeight: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.9em",
    width: "min(24em, 76vw)",
    maxWidth: "100%",
    fontFamily: theme.font.body,
    color: "white",
    textAlign: "center",
    [WIDE]: { width: "min(38em, 100%)", gap: "0.7em" },
  },
  // the step's texts, boxes and the problem
  scroll: {
    alignSelf: "stretch",
    flex: "0 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.9em",
    [WIDE]: { gap: "0.7em" },
  },
  gold: { color: MINT_LOOK.gold },
  text: {
    margin: 0,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.45,
  },
  soft: { color: MINT_LOOK.soft },
  // "Minted stays minted", the wallet step's notes
  note: {
    margin: 0,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.4,
    color: MINT_LOOK.note,
  },
  // the explainer's three cards
  cards: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: "0.6em",
    textAlign: "left",
  },
  card: {
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.panel,
    border: `2px solid ${MINT_LOOK.rim}`,
    padding: "0.75em",
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.35,
  },
  cardTitle: {
    display: "block",
    fontFamily: theme.font.display,
    fontSize: "1.25em",
    letterSpacing: "0.03em",
    color: MINT_LOOK.gold,
  },
  // what the wallet will show: You give, You get
  walletBox: {
    alignSelf: "stretch",
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.walletBox,
    border: `2px solid ${MINT_LOOK.walletRim}`,
    padding: "0.85em",
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",
    textAlign: "left",
    fontSize: theme.font.size.md,
    fontWeight: 700,
  },
  walletRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.6em",
    // the label ("You get") keeps its line; the amount or the item beside it wraps instead
    "& > span:first-child": { flexShrink: 0, whiteSpace: "nowrap" },
  },
  give: { color: MINT_LOOK.give, textAlign: "right" },
  get: { color: MINT_LOOK.get, textAlign: "right" },
  // under the item: the ADA that goes with it into the wallet (its deposit), not given
  stays: {
    display: "block",
    marginTop: "0.2em",
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    color: MINT_LOOK.soft,
  },
  // the buttons, one under the other as wide as the dialog
  buttons: {
    flex: "none",
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.6em",
    // side by side, in the same order (the main one first)
    [WIDE]: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "0.6em 1em",
    },
  },
  link: {
    border: 0,
    background: "none",
    padding: "0.4em",
    minHeight: 44,
    color: "#FFE08A",
    font: "inherit",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    textDecoration: "underline",
    cursor: "pointer",
    "&:hover": { color: "white" },
    "&:disabled": { opacity: 0.6, cursor: "default" },
  },
  // the coin being minted
  coin: {
    width: 110,
    height: 110,
    boxSizing: "border-box",
    borderRadius: "50%",
    background: MINT_LOOK.gold,
    border: `5px solid ${MINT_LOOK.goldDark}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: `$mintPulse ${MINT_LOOK.pulse}`,
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
  // the minted item, with room for its serial tag
  done: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingBottom: STAMP.tagRoom(DONE_ICON),
  },
  name: { fontSize: theme.font.size.md, fontWeight: 700 },
  problem: {
    alignSelf: "stretch",
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    border: `2px solid ${MINT_LOOK.gold}`,
    background: MINT_LOOK.panel,
    padding: "0.7em 0.8em",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",
  },
  problemText: {
    margin: 0,
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  detail: {
    margin: 0,
    fontSize: theme.font.size.xs || theme.font.size.sm,
    opacity: 0.8,
    overflowWrap: "anywhere",
  },
});

/** The checklist (MintChecklist.jsx). */
export const checklistSheet = (theme) => ({
  list: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: "0.55em",
    textAlign: "left",
    [WIDE]: { gap: "0.45em" },
  },
  line: {
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.panel,
    border: `2px solid ${MINT_LOOK.rim}`,
    padding: "0.65em 0.8em",
    [WIDE]: { padding: "0.5em 0.8em" },
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",
  },
  missing: { borderColor: MINT_LOOK.gold },
  later: { opacity: 0.75 },
  head: { display: "flex", gap: "0.65em", alignItems: "center" },
  mark: { flex: "none", width: 26, height: 26 },
  words: {
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  text: { display: "block", fontWeight: 600, color: MINT_LOOK.soft },
  // the line's link (the guide) and its button, side by side
  doing: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6em",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: {
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: "#FFE08A",
    "&:hover": { color: "white" },
  },
  // the mockup's white pill
  pill: {
    marginLeft: "auto",
    minHeight: 44,
    padding: "0 1.1em",
    border: 0,
    borderRadius: 999,
    background: "white",
    color: theme.color.secondary.dark,
    font: "inherit",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    cursor: "pointer",
    "&:disabled": { opacity: 0.6, cursor: "default" },
    "&:focus-visible": {
      outline: `3px solid ${theme.color.gold.light}`,
      outlineOffset: 2,
    },
  },
  // several wallets: one radio row each
  options: { display: "flex", flexDirection: "column", gap: "0.4em" },
  option: {
    display: "flex",
    alignItems: "center",
    gap: "0.6em",
    minHeight: 44,
    padding: "0 0.6em",
    borderRadius: 10,
    border: `2px solid ${MINT_LOOK.rim}`,
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    cursor: "pointer",
  },
  picked: { borderColor: MINT_LOOK.gold },
  address: { fontWeight: 600, color: MINT_LOOK.soft },
});

/** The cost rows (MintCosts.jsx). */
export const costsSheet = (theme) => ({
  rows: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: "0.6em",
    textAlign: "left",
    [WIDE]: { gap: "0.45em" },
  },
  row: {
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.panel,
    border: `2px solid ${MINT_LOOK.rim}`,
    padding: "0.75em",
    [WIDE]: { padding: "0.5em 0.8em" },
    display: "flex",
    justifyContent: "space-between",
    gap: "0.6em",
  },
  words: {
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.35,
    minWidth: 0,
  },
  name: {
    display: "block",
    fontFamily: theme.font.display,
    fontWeight: "normal",
    fontSize: "1.3em",
    letterSpacing: "0.03em",
    color: MINT_LOOK.gold,
  },
  amount: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
  },
  // the fee's choice (two or more options)
  choice: {
    alignSelf: "stretch",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.5em",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: "0.4em",
    minHeight: 44,
    padding: "0 0.8em",
    borderRadius: 999,
    border: `2px solid ${MINT_LOOK.rim}`,
    cursor: "pointer",
  },
  picked: { borderColor: MINT_LOOK.gold },
});

/** The item card's Mint action and mark (MintStatus.jsx). */
export const statusSheet = (theme) => ({
  // the action: the gold button and its line under it
  action: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25em",
  },
  actionText: {
    margin: 0,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    color: "#E6F4FB",
  },
  // the mark: a panel with a gold rim, dashed while the minting runs
  box: {
    alignSelf: "stretch",
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.panel,
    border: `2px solid ${MINT_LOOK.gold}`,
    padding: "0.6em 0.8em",
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.35,
    textAlign: "left",
    color: "white",
  },
  running: { borderStyle: "dashed" },
  // a salvage that waits for the network longer than usual
  slow: { color: MINT_LOOK.soft },
  title: {
    display: "block",
    fontFamily: theme.font.display,
    fontWeight: "normal",
    fontSize: "1.3em",
    letterSpacing: "0.03em",
    color: MINT_LOOK.gold,
  },
  buttons: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "0.6em",
    marginTop: "0.6em",
  },
  error: {
    margin: "0.5em 0 0",
    color: theme.color.gold.light,
    fontWeight: 700,
  },
});

/**
 * What the salvage of a minted item (SalvageMinted.jsx) adds to the dialog's sheet: the rows of
 * what comes back, the advantage box, and the two boxes of "being salvaged" (the owner's mockup,
 * board 2).
 */
export const salvageSheet = (theme) => ({
  // the confirmation's parts, one under the other as the dialog's scroll area sets them
  confirm: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.7em",
    [WIDE]: { gap: "0.55em" },
  },
  // what comes back: one row per ingredient, a line, the deposit
  rows: {
    alignSelf: "stretch",
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.panel,
    border: `2px solid ${MINT_LOOK.rim}`,
    padding: "0.6em 0.8em",
    display: "flex",
    flexDirection: "column",
    gap: "0.4em",
    textAlign: "left",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
  },
  row: { display: "flex", alignItems: "center", gap: "0.5em" },
  rowName: { flexGrow: 1 },
  // "(legendary, all of it)" in the note's gold; "(half)" soft
  full: { fontWeight: 600, color: MINT_LOOK.note },
  half: { fontWeight: 600, color: MINT_LOOK.soft },
  amount: { flex: "none", whiteSpace: "nowrap" },
  line: { height: 2, background: MINT_LOOK.rim },
  // the advantage of the minting: a dark box with a gold rim
  advantage: {
    alignSelf: "stretch",
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.walletBox,
    border: `2px solid ${MINT_LOOK.gold}`,
    padding: "0.55em 0.75em",
    margin: 0,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.4,
    textAlign: "left",
  },
  // "being salvaged": signed (done), the ingredients on the way (dashed, running)
  steps: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",
    textAlign: "left",
  },
  step: {
    boxSizing: "border-box",
    borderRadius: MINT_LOOK.radius,
    background: MINT_LOOK.panel,
    border: `2px solid ${MINT_LOOK.rim}`,
    padding: "0.6em 0.75em",
    display: "flex",
    gap: "0.6em",
    alignItems: "center",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  stepRunning: { border: `2px dashed ${MINT_LOOK.gold}` },
  stepIcon: { flex: "none", width: 26, height: 26 },
  stepText: { display: "block", fontWeight: 600, color: MINT_LOOK.soft },
});
