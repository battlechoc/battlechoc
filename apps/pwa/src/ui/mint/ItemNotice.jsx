import { createUseStyles } from "react-jss";
import {
  Items,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { features } from "../../cardano/appFeatures";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import ItemIcon from "../lab/ItemIcon";
import {
  effectLines,
  itemName,
  labColors,
  MINT,
  STAMP,
  TIER_COLORS,
} from "../lab/itemText";
import { noticeButtons } from "./notices";

// an item that arrived in a wallet is minted (the notice has the item's key and serial only)
const MINTED = { state: "minted" };

// the item's icon in a notice (the mockup's 72 px on a phone)
const ICON_SIZE = "4.5em";

// the buttons a notice can have: its label, colour and test id
const BUTTONS = {
  choclab: ["ITEM_TO_CHOCLAB", "primary", "item-notice-choclab"],
  later: ["ITEM_LATER", "secondary", "item-notice-later"],
  ok: ["ITEM_GOT_IT", "primary", "item-notice-ok"],
};

// two buttons side by side on a phone: the dialogs' button height (size normal), with a smaller
// minimum width and side padding than a lone button keeps, so the longest pair of texts (fr "Vers
// le Choclab" + "Plus tard") still fits one line of a 390 px phone's dialog
const PAIR = {
  style: { minWidth: "4em" },
  buttonStyle: { paddingLeft: "0.6em", paddingRight: "0.6em" },
};

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75em",
    width: "min(24em, 76vw)",
    maxWidth: "100%",
    overflowWrap: "anywhere",
    fontFamily: theme.font.body,
    color: "white",
    textAlign: "center",
  },
  // the arrival's title in the stamp's gold
  gold: { color: MINT.gold },
  // the icon beside what the item is
  item: {
    display: "flex",
    alignItems: "center",
    gap: "0.9em",
    textAlign: "left",
  },
  icon: { flex: "none", display: "flex" },
  // the serial tag hangs below the stamped icon
  tagged: { paddingBottom: STAMP.tagRoom(ICON_SIZE) },
  facts: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15em",
    minWidth: 0,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  name: { fontSize: theme.font.size.md, fontWeight: 700 },
  good: { color: labColors(theme).good, fontWeight: 700 },
  bad: { color: labColors(theme).bad, fontWeight: 700 },
  text: {
    margin: 0,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    lineHeight: 1.45,
  },
  // side by side while both fit on one line, else one below the other
  actions: {
    alignSelf: "stretch",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "0.6em",
  },
}));

/**
 * A notice about a minted item on the title screen (the owner's mockup "Hinweise"): `notice` is
 * one of stats.notices ({ id, kind: "arrived" | "departed", item: { id, item, serial }, building }).
 * An arrival shows the stamped item with what it does and offers the Choclab (`onChoclab`) or
 * later (`onDone`) while the Choclab is open to the player (`choclabOpen`), else only reads it;
 * a departure shows the greyed item, the building it was taken off and `onDone`. Nothing in the
 * Android app (features.showMintMarks).
 */
const ItemNotice = ({ notice, choclabOpen = false, onChoclab, onDone }) => {
  const classes = useStyles();
  if (!notice || !features.showMintMarks()) {
    return null;
  }
  const { item, serial } = notice.item;
  const arrived = notice.kind === "arrived";
  const buttons = noticeButtons(notice.kind, { choclabOpen });
  const definition = Items[item];
  return (
    <Dialog
      open
      closable={false}
      mode="info"
      title={
        <span className={arrived ? classes.gold : undefined}>
          {t(arrived ? tr.ITEM_ARRIVED_TITLE : tr.ITEM_DEPARTED_TITLE)}
        </span>
      }
    >
      <div
        className={classes.body}
        data-testid="item-notice"
        data-kind={notice.kind}
        data-notice={notice.id}
      >
        <div className={classes.item}>
          <span className={`${classes.icon} ${arrived ? classes.tagged : ""}`}>
            <ItemIcon
              item={item}
              size={ICON_SIZE}
              large
              minted={arrived ? MINTED : null}
              serial={serial}
              away={!arrived}
            />
          </span>
          <div className={classes.facts}>
            <span className={classes.name}>
              {`${itemName(item)} ${t(tr.ITEM_SERIAL, serial)}`}
            </span>
            {arrived ? (
              <>
                <span>
                  {`${t(tr[TIER_COLORS[definition.tier].label])} · ${t(
                    tr.LAB_POINTS,
                    definition.points
                  )}`}
                </span>
                {effectLines(item).map((line) => (
                  <span
                    key={line.text}
                    className={line.good ? classes.good : classes.bad}
                  >
                    {line.good ? "▲ " : "▼ "}
                    {line.text}
                  </span>
                ))}
              </>
            ) : null}
            {!arrived && notice.building ? (
              <span>
                {t(
                  tr.ITEM_DEPARTED_SLOT,
                  t(tr.TOOLTIP_BUILDING_TITLE, notice.building)
                )}
              </span>
            ) : null}
          </div>
        </div>
        <p className={classes.text}>
          {t(arrived ? tr.ITEM_ARRIVED_TEXT : tr.ITEM_DEPARTED_TEXT)}
        </p>
        <div className={classes.actions}>
          {buttons.map((button) => {
            const [label, color, testId] = BUTTONS[button];
            return (
              <Button
                key={button}
                color={color}
                style={buttons.length > 1 ? PAIR.style : undefined}
                buttonStyle={buttons.length > 1 ? PAIR.buttonStyle : undefined}
                onClick={button === "choclab" ? onChoclab : onDone}
                data-testid={testId}
              >
                {t(tr[label])}
              </Button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
};

export default ItemNotice;
