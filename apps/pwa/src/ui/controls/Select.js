import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    wrapper: {
      width: '100%',
      position: 'relative',
      display: 'flex' 
    },
    input: {
      color: theme.color.secondary.dark,
      fontFamily: 'Bangers',
      borderRadius: '2.857vh',
      width: '100%',
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      fontSize: '7vh',
      height: '11.428vh',
      background: 'white',
      border: `0.2vh solid ${theme.color.secondary.light}`,
      '& > span': {
        marginLeft: '2vh'
      },
      [theme.breakpoints.orientation.portrait]: {
        fontSize: '7vw',
        borderRadius: '2.857vw',
        height: '11.428vw',
        border: `0.2vw solid ${theme.color.secondary.light}`,
        '& > span': {
          marginLeft: '2vw'
        }
      }
    },
    dropdown: {
      border: `1vh solid ${theme.color.secondary.light}`,
      borderRadius: '2.857vh',
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
      height: '10vh',
      width: '10vh',
      position: 'absolute',
      top: 0,
      right: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      [theme.breakpoints.orientation.portrait]: {
        height: '10vw',
        width: '10vw',
        borderRadius: '2.857vw',
        border: `1vw solid ${theme.color.secondary.light}`,
      }
    },
    options: {
      position: 'absolute',
      zIndex: 15,
      width: '100%',
      flexDirection: 'column',
      border: `0.2vh solid ${theme.color.secondary.light}`,
      background: 'white',
      borderRadius: '2.857vh',
      overflow: 'hidden',
      fontFamily: 'Bangers',
      '& > div': {
        height: '11.428vh',
        borderBottom: `0.2vh solid ${theme.color.secondary.light}`,
        display: 'flex',
        color: theme.color.secondary.dark,
        alignItems: 'center',
        fontSize: '7vh',
        justifyContent: 'flex-start'
      },
      '& > div > span': {
        marginLeft: '2vh'
      },
      [theme.breakpoints.orientation.portrait]: {
        border: `0.2vw solid ${theme.color.secondary.light}`,
        borderRadius: '2.857vw',
        '& > div': {
          height: '11.428vw',
          borderBottom: `0.2vw solid ${theme.color.secondary.light}`,
          fontSize: '7vw'
        },
        '& span': {
          marginLeft: '2vw'
        },
      }
    },
    icon: {
      width: '60%',
      height: '60%'
    },
    selected: {
      backgroundColor: theme.color.secondary.dark,
      color: 'white !important'
    },
    optionIcon: {
      padding: '4vh 8vh',
      [theme.breakpoints.orientation.portrait]: {
        padding: '4vw 8vw'
      }
    }
  })
);

const Select = props => {
  const [ selected, setSelected ] = useState(props.options[0]);
  const [ visible, setVisible ] = useState(false);
  const classes = useStyles(props);
  const options = useRef();

  useEffect(() => {
    const defaultOption = props.options.find(option => option.value === props.defaultSelected);
    setSelected(defaultOption);
  }, [props.defaultSelected, props.options]);

  useEffect(() => {
    const handleClick = event => {
      if (!options.current.contains(event.target)) {
        setVisible(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  const select = option => {
    if (option.value !== selected.value) {
      setSelected(option);
      props.onChange(option.value);
    }
    setVisible(false);
  }

  return (
    <div className={`${classes.wrapper} ${props.className}`}>
      <div className={classes.input}>
        { selected.icon ? <div className={classes.optionIcon} style={{ backgroundImage: `url(/images/${selected.icon})`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%'}}></div> : null }
        <span>{ selected.label }</span>
      </div>
      <div onClick={() => setVisible(true)} className={classes.dropdown}>
        <div className={classes.icon} style={{ background: 'url(/images/arrow-down.svg) no-repeat', backgroundSize: '100% 100%'}}></div>
      </div>
      <div ref={options} className={classes.options} style={visible ? { display: 'flex'} : { display: 'none'}}>
        { props.options.map(option => (
          <div className={selected.value === option.value ? classes.selected : null} key={ option.value } onClick={() => select(option)}>
            { option.icon ? <div className={classes.optionIcon} style={{ backgroundImage: `url(/images/${option.icon})`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%'}}></div> : null }
            <span>{ option.label }</span>
          </div>)
        )}
      </div>
    </div>
  );
};

Select.defaultProps = {
  className: '',
  defaultSelected: null
}

Select.propTypes = {
  onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired,
  defaultSelected: PropTypes.string,
  className: PropTypes.string
}

export default Select;
