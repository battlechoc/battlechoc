import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';
import { Jukebox } from '../misc';

const useStyles = createUseStyles(theme => ({
    button: {
      color: 'white',
      '-webkit-text-stroke': props => `1px ${theme.color[props.color].dark}`,
      '-webkit-font-smoothing': 'antialiased',
      width: 'calc(100% - 1.2vw) !important',
      height: 'calc(100% - 1.2vw) !important',
      clipPath: 'url(#menu-button-clip-path)',
      position: 'absolute',
      top: '0.6vw',
      left: '0.6vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Bangers',
      [theme.breakpoints.orientation.portrait]: {
        top: '0.6vh',
        left: '0.6vh',
        width: 'calc(100% - 1.2vh) !important',
        height: 'calc(100% - 1.2vh) !important',
      }
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
      [theme.breakpoints.orientation.portrait]: {
        fontSize: '5vh',
        width: '35vh',
        height: '8.75vh',
      },
      [theme.breakpoints.orientation.landscape]: {
        fontSize: '7.5vh',
        width: '45vh',
        height: '11.25vh',        
      },
    },
    normal: {
      [theme.breakpoints.orientation.portrait]: {
        fontSize: '4.5vh',
        width: '31.5vh',
        height: '7.875vh',
      },
      [theme.breakpoints.orientation.landscape]: {
        fontSize: '6.75vh',
        width: '40.5vh',
        height: '10.125vh',        
      },
    },
    small: {
      fontSize: '1.5rem',
      width: 140,
      height: 50,
    },
    disabled: {
      filter: 'grayscale(1)',
      ['& $huge']: {
        fontSize: '4vh',
        [theme.breakpoints.orientation.landscape]: {
          fontSize: '6vh'
        }
      }
    },
    locked: {
      position: 'absolute',
      right: '2vh',
      top: '1.5vh',
      transform: 'rotate(-15deg)',
      padding: '2.2vh',
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      backgroundImage: 'url(/images/lock.svg)',
      [theme.breakpoints.orientation.landscape]: {
        right: '3vh',
        top: '2.5vh',
        padding: '2.4vh'
      }
    }
  })
);

const Button = props => {
  const classes = useStyles(props);
  const onClick = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.onClick();
  }

  if (props.icon) {
    return (
      <div style={props.style} onClick={onClick} className={`${classes.iconButton} ${classes.background} ${props.className} ${props.disabled ? classes.disabled : ''}`}>
        <div className={classes.icon} style={{ backgroundImage: `url(/images/${ props.icon }.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', ...props.buttonStyle }} />
      </div>
    );
  } else {
    return (
      <div style={props.style} onClick={onClick} className={`${classes.border} ${classes[props.size]} ${props.className} ${props.disabled || props.locked ? classes.disabled : ''}`}>
        <div style={props.buttonStyle} className={`${classes.background} ${classes[props.size]} ${classes.button}`}>{props.children}</div>
        {props.locked ? <div className={classes.locked} /> : null}
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
