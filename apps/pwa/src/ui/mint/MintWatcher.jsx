import { useEffect, useRef, useSyncExternalStore } from "react";
import { connect } from "react-redux";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { chainApi } from "../../api/chain";
import { showQuickMessage, updatePlayerStats } from "../uiSlice";
import { itemName } from "../lab/itemText";
import { following, pollOperation } from "./operationPoll";
import { held } from "./held";
import { reloadItems } from "./reloadItems";
import useChainEnabled from "./useChainEnabled";

// Follows the player's minting operations while no minting dialog shows them (MintWatch loads
// it once the stats mark an item as being minted, and keeps it): each operation the stats mark
// as minting, and each one last heard in a block (included) until it is final, so a rollback
// shows. It polls every 5 s at most (every 30 s while included), not while the page is hidden
// (operationPoll.js), and reads the stats again when the item's state changes: in a block, back
// out of it, or ended. A minting that lands while no minting dialog is open says so in a
// message. It renders nothing.

const ENDS = ["final", "expired", "cancelled"];
const IN_BLOCK = ["included", "final"];

/** The operations the stats' `items` mark as being minted, as a stable key ("id|id"). */
export const operationsOf = (items) =>
  (Array.isArray(items) ? items : [])
    .filter(
      (entry) =>
        entry &&
        entry.minted &&
        entry.minted.state === "minting" &&
        typeof entry.minted.operationId === "string"
    )
    .map((entry) => entry.minted.operationId)
    .sort()
    .join("|");

// the operations to follow here: the stats' and the lingering ones, without those a dialog holds
const wantedOf = (key) => () =>
  [...new Set([...(key ? key.split("|") : []), ...following.lingering()])]
    .filter((id) => !following.isHeld(id))
    .sort()
    .join("|");

const MintWatcher = ({ items, showMessage, updateStats }) => {
  const shown = useChainEnabled();
  const key = operationsOf(items);
  const wanted = useSyncExternalStore(following.subscribe, wantedOf(key));
  // the polls that run: id → stop
  const polls = useRef(new Map());

  useEffect(() => {
    const want = new Set(shown && wanted ? wanted.split("|") : []);
    for (const [id, stop] of polls.current) {
      if (!want.has(id)) {
        stop();
        polls.current.delete(id);
      }
    }
    for (const id of want) {
      if (polls.current.has(id)) {
        continue;
      }
      const done = () => polls.current.delete(id);
      polls.current.set(
        id,
        pollOperation({
          // a poll that hangs counts as unanswered after a while, and the next round asks again
          fetch: () => held(chainApi.operation(id)),
          ended: (operation) => !operation || ENDS.includes(operation.state),
          settled: (operation) => operation.state === "included",
          onAnswer: (operation) => {
            const before = following.noted(id);
            const was = before ? before.state : null;
            following.note(operation);
            if (!operation) {
              done();
              return;
            }
            const now = operation.state;
            if (IN_BLOCK.includes(now) && !IN_BLOCK.includes(was)) {
              if (!following.dialogOpen() && operation.item) {
                showMessage({
                  text: t(
                    tr.MINT_DONE_TOAST,
                    itemName(operation.item.item),
                    operation.item.serial
                  ),
                  variant: "success",
                  type: "MINT_DONE",
                });
              }
              reloadItems(updateStats);
            } else if (now === "submitted" && was === "included") {
              // the block was rolled back: the item is being minted again
              reloadItems(updateStats);
            } else if (ENDS.includes(now) && !IN_BLOCK.includes(now)) {
              reloadItems(updateStats);
            }
            if (ENDS.includes(now)) {
              done();
            }
          },
          // a failure for good (the operation is not the player's any more): the stats tell
          onFailure: () => {
            done();
            reloadItems(updateStats);
          },
        })
      );
    }
  }, [shown, wanted, showMessage, updateStats]);

  useEffect(
    () => () => {
      polls.current.forEach((stop) => stop());
      polls.current.clear();
    },
    []
  );

  return null;
};

const mapStateToProps = (state) => ({
  items: state.ui.playerInfos.stats.items,
});

const mapDispatchToProps = {
  showMessage: showQuickMessage,
  updateStats: updatePlayerStats,
};

export default connect(mapStateToProps, mapDispatchToProps)(MintWatcher);
