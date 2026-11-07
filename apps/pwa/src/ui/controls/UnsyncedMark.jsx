import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// Beside a name chosen offline that the server does not know yet (Multiplayer.syncPendingUsername):
// the game's offline sign (no wifi on a dark round badge, like on the buttons that need the
// server), as big as the text around it.
const useStyles = createUseStyles({
  mark: {
    display: "inline-block",
    flex: "0 0 auto",
    width: "0.9em",
    height: "0.9em",
    marginLeft: "0.3em",
    verticalAlign: "middle",
    borderRadius: "50%",
    boxSizing: "border-box",
    border: "0.06em solid #e6e6e6",
    background: "#555 url(/images/offline.svg) no-repeat center / 72%",
  },
});

const UnsyncedMark = () => {
  const classes = useStyles();
  return (
    <span
      className={classes.mark}
      role="img"
      aria-label={t(tr.NAME_UNSYNCED)}
      title={t(tr.NAME_UNSYNCED)}
      data-testid="name-unsynced"
    />
  );
};

export default UnsyncedMark;
