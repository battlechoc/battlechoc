// Every style sheet minting's components use is one JSS can build (node --test): each is built
// with the repo's own jss and its default preset, as react-jss builds it on the first render. A
// rule JSS cannot nest (a @keyframes inside a rule) throws there, which once made the minting
// dialog fail every time it opened (src/ui/mint/mintSheets.js, src/ui/lab/itemText.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { create } from "jss";
import presetModule from "jss-preset-default";
import theme from "../../src/theme.js";
import {
  checklistSheet,
  costsSheet,
  dialogSheet,
  salvageSheet,
  statusSheet,
} from "../../src/ui/mint/mintSheets.js";
import { ITEM_ICON_SHEET } from "../../src/ui/lab/itemText.js";

// the CommonJS build exports the preset as `default`
const preset = presetModule.default || presetModule;
const jss = create(preset());
const built = (styles) => jss.createStyleSheet(styles).toString();

test("every sheet of minting's components builds with JSS's default preset", () => {
  const sheets = {
    dialog: dialogSheet(theme),
    checklist: checklistSheet(theme),
    costs: costsSheet(theme),
    status: statusSheet(theme),
    salvage: salvageSheet(theme),
    itemIcon: ITEM_ICON_SHEET,
  };
  for (const [name, styles] of Object.entries(sheets)) {
    assert.doesNotThrow(() => built(styles), name);
  }
});

test("the pulses are keyframes at the top of their sheet, off for reduced motion", () => {
  for (const [name, styles] of [
    ["dialog", dialogSheet(theme)],
    ["itemIcon", ITEM_ICON_SHEET],
  ]) {
    const css = built(styles);
    assert.match(css, /@keyframes [\w-]+ \{[^}]*0%/, name);
    assert.match(css, /animation: [\w-]+ 1\.2s ease-in-out infinite/, name);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, name);
  }
});
