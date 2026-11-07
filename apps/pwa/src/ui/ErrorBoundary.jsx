import React, { Component } from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Button from "./controls/Button";
import logger from "../helper/logger";
import { testHooksEnabled } from "../testHooks";

const useStyles = createUseStyles((theme) => ({
  // over everything, on the sky of the menus: the broken screen is gone, the way back is all
  // there is
  screen: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(0deg, ${theme.color.sky.dark} 0%, ${theme.color.sky.light} 80%)`,
  },
}));

// e2e tests make a boundary's children throw with
// window.dispatchEvent(new CustomEvent("battlechoc-test-crash", { detail: "hud" })) (test builds)
const Throw = () => {
  throw new Error("crash for the tests");
};

const RecoveryScreen =({ recover }) => {
  const classes = useStyles();
  return (
    <div className={classes.screen} data-testid="error-recovery">
      <Button size="huge" onClick={recover}>
        {t(tr.GAME_MENU_LEAVE)}
      </Button>
    </div>
  );
};

/**
 * Catches what throws while its children render (or in their lifecycle methods): instead of an
 * empty blue page the player gets a way back to the title screen. The error goes into the
 * logger, so a problem report sent afterwards carries it. `onRecover` tears down what was
 * running; the children come back afterwards (unless `onRecover` reloads the page).
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, crash: false };
  }

  componentDidMount() {
    if (testHooksEnabled) {
      window.addEventListener("battlechoc-test-crash", this.crashForTests);
    }
  }

  componentWillUnmount() {
    window.removeEventListener("battlechoc-test-crash", this.crashForTests);
  }

  crashForTests = (event) => {
    if (event.detail === this.props.name) {
      this.setState({ crash: true });
    }
  };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Error objects become {} in the report's JSON: the text of them goes in
    logger.error(
      `${this.props.name || "ui"} crashed`,
      error && error.name ? `${error.name}: ${error.message}` : String(error),
      error && error.stack ? String(error.stack) : undefined,
      info && info.componentStack ? String(info.componentStack) : undefined
    );
  }

  recover = () => {
    try {
      if (this.props.onRecover) {
        this.props.onRecover();
      }
    } catch (error) {
      logger.error("could not recover", String(error));
    }
    this.setState({ failed: false, crash: false });
  };

  render() {
    if (this.state.failed) {
      return <RecoveryScreen recover={this.recover} />;
    }
    return (
      <>
        {this.props.children}
        {this.state.crash ? <Throw /> : null}
      </>
    );
  }
}

export default ErrorBoundary;
