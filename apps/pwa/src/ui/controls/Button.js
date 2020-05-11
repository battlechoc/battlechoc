import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';
import { Jukebox } from '../misc';

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
      const style = {
        width: '60%',
        height: '60%'
      }
      if (props.icon === 'trophy') {
        style.width = '90%';
        style.height = '90%';
        style.marginTop = 3;
      }

      if (props.icon === 'backward' && props.color === 'accent') {
        style.filter = 'brightness(0.8) contrast(2) hue-rotate(190deg)'
      }
      
      return style;
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
    small: {
      fontSize: '1.5rem',
      width: 140,
      height: 50,
    },
    disabled: {
      filter: 'grayscale(1)'
    },
    locked: {
      position: 'absolute',
      right: 24,
      top: 5,
      transform: 'rotate(-15deg)',
      padding: 20,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      backgroundImage: 'url(/images/lock.svg)'
    }
  })
)

const Button = props => {
  const classes = useStyles(props);
  const onClick = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.onClick();
  }

  if (props.icon) {
    return (
      <div style={props.style} onClick={onClick} className={`${classes.iconButton} ${classes.background} ${props.className} ${props.disabled ? classes.disabled : ''}`}>
        <div className={classes.icon} style={{ background: `url(/images/${ props.icon }.svg) no-repeat`, backgroundSize: '100% 100%', ...props.buttonStyle }} />
      </div>
    );
  } else {
    return (
      <div style={props.style} onClick={onClick} className={`${classes.border} ${classes[props.size]} ${props.className} ${props.disabled || props.locked ? classes.disabled : ''}`}>
        <div style={props.buttonStyle} className={`${classes.background} ${classes[props.size]} ${classes.button}`}>{props.children} {props.locked ? <div className={classes.locked} /> : null}</div>
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
  locked: false,
  disabled: false
}

Button.propTypes = { 
  color: PropTypes.oneOf(['primary', 'secondary', 'accent']),
  onClick: PropTypes.func.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  buttonStyle: PropTypes.object,
  size: PropTypes.oneOf(['huge', 'normal', 'small']),
  disabled: PropTypes.bool,
  locked: PropTypes.bool
}

export default Button;
