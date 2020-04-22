import React, { useState } from 'react';
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
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: '2rem',
      height: 42,
      background: 'white',
      border: `3px solid ${theme.color.secondary.light}`,
      '& > span': {
        marginLeft: -21
      }
    },
    dropdown: {
      border: `3px solid ${theme.color.secondary.light}`,
      borderRadius: 12,
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
      height: 42,
      width: 42,
      position: 'absolute',
      top: 0,
      right: 0
    },
    options: {
      position: 'absolute',
      top: 48,
      zIndex: 15,
      width: 'calc(100% - 6px)',
      flexDirection: 'column',
      border: `3px solid ${theme.color.secondary.light}`,
      borderRadius: 12,
      fontFamily: 'Bangers',
      '& > div': {
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        padding: '10px 0',
        borderBottom: `1px solid solid ${theme.color.secondary.light}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      },
      '& > div:last-child': {
        border: '0px',
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12
      },
      '& > div:first-child': {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12
      }
    }
  })
);

const Select = props => {
  const [ selected, setSelected ] = useState(props.options[0]);
  const [ visible, setVisible ] = useState(false);
  const classes = useStyles(props);

  const select = option => {
    if (option.value !== selected.value) {
      setSelected(option);
      props.onChange(option.value);
    }
    setVisible(false);
  }

  return (
    <div className={`${classes.wrapper} ${props.className}`}>
      <div className={classes.input}><span>{ selected.label }</span></div>
      <div onClick={() => setVisible(true)} className={classes.dropdown}></div>
      <div className={classes.options} style={visible ? { display: 'flex'} : { display: 'none'}}>
        { props.options.map(option => <div onClick={() => select(option)}>{ option.label }</div>) }
      </div>
    </div>
  );
};

Select.defaultProps = {
  className: ''
}

Select.propTypes = {
  onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired,
  className: PropTypes.string
}

export default Select;
