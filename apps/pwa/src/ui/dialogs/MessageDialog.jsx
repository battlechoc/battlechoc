import React from "react";
import { createUseStyles } from "react-jss";
import Dialog from "./Dialog";

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.8em",
    width: "min(22em, 70vw)",
    "& p": {
      margin: "0 0 0.3em",
      textAlign: "center",
      color: "white",
      fontFamily: theme.font.body,
      fontSize: theme.font.size.md,
    },
  },
}));

/**
 * A message with a title and one or two buttons below it (`children`), as an info dialog;
 * `close` is its close button and Escape. Renders nothing while closed.
 */
const MessageDialog = ({ open, close, title, text, children, "data-testid": testId }) => {
  const classes = useStyles();
  if (!open) {
    return null;
  }
  return (
    <Dialog open close={close} mode="info" title={title}>
      <div className={classes.body} data-testid={testId}>
        <p>{text}</p>
        {children}
      </div>
    </Dialog>
  );
};

export default MessageDialog;
