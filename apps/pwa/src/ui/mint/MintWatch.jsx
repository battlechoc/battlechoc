import { lazy, Suspense, useEffect, useState } from "react";
import { connect } from "react-redux";
import { features } from "../../cardano/appFeatures";
import { loadChunk } from "../../helper/loadChunk";

// The watcher of minting and salvage (plan E), loaded once the stats mark an item as being
// minted or salvaged, or a salvage that waits for its signature (with the marks on: not in the
// Android app), and kept for the session: it follows an operation in a block until it is final,
// when the stats no longer mark it. The game's first load gets nothing of minting but this
// check.
// Its chunk is asked for as every chunk the game loads on demand (helper/loadChunk.js): a load
// that fails (the device went offline right then, e.g. coming back from a phone's wallet app, or
// a server hiccup) is asked for again while the page is open (a fast round, then every minute, at
// once when the page or the device comes back) and never throws into the Hud (a failed lazy load
// crashed it to the recovery screen).
const MintWatcher = lazy(loadChunk(() => import("./MintWatcher")));

// an item being minted, being salvaged (plan E), or whose salvage waits for the signature
const followed = (entry) =>
  Boolean(entry && entry.minted) &&
  (["minting", "burning"].includes(entry.minted.state) ||
    entry.minted.kind === "burn");

const minting = (items) => Array.isArray(items) && items.some(followed);

/** Mounted once in the Hud: follows a minting that runs while no minting dialog shows it. */
const MintWatch = ({ items }) => {
  const [needed, setNeeded] = useState(false);
  const now = minting(items) && features.showMintMarks();
  useEffect(() => {
    if (now) {
      setNeeded(true);
    }
  }, [now]);
  return needed || now ? (
    <Suspense fallback={null}>
      <MintWatcher />
    </Suspense>
  ) : null;
};

const mapStateToProps = (state) => ({
  items: state.ui.playerInfos.stats.items,
});

export default connect(mapStateToProps)(MintWatch);
