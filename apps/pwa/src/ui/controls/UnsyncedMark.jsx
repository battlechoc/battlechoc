import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// Beside a name chosen offline that the server does not know yet (Multiplayer.syncPendingUsername):
// two round arrows on an amber badge, as big as the text around it.
const useStyles = createUseStyles((theme) => ({
  mark: {
    display: "inline-block",
    flex: "0 0 auto",
    width: "0.9em",
    height: "0.9em",
    marginLeft: "0.3em",
    verticalAlign: "middle",
    borderRadius: "50%",
    boxSizing: "border-box",
    border: `0.08em solid ${theme.color.warning.light}`,
    background: `${theme.color.warning.dark} url(/images/refresh.svg) no-repeat center / 75%`,
  },
}));

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
