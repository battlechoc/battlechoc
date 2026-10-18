import React from "react";
import { createUseStyles } from "react-jss";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Button from "../controls/Button";
import CoachCard from "../controls/CoachCard";

// OfflineStore.settingsStore key: the intro was shown on this device (Settings → "Restart
// tutorial" deletes it)
export const LAB_INTRO_SEEN = "labIntroSeen";

/**
 * The steps of the intro; `target` names the part of the lab that glows while the step talks
 * about it, `place` where the card sits on a phone (away from the target).
 */
export const LAB_INTRO_STEPS = [
  {
    id: "building",
    target: "stage",
    place: "bottom",
    title: "LAB_INTRO_BUILDING_TITLE",
    message: "LAB_INTRO_BUILDING",
  },
  {
    id: "table",
    target: "table",
    place: "top",
    title: "LAB_INTRO_TABLE_TITLE",
    message: "LAB_INTRO_TABLE",
  },
  {
    id: "craft",
    target: "building",
    place: "bottom",
    title: "LAB_INTRO_CRAFT_TITLE",
    message: "LAB_INTRO_CRAFT",
  },
  {
    id: "pantry",
    target: "topbar",
    place: "bottom",
    title: "LAB_INTRO_PANTRY_TITLE",
    message: "LAB_INTRO_PANTRY",
  },
];

const useStyles = createUseStyles((theme) => ({
  // on a phone the card moves to the bottom when the target is at the top
  bottom: {
    [theme.breakpoints.orientation.portrait]: {
      "&&": { top: "auto", bottom: "3vw" },
    },
  },
}));

// The coach card of the lab's first visit: a few steps through the lab, with a skip link.
const LabIntro = ({ step, onStep, onDone }) => {
  const classes = useStyles();
  const current = LAB_INTRO_STEPS[step];
  const last = step >= LAB_INTRO_STEPS.length - 1;
  return (
    <CoachCard
      className={current.place === "bottom" ? classes.bottom : ""}
      data-testid="lab-intro"
      data-step={current.id}
      role="region"
      aria-label={t(tr[current.title])}
      title={t(tr[current.title])}
      message={t(tr[current.message])}
      progress={`${step + 1}/${LAB_INTRO_STEPS.length}`}
      skipLabel={t(tr.LAB_INTRO_SKIP)}
      onSkip={onDone}
    >
      {step > 0 ? (
        <Button
          color="accent"
          icon="backward-accent"
          size="small"
          onClick={() => onStep(step - 1)}
          aria-label={t(tr.BUTTON_BACK)}
          data-testid="lab-intro-back"
        />
      ) : null}
      <Button
        icon={last ? "done" : "forward"}
        size="small"
        onClick={() => (last ? onDone() : onStep(step + 1))}
        aria-label={last ? t(tr.LAB_INTRO_DONE) : t(tr.LAB_INTRO_NEXT)}
        data-testid={last ? "lab-intro-done" : "lab-intro-next"}
      />
    </CoachCard>
  );
};

export default LabIntro;
