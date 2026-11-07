import { useState, useEffect } from "react";
import { createUseStyles, useTheme } from "react-jss";
import Button from "./Button";
import withDefaultProps from "../../helper/defaultProps";
import { LAB_BUILDINGS, BUILDING_ICON, iconUrl } from "../../catalog";

// the buildings the lab equips, with their pictures
const labBuildings = LAB_BUILDINGS.map((type) => ({ type, icon: BUILDING_ICON[type] }));

const useStyles = createUseStyles((theme) => ({
  // the arrows at the ends keep an edge (--edge) from the screen's sides: 6px of it is their margin
  palette: {
    width: "100%",
    boxSizing: "border-box",
    padding: `0 calc(${theme.edge.right} - 6px) 0 calc(${theme.edge.left} - 6px)`,
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

const ChoclabPalette = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const classes = useStyles();
  const theme = useTheme();
  const [selectedEntity, setSelectedEntity] = useState(0);

  const checkEntityBounds = (entity) => {
    if (entity < 0) {
      return labBuildings.length - 1;
    } else if (entity >= labBuildings.length) {
      return 0;
    }
    return entity;
  };

  const selectEntity = (entity) => {
    entity = checkEntityBounds(entity);
    setSelectedEntity(entity);
    props.selectEntity(labBuildings[entity].type);
  };

  // follow a building chosen elsewhere (e.g. the recipe book of the lab)
  useEffect(() => {
    if (typeof props.selected === "undefined") {
      return;
    }
    const index = labBuildings.findIndex(
      (entry) => entry.type === props.selected
    );
    if (index >= 0 && index !== selectedEntity) {
      setSelectedEntity(index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selected]);

  const previous =
    labBuildings[checkEntityBounds(selectedEntity - 1)];
  const selected = labBuildings[selectedEntity];
  const next = labBuildings[checkEntityBounds(selectedEntity + 1)];

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
            backgroundImage: `url(${iconUrl(previous.icon)})`,
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
            backgroundImage: `url(${iconUrl(selected.icon)})`,
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
            backgroundImage: `url(${iconUrl(next.icon)})`,
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

const defaultProps = {
  className: "",
  style: {},
};

export default ChoclabPalette;
