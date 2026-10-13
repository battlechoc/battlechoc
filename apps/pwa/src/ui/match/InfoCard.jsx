import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
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
  card: {
    position: "absolute",
    top: "calc(10px + 8vw)",
    left: 5,
    zIndex: 4,
    maxWidth: "34vw",
    padding: "0.6em 0.9em",
    borderRadius: "1em",
    background: "rgba(27, 78, 105, 0.92)",
    border: `0.25vw solid ${theme.color.secondary.light}`,
    color: "white",
    fontSize: "1.4vw",
    cursor: "pointer",
    userSelect: "none",
    [theme.breakpoints.orientation.portrait]: {
      top: "calc(10px + 16vw)",
      maxWidth: "80vw",
      fontSize: "3.4vw",
    },
    "& h3": {
      margin: "0 0 0.3em 0",
      fontFamily: "Bangers",
      fontWeight: "normal",
      fontSize: "160%",
      color: theme.color.gold.light,
    },
    "& p": { margin: "0 0 0.4em 0" },
    "& ul": { margin: 0, paddingLeft: "1.1em" },
    "& li": { color: theme.color.primary.light, fontWeight: "bold" },
  },
}));

// fills {{placeholders}} of a translated text
const fill = (text, values) =>
  text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    typeof values[key] !== "undefined" ? values[key] : match
  );
const seconds = (ms) => Math.round(ms / 100) / 10;

// real-time facts of a building, from the match balance and the player's Choclab level
const buildingLines = (view, type) => {
  const spec = view.balance.entities[type] || {};
  const level = (view.players[view.viewer].level || {})[type] || 0;
  const lines = [];
  if (type === EntityType.CREAM) {
    lines.push(t(tr.TOOLTIP_RT_CREAM));
  }
  if (!isDonut(type)) {
    lines.push(
      spec.costs > 0
        ? fill(t(tr.TOOLTIP_RT_COSTS), { costs: spec.costs })
        : t(tr.TOOLTIP_RT_COSTS_FREE)
    );
  }
  if (spec.cacao) {
    lines.push(
      fill(t(tr.TOOLTIP_RT_CACAO), {
        amount: valueAt(spec.cacao.amount, level),
        seconds: seconds(valueAt(spec.cacao.intervalMs, level)),
      })
    );
  }
  if (spec.build) {
    lines.push(
      fill(t(tr.TOOLTIP_RT_BUILDINGS), {
        seconds: seconds(valueAt(spec.build.intervalMs, level)),
        capacity: valueAt(spec.build.capacity, level),
      })
    );
  }
  (spec.weapons || []).forEach((weapon) => {
    lines.push(fill(t(tr.TOOLTIP_RT_WEAPON), { seconds: seconds(weapon.cooldownMs) }));
    if (weapon.rush && weapon.rush.enabled) {
      lines.push(
        fill(t(tr.TOOLTIP_RT_RUSH), {
          seconds: seconds(weapon.cooldownMs * weapon.rush.fromProgress),
          costs: weapon.rush.cost,
        })
      );
    }
  });
  if (spec.donuts) {
    lines.push(
      fill(t(tr.TOOLTIP_RT_DONUTS), {
        seconds: seconds(valueAt(spec.donuts.intervalMs, level)),
        chance: Math.round(valueAt(spec.donuts.probability, level) * 100),
      })
    );
  }
  if (type === EntityType.CHOCOLATE_FOUNTAIN) {
    lines.push(t(tr.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN_ADVANTAGE));
  }
  return lines;
};

const InfoCard = ({ view, tappedBuilding, selectedAttack }) => {
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

  if (
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
    const descriptor = getEntityDescriptor(subject.type, view.players[view.viewer].level);
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
    </div>
  );
};

const mapStateToProps = (state) => ({
  view: state.match.view,
  tappedBuilding: state.ui.tappedBuilding,
  selectedAttack: state.ui.selectedAttack,
});

export default connect(mapStateToProps)(InfoCard);
