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
      borderRadius: 12,
      width: '100%',
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      fontSize: '2rem',
      height: 42,
      background: 'white',
      border: `3px solid ${theme.color.secondary.light}`
    },
    dropdown: {
      border: `3px solid ${theme.color.secondary.light}`,
      borderRadius: 12,
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
      height: 42,
      width: 42,
      position: 'absolute',
      top: 0,
      right: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    options: {
      position: 'absolute',
      top: 48,
      zIndex: 15,
      width: 'calc(100% - 6px)',
      flexDirection: 'column',
      border: `3px solid ${theme.color.secondary.light}`,
      background: 'white',
      borderRadius: 12,
      fontFamily: 'Bangers',
      '& > div': {
        padding: '12px 0',
        borderBottom: `3px solid ${theme.color.secondary.light}`,
        display: 'flex',
        color: theme.color.secondary.dark,
        alignItems: 'center',
        fontSize: '1.5rem',
        justifyContent: 'flex-start'
      },
      '& > div:last-child': {
        border: '0px',
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6
      },
      '& > div:first-child': {
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6
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
      height: 25,
      width: 42,
      margin: '0 6px'
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
        <span style={ selected.icon ? { marginLeft: 6 } : null }>{ selected.label }</span>
      </div>
      <div onClick={() => setVisible(true)} className={classes.dropdown}>
        <div className={classes.icon} style={{ background: 'url(/images/arrow-down.svg) no-repeat', backgroundSize: '100% 100%'}}></div>
      </div>
      <div ref={options} className={classes.options} style={visible ? { display: 'flex'} : { display: 'none'}}>
        { props.options.map(option => (
          <div className={selected.value === option.value ? classes.selected : null} key={ option.value } onClick={() => select(option)}>
            { option.icon ? <div className={classes.optionIcon} style={{ backgroundImage: `url(/images/${option.icon})`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%'}}></div> : null }
            <span style={ option.icon ? { marginLeft: 12 } : null }>{ option.label }</span>
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
