import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "../dialogs/Dialog";
import { dialogSheet } from "./mintSheets";

const useStyles = createUseStyles(dialogSheet);

/**
 * What shows while a dialog's chunk is on its way (a Suspense fallback; helper/loadChunk.js
 * asks for it until it arrives): the dialog's `title`, that it loads, and its close
 * (`onClose`). A tap never seems to do nothing, and a dialog closed meanwhile does not open by
 * itself when its chunk arrives late.
 */
const ChunkWaiting = ({ title, onClose }) => {
  const classes = useStyles();
  return (
    <Dialog open close={onClose} title={title}>
      <p className={classes.text} data-testid="chunk-waiting">
        {t(tr.MINT_LOADING)}
      </p>
    </Dialog>
  );
};

export default ChunkWaiting;
