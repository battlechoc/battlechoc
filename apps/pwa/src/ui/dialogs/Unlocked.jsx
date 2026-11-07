import React from "react";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";
import { BUILDING_ICON, iconUrl } from "../../catalog";

// What a match just unlocked (src/unlocks.js), once each:
// - buildings (two after each of the first three matches): their pictures and names, and the
//   way to the demos of the buildings; closing it skips them, the settings show them again; it
//   also says how many matches the Choclab and online play still need
// - online (the fourth match): the Choclab and online matches
// Only in the page while open: its button reads like the one in the settings.
const Unlocked = ({ unlock, gamesLeft, close, showDemos }) => {
  if (!unlock) {
    return null;
  }
  const buildings = unlock.buildings || [];
  const step = unlock.online ? "online" : "buildings";
  return (
    <Dialog open close={close} mode="info" title={t(tr.UNLOCK_TITLE)}>
      <div data-testid="unlocked" data-step={step} style={{ textAlign: "center" }}>
        {buildings.length > 0 ? (
          <>
            <p>{t(tr.UNLOCK_BUILDINGS_HINT)}</p>
            <div style={{ display: "flex", justifyContent: "center", gap: "1.5em", flexWrap: "wrap" }}>
              {buildings.map((type) => (
                // a box as wide as its name's longest word (German names are one long word:
                // "Schokoladenbrunnen"), which decides whether the two stand side by side or one
                // below the other; with room to spare it grows until the name is on one line.
                // On a screen too narrow even for the word, the word breaks.
                <div
                  key={type}
                  data-testid="unlocked-building"
                  style={{
                    flex: "1 1 auto",
                    width: "min-content",
                    minWidth: "6em",
                    maxWidth: "max-content",
                    overflowWrap: "break-word",
                  }}
                >
                  <div
                    style={{
                      width: "4em",
                      height: "4em",
                      margin: "0 auto",
                      backgroundImage: `url(${iconUrl(BUILDING_ICON[type])})`,
                      backgroundSize: "contain",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "center",
                    }}
                  />
                  <div>{t(tr[`TOOLTIP_BUILDING_TITLE_${type.split(".")[1]}`])}</div>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {unlock.online ? (
          <>
            <p>{t(tr.UNLOCK_NEW_FEATURES)}</p>
            <p>{t(tr.UNLOCK_ONLINE_HINT)}</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button onClick={close}>Ok</Button>
            </div>
          </>
        ) : (
          <>
            <p>{t(tr.UNLOCK_DEMOS_HINT)}</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button onClick={showDemos}>{t(tr.TUTORIAL_SHOW_BUILDINGS)}</Button>
            </div>
            {gamesLeft > 0 ? (
              <p>
                {gamesLeft === 1
                  ? t(tr.UNLOCK_ONLINE_ONE_GAME)
                  : t(tr.UNLOCK_ONLINE_GAMES, gamesLeft)}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
};

export default Unlocked;
