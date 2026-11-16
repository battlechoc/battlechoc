import { lazy, Suspense } from "react";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Button from "../controls/Button";
import { signPageUrl } from "../../cardano";
import { loadChunk } from "../../helper/loadChunk";
import ChunkWaiting from "./ChunkWaiting";

// The parts the minting dialog and the salvage of a minted item show alike: the problem's box
// with its own button, and the wallet door for a signature (a phone's wallet app opens the sign
// page; a wallet this browser injected signs here).

// the wallet door (plan 3), for a signature with a wallet this browser did not inject: not
// precached, so asked for again until it arrives (a lost request never throws into the Hud)
const WalletDoor = lazy(loadChunk(() => import("../account/WalletDoor")));

/**
 * What went wrong (`problemKey` and its `text`, `detail` for a technical line) with the problem's
 * own button (`action`: { label, testId, color, disabled, onClick }, or null), in `classes`'
 * problem box (the dialog sheet's); `testId` names the box.
 */
export const ProblemBox = ({
  classes,
  testId,
  problemKey,
  text,
  detail = null,
  action = null,
}) => (
  <div
    className={classes.problem}
    role="alert"
    data-testid={testId}
    data-key={problemKey}
  >
    <p className={classes.problemText}>{text}</p>
    {detail ? (
      <p className={classes.detail}>{t(tr.LINK_DETAILS, detail)}</p>
    ) : null}
    {action ? (
      <Button
        color={action.color}
        onClick={action.onClick}
        disabled={action.disabled}
        data-testid={action.testId}
      >
        {action.label}
      </Button>
    ) : null}
  </div>
);

/**
 * The wallet door for signing the operation of this tab's `signCode` (purpose "sign"):
 * `onClose()`; `onWallet(name)` (a wallet this browser injected was chosen); `onPhone()` (a
 * phone's wallet app opened the sign page).
 */
export const SignDoor = ({ signCode, onClose, onWallet, onPhone }) => (
  <Suspense
    fallback={<ChunkWaiting title={t(tr.MINT_OPEN_WALLET)} onClose={onClose} />}
  >
    <WalletDoor
      open
      purpose="sign"
      signPageUrl={signPageUrl(signCode)}
      onClose={onClose}
      onWallet={onWallet}
      onPhone={onPhone}
      onDone={onClose}
    />
  </Suspense>
);
