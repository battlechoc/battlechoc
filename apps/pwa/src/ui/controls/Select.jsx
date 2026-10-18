import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import withDefaultProps from "../../helper/defaultProps";

// One row in the text size of buttons (the type scale), like the player name input.
const useStyles = createUseStyles((theme) => ({
  wrapper: {
    width: "100%",
    position: "relative",
    display: "flex",
    fontSize: theme.font.size.lg,
  },
  input: {
    color: theme.color.secondary.dark,
    fontFamily: theme.font.display,
    borderRadius: "0.55em",
    width: "100%",
    boxSizing: "border-box",
    paddingRight: "2.4em",
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    height: "2.2em",
    background: "white",
    border: `2px solid ${theme.color.secondary.light}`,
    "& > span": {
      marginLeft: "0.3em",
    },
  },
  dropdown: {
    boxSizing: "border-box",
    border: `0.12em solid ${theme.color.secondary.light}`,
    borderRadius: "0.55em",
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
    height: "2.2em",
    width: "2.2em",
    position: "absolute",
    top: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  options: {
    position: "absolute",
    zIndex: 15,
    width: "100%",
    flexDirection: "column",
    border: `2px solid ${theme.color.secondary.light}`,
    background: "white",
    borderRadius: "0.55em",
    overflow: "hidden",
    fontFamily: theme.font.display,
    "& > div": {
      height: "2.2em",
      borderBottom: `2px solid ${theme.color.secondary.light}`,
      display: "flex",
      color: theme.color.secondary.dark,
      alignItems: "center",
      justifyContent: "flex-start",
      cursor: "pointer",
    },
    "& > div > span": {
      marginLeft: "0.3em",
    },
  },
  icon: {
    width: "60%",
    height: "60%",
  },
  selected: {
    backgroundColor: theme.color.secondary.dark,
    color: "white !important",
  },
  optionIcon: {
    flex: "0 0 auto",
    width: "2.4em",
    height: "1.1em",
  },
}));

const Select = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const [selected, setSelected] = useState(props.options[0]);
  const [visible, setVisible] = useState(false);
  const classes = useStyles(props);
  const options = useRef();

  useEffect(() => {
    const defaultOption = props.options.find(
      (option) => option.value === props.defaultSelected
    );
    setSelected(defaultOption);
  }, [props.defaultSelected, props.options]);

  useEffect(() => {
    const handleClick = (event) => {
      if (!options.current.contains(event.target)) {
        setVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  const select = (option) => {
    if (option.value !== selected.value) {
      setSelected(option);
      props.onChange(option.value);
    }
    setVisible(false);
  };

  return (
    <div className={`${classes.wrapper} ${props.className}`}>
      <div className={classes.input}>
        {selected.icon ? (
          <div
            className={classes.optionIcon}
            style={{
              backgroundImage: `url(/images/${selected.icon})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: "100% 100%",
            }}
          ></div>
        ) : null}
        <span>{selected.label}</span>
      </div>
      <div onClick={() => setVisible(true)} className={classes.dropdown}>
        <div
          className={classes.icon}
          style={{
            background: "url(/images/arrow-down.svg) no-repeat",
            backgroundSize: "100% 100%",
          }}
        ></div>
      </div>
      <div
        ref={options}
        className={classes.options}
        style={visible ? { display: "flex" } : { display: "none" }}
      >
        {props.options.map((option) => (
          <div
            className={
              selected.value === option.value ? classes.selected : null
            }
            key={option.value}
            onClick={() => select(option)}
          >
            {option.icon ? (
              <div
                className={classes.optionIcon}
                style={{
                  backgroundImage: `url(/images/${option.icon})`,
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "100% 100%",
                }}
              ></div>
            ) : null}
            <span>{option.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const defaultProps = {
  className: "",
  defaultSelected: null,
};

Select.propTypes = {
  onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired,
  defaultSelected: PropTypes.string,
  className: PropTypes.string,
};

export default Select;
