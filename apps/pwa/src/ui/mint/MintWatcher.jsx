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
import {
  operationsOf,
  salvaging,
  STATS_RELOAD,
  statsReloadGap,
} from "./watching";
import { held } from "./held";
import { reloadItems } from "./reloadItems";
import useChainEnabled from "./useChainEnabled";

// Follows the player's minting and salvage operations (a burn of a minted item's token, plan E)
// while no dialog shows them (MintWatch loads it once the stats mark an item as being minted or
// salvaged, or a salvage that waits for its signature, and keeps it): each operation the stats
// mark so, and each one last heard in a block (included) until it is final, so a rollback shows.
// It polls every 5 s at most (every 30 s while included), not while the page is hidden
// (operationPoll.js), and reads the stats again when the item's state changes: in a block, back
// out of it, or ended (a burn's also with the notices). A minting that lands while no minting
// dialog is open says so in a message; a salvage's ingredients come with the stats (below). It
// renders nothing.

const ENDS = ["final", "expired", "cancelled"];
const IN_BLOCK = ["included", "final"];

// the operations to follow here: the stats' and the lingering ones, without those a dialog holds
const wantedOf = (key) => () =>
  [...new Set([...(key ? key.split("|") : []), ...following.lingering()])]
    .filter((id) => !following.isHeld(id))
    .sort()
    .join("|");

const MintWatcher = ({ items, showMessage, updateStats }) => {
  const shown = useChainEnabled();
  const key = operationsOf(items);
  const burning = shown && salvaging(items);

  // While an item is being salvaged, the stats are read again (not while the page is hidden):
  // every 30 s for its first 10 minutes, then every 5 minutes (watching.js statsReloadGap). Its
  // ingredients arrive once its burn is final and credited, which may come a run of the
  // server's watcher after the operation's end, or with no operation of the game at all (a burn
  // made outside it). Then the item is gone from the stats and its notice is there.
  useEffect(() => {
    if (!burning) {
      return undefined;
    }
    const since = Date.now();
    let first = true;
    return pollOperation({
      fetch: () => {
        if (first) {
          // the stats were just read: the next round reads them
          first = false;
          return Promise.resolve();
        }
        return reloadItems(updateStats, { notices: true });
      },
      onAnswer: () => {},
      ended: () => false,
      every: STATS_RELOAD.early,
      settled: () => statsReloadGap(Date.now() - since) !== STATS_RELOAD.early,
      slowEvery: STATS_RELOAD.later,
    });
  }, [burning, updateStats]);
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
            // a salvage: no message (its ingredients come with the notice), the stats with the
            // notices once it is final (credited at that depth) or over
            const burn = operation.kind === "burn";
            const reload = () =>
              reloadItems(updateStats, burn ? { notices: true } : {});
            if (burn && now === "final" && was !== "final") {
              reload();
            } else if (IN_BLOCK.includes(now) && !IN_BLOCK.includes(was)) {
              if (!burn && !following.dialogOpen() && operation.item) {
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
              reload();
            } else if (
              now === "submitted" &&
              (was === "included" || (burn && was === "prepared"))
            ) {
              // the block was rolled back (the item is being minted or salvaged again), or a
              // salvage was signed elsewhere (on a phone): its item is being salvaged now
              reload();
            } else if (ENDS.includes(now) && !IN_BLOCK.includes(now)) {
              reload();
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
