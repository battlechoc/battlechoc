import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { EntityType } from "@battlechoc/battlechoc-shared-functions";
import { createUseStyles, useTheme } from "react-jss";
import Button from "./Button";

const useStyles = createUseStyles((theme) => ({
  palette: {
    width: "100vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "& > *": {
      margin: "0 6px",
    },
  },
  container: {
    borderRadius: "50%",
    border: `0.5vh solid ${theme.color.secondary.dark}`,
    background: "linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)",
    "& > div": {
      width: "100%",
      height: "100%",
    },
  },
  normal: {
    [theme.breakpoints.orientation.landscape]: {
      width: "12vh",
      height: "12vh",
    },
    [theme.breakpoints.orientation.portrait]: {
      width: "10vh",
      height: "10vh",
      maxWidth: "15vw",
      maxHeight: "15vw",
    },
  },
  huge: {
    [theme.breakpoints.orientation.landscape]: {
      width: "16vh",
      height: "16vh",
    },
    [theme.breakpoints.orientation.portrait]: {
      width: "12vh",
      height: "12vh",
      maxWidth: "20vw",
      maxHeight: "20vw",
    },
  },
}));

const ChoclabPalette = (props) => {
  const classes = useStyles();
  const theme = useTheme();
  const [selectedEntity, setSelectedEntity] = useState(0);

  const buildingsForSeclection = useMemo(
    () => [
      {
        type: EntityType.FACTORY,
        icon: "factory",
      },
      {
        type: EntityType.CACAOTREE,
        icon: "cacao-tree",
      },
      {
        type: EntityType.RUM_TRUFFLE_CANNON,
        icon: "truffle-cannon",
      },
      {
        type: EntityType.FACTORY_EXTENSION,
        icon: "factory-extension",
      },
      {
        type: EntityType.SPYING_EASTER_BUNNY,
        icon: "easter-bunny",
      },
      {
        type: EntityType.XMAS_FACTORY,
        icon: "xmas-factory",
      },
      {
        type: EntityType.CHOCOLATE_FOUNTAIN,
        icon: "fountain",
      },
      {
        type: EntityType.FRUIT_CANNON,
        icon: "fruit-cannon",
      },
      {
        type: EntityType.HOT_CHOCOLATE_BALLISTA,
        icon: "ballista",
      },
      {
        type: EntityType.DONUT_FACTORY,
        icon: "donut-factory",
      },
    ],
    []
  );

  const checkEntityBounds = (entity) => {
    if (entity < 0) {
      return buildingsForSeclection.length - 1;
    } else if (entity >= buildingsForSeclection.length) {
      return 0;
    }
    return entity;
  };

  const selectEntity = (entity) => {
    entity = checkEntityBounds(entity);
    setSelectedEntity(entity);
    props.selectEntity(buildingsForSeclection[entity].type);
  };

  const previous =
    buildingsForSeclection[checkEntityBounds(selectedEntity - 1)];
  const selected = buildingsForSeclection[selectedEntity];
  const next = buildingsForSeclection[checkEntityBounds(selectedEntity + 1)];

  return (
    <div
      style={props.style}
      className={`${classes.palette} ${props.className}`}
    >
      <Button
        icon="backward"
        disabled={false}
        onClick={() => selectEntity(selectedEntity - 1)}
      />

      <div
        onClick={() => selectEntity(selectedEntity - 1)}
        className={`${classes.normal} ${classes.container}`}
      >
        <div
          style={{
            backgroundImage: `url(/images/${previous.icon}-icon.svg)`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 100%",
          }}
        />
      </div>

      <div
        className={`${classes.huge} ${classes.container}`}
        style={{ border: `0.5vh solid ${theme.color.gold.light}` }}
      >
        <div
          style={{
            backgroundImage: `url(/images/${selected.icon}-icon.svg)`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 100%",
          }}
        />
      </div>

      <div
        onClick={() => selectEntity(selectedEntity + 1)}
        className={`${classes.normal} ${classes.container}`}
      >
        <div
          style={{
            backgroundImage: `url(/images/${next.icon}-icon.svg)`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 100%",
          }}
        />
      </div>

      <Button
        icon="forward"
        disabled={false}
        onClick={() => selectEntity(selectedEntity + 1)}
      />
    </div>
  );
};

ChoclabPalette.defaultProps = {
  className: "",
  style: {},
};

ChoclabPalette.propTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
};

export default ChoclabPalette;
