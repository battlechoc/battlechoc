import { lazy, Suspense, useEffect, useState } from "react";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import ConfirmChange from "../account/ConfirmChange";
import ChunkWaiting from "./ChunkWaiting";
import { cardanoApi, keyStore, subjectOfWords } from "../../cardano";
import logger from "../../helper/logger";
import { loadChunk } from "../../helper/loadChunk";

// the wallet door (plan 3): loaded when it opens, and asked for again until it arrives (a lost
// request never throws into the Hud)
const WalletDoor = lazy(loadChunk(() => import("../account/WalletDoor")));

// what "Is it you?" needs: the player's keys, their passkeys and this device's own key; when
// they cannot be read, the door opens without them (the server asks for the proof if it needs
// one, and the proof then offers what it can)
const readKeys = async () => {
  const [identities, passkeys] = await Promise.all([
    cardanoApi.identities(),
    cardanoApi.passkeys().catch(() => []),
  ]);
  let local = null;
  try {
    const words = await keyStore.load();
    local = words ? await subjectOfWords(words) : null;
  } catch (failure) {
    logger.info("could not read the key on this device", failure);
  }
  return { identities, passkeys: passkeys || [], local };
};

/**
 * "Connect" on the minting checklist's wallet line: the wallet door in place, as Account safety's
 * wallet row opens it (SaveProgress): a player who has keys proves it first (ConfirmChange), and
 * a door that answers "confirm" asks for that proof. It never stays on nothing: keys that cannot
 * be read open the door. `onDone()`: the door closed (linked or not; the checklist then asks the
 * server again).
 */
const MintConnect = ({ onDone }) => {
  // "proof" (ConfirmChange), "door" (WalletDoor) or null while the keys load
  const [stage, setStage] = useState(null);
  const [keys, setKeys] = useState({
    identities: [],
    passkeys: [],
    local: null,
  });
  const [token, setToken] = useState(undefined);

  useEffect(() => {
    let gone = false;
    readKeys().then(
      (read) => {
        if (!gone) {
          setKeys(read);
          setStage(read.identities.length > 0 ? "proof" : "door");
        }
      },
      (failure) => {
        logger.warn("could not read the linked keys", failure);
        if (!gone) {
          setStage("door");
        }
      }
    );
    return () => {
      gone = true;
    };
  }, []);

  const linked = (answer) => {
    if (answer && answer.outcome === "confirm") {
      setStage("proof");
      return;
    }
    onDone();
  };

  return (
    <>
      {stage === "door" ? (
        <Suspense
          fallback={
            <ChunkWaiting title={t(tr.WALLET_DOOR_TITLE)} onClose={onDone} />
          }
        >
          <WalletDoor
            open
            purpose="link"
            confirmToken={token}
            onClose={onDone}
            onDone={linked}
          />
        </Suspense>
      ) : null}
      <ConfirmChange
        open={stage === "proof"}
        passkeyIds={keys.passkeys.map((passkey) => passkey.credentialId)}
        hasWallet={keys.identities.some(
          (identity) => identity.subject !== keys.local
        )}
        onClose={onDone}
        onConfirmed={async (confirmToken) => {
          setToken(confirmToken);
          setStage("door");
        }}
      />
    </>
  );
};

export default MintConnect;
