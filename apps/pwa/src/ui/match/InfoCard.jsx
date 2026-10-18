import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
import { loadUiState } from "../UiActions";
import OfflineStore from "../../OfflineStore";
import { createUseStyles } from "react-jss";
import {
  engine,
  EntityType,
  getEntityDescriptor,
  isDonut,
  valueAt,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

const VISIBLE_MS = 6000;

const useStyles = createUseStyles((theme) => ({
  // small, just above the build palette, so it does not cover the boards
  card: {
    position: "absolute",
    bottom: "calc(min(6vw, 11vh) + 2vw + 16px)",
    left: 5,
    zIndex: 4,
    maxWidth: "24vw",
    padding: "0.45em 0.7em",
    borderRadius: "0.8em",
    background: "rgba(27, 78, 105, 0.85)",
    border: `0.18vw solid ${theme.color.secondary.light}`,
    color: "white",
    fontSize: "1.05vw",
    cursor: "pointer",
    userSelect: "none",
    [theme.breakpoints.orientation.portrait]: {
      bottom: "calc(12vw + 4vw + 16px)",
      maxWidth: "70vw",
      fontSize: "2.8vw",
    },
    "& h3": {
      margin: "0 0 0.2em 0",
      fontFamily: "var(--font-display)",
      fontWeight: "normal",
      fontSize: "140%",
      color: theme.color.gold.light,
    },
    "& p": { margin: "0 0 0.4em 0" },
    "& ul": { margin: 0, paddingLeft: "1.1em" },
    "& li": { color: theme.color.primary.light, fontWeight: "bold" },
  },
  hide: {
    marginTop: "0.4em",
    padding: 0,
    background: "none",
    border: "none",
    color: "white",
    opacity: 0.75,
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: "85%",
  },
}));

// fills {{placeholders}} of a translated text
const fill = (text, values) =>
  text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    typeof values[key] !== "undefined" ? values[key] : match
  );
const seconds = (ms) => Math.round(ms / 100) / 10;

// real-time facts of a building, from the match balance and the player's equipment
const buildingLines = (view, type) => {
  const spec = view.balance.entities[type] || {};
  const value = (stat, base) => engine.equippedStat(view, view.viewer, type, stat, base);
  const costs = engine.buildCosts(view, view.viewer, type);
  const lines = [];
  if (type === EntityType.CREAM) {
    lines.push(t(tr.TOOLTIP_RT_CREAM));
  }
  if (!isDonut(type)) {
    lines.push(
      costs > 0
        ? fill(t(tr.TOOLTIP_RT_COSTS), { costs })
        : t(tr.TOOLTIP_RT_COSTS_FREE)
    );
  }
  if (spec.cacao) {
    lines.push(
      fill(t(tr.TOOLTIP_RT_CACAO), {
        amount: value("cacaoAmount", valueAt(spec.cacao.amount)),
        seconds: seconds(valueAt(spec.cacao.intervalMs)),
      })
    );
  }
  if (spec.build) {
    lines.push(
      fill(t(tr.TOOLTIP_RT_BUILDINGS), {
        seconds: seconds(value("buildIntervalMs", valueAt(spec.build.intervalMs))),
        capacity: value("buildCapacity", valueAt(spec.build.capacity)),
      })
    );
  }
  (spec.weapons || []).forEach((weapon) => {
    const cooldownMs = value("cooldownMs", weapon.cooldownMs);
    lines.push(fill(t(tr.TOOLTIP_RT_WEAPON), { seconds: seconds(cooldownMs) }));
    if (weapon.rush && weapon.rush.enabled) {
      lines.push(
        fill(t(tr.TOOLTIP_RT_RUSH), {
          seconds: seconds(cooldownMs * value("rushFrom", weapon.rush.fromProgress)),
          costs: value("rushCost", weapon.rush.cost),
        })
      );
    }
  });
  if (spec.donuts) {
    lines.push(
      fill(t(tr.TOOLTIP_RT_DONUTS), {
        seconds: seconds(value("donutIntervalMs", valueAt(spec.donuts.intervalMs))),
        chance: Math.round(value("donutProbability", valueAt(spec.donuts.probability)) * 100),
      })
    );
  }
  if (type === EntityType.CHOCOLATE_FOUNTAIN) {
    lines.push(t(tr.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN_ADVANTAGE));
  }
  return lines;
};

const InfoCard = ({ view, tappedBuilding, selectedAttack, tutorial, tipsEnabled, hideTips }) => {
  const classes = useStyles();
  const [subject, setSubject] = useState(undefined);

  // show the card for the latest palette selection, hide it after a few seconds
  useEffect(() => {
    if (typeof tappedBuilding !== "undefined") {
      setSubject({ kind: "building", type: tappedBuilding });
    }
  }, [tappedBuilding]);
  useEffect(() => {
    if (typeof selectedAttack !== "undefined") {
      setSubject({ kind: "attack", type: selectedAttack });
    }
  }, [selectedAttack]);
  useEffect(() => {
    if (typeof subject === "undefined") {
      return undefined;
    }
    const timeout = setTimeout(() => setSubject(undefined), VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [subject]);

  // the tutorial's coach card takes this place and explains the buildings itself
  if (
    tutorial ||
    !tipsEnabled ||
    typeof view === "undefined" ||
    view.phase !== engine.MatchPhase.RUNNING ||
    typeof subject === "undefined"
  ) {
    return null;
  }

  let title;
  let info;
  let lines = [];
  if (subject.kind === "building") {
    title = t(tr.TOOLTIP_BUILDING_TITLE, subject.type);
    const descriptor = getEntityDescriptor(subject.type);
    info = t(tr.TOOLTIP_BUILDING_INFO, subject.type, descriptor).info;
    lines = buildingLines(view, subject.type);
  } else {
    title = t(tr.TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE, subject.type);
    info = t(tr.TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE, subject.type);
  }

  return (
    <div className={classes.card} data-testid="info-card" onClick={() => setSubject(undefined)}>
      <h3>{title}</h3>
      {info ? <p>{info}</p> : null}
      {lines.length > 0 ? (
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className={classes.hide}
        onClick={(event) => {
          event.stopPropagation();
          hideTips();
        }}
      >
        {t(tr.TIPS_HIDE)}
      </button>
    </div>
  );
};

const mapStateToProps = (state) => ({
  view: state.match.view,
  tappedBuilding: state.ui.tappedBuilding,
  selectedAttack: state.ui.selectedAttack,
  tutorial: state.ui.tutorial,
  tipsEnabled: state.ui.tipsEnabled,
});

// the tips can be switched off here and back on in the settings
const mapDispatchToProps = (dispatch) => ({
  hideTips: () => {
    dispatch(loadUiState({ tipsEnabled: false }));
    OfflineStore.settingsStore.set("tips", false);
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(InfoCard);
