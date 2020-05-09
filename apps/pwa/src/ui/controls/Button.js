import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    button: {
      color: 'white',
      '-webkit-text-stroke': props => `1px ${theme.color[props.color].dark}`,
      '-webkit-font-smoothing': 'antialiased',
      width: 'calc(100% - 6px) !important',
      height: 'calc(100% - 6px) !important',
      clipPath: 'url(#menu-button-clip-path)',
      position: 'absolute',
      top: 3,
      left: 3,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Bangers'
    },
    iconButton: props => ({
      color: 'white',
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12.5%',
      border: `3px solid ${theme.color[props.color].light}`
    }),
    icon: props => {
      return props.icon === 'trophy' ? {
        width: '90%',
        height: '90%',
        marginTop: 3
      } : {
        width: '60%',
        height: '60%'
      }        
    },
    border: props => ({
      cursor: 'pointer',
      clipPath: 'url(#menu-button-clip-path)',
      position: 'relative',
      background: theme.color[props.color].light
    }),
    background: props => ({
      background: `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${theme.color[props.color].light} 70%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${theme.color[props.color].light} 120%)`
      }
    }),
    huge: {
      fontSize: '2.5rem',
      width: 252,
      height: 68,
      [theme.breakpoints.landscape.smartphone]: {
        fontSize: '1.5rem',
        width: 246,
        height: 62,
      }
    },
    normal: {
      fontSize: '1.5rem',
      width: 246,
      height: 62,
    },
    disabled: {
      filter: 'grayscale(1)'
    }
  })
)

const Button = props => {
  const classes = useStyles(props);
  if (props.icon) {
    return (
      <div style={props.style} onClick={props.onClick} className={`${classes.iconButton} ${classes.background} ${props.className} ${props.disabled ? classes.disabled : ''}`}>
        <div className={classes.icon} style={{ background: `url(/images/${ props.icon }.svg) no-repeat`, backgroundSize: '100% 100%', ...props.buttonStyle }} />
      </div>
    );
  } else {
    return (
      <div style={props.style} onClick={props.onClick} className={`${classes.border} ${classes[props.size]} ${props.className} ${props.disabled ? classes.disabled : ''}`}>
        <div style={props.buttonStyle} className={`${classes.background} ${classes[props.size]} ${classes.button}`}>{props.children}</div>
      </div>
    );
  }
};

Button.defaultProps = {
  color: 'primary',
  size: 'normal',
  style: {},
  buttonStyle: {},
  className: '',
  disabled: false
}

Button.propTypes = { 
  color: PropTypes.oneOf(['primary', 'secondary', 'accent']),
  onClick: PropTypes.func.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  buttonStyle: PropTypes.object,
  size: PropTypes.oneOf(['huge', 'normal']),
  disabled: PropTypes.bool
}

export default Button;
