import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';
import { Jukebox } from '../misc';

const useStyles = createUseStyles(theme => ({
    fab: {
      color: 'white',
      width: '7.4vw',
      height: '7.4vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '100%',
      [theme.breakpoints.orientation.portrait]: {
        width: '7.4vh',
        height: '7.4vh' 
      }
    },
    icon: props => {
      const style = {
        width: '60%',
        height: '60%'
      } 

      if (props.icon === 'trophy') {
        style.width = '90%';
        style.height = '90%';
        style.marginTop = 3
      }

      if (props.icon === 'forward' && props.color === 'accent') {
        style.filter = 'brightness(0.8) contrast(2) hue-rotate(190deg)'
      }
      
      return style;
    },
    background: {
      border: props => `0.6vw solid ${theme.color[props.color].light}`,
      background: props => `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${theme.color[props.color].light} 100%)`,
      '&:hover': {
        background: props => `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${theme.color[props.color].light} 150%)`
      },
      [theme.breakpoints.orientation.portrait]: {
        border: props => `0.6vh solid ${theme.color[props.color].light}`
      }
    }
  })
)

const Fab = props => {
  const color = (props.icon === 'facebook' || props.icon === 'instagram') ? props.icon : props.color;
  const classes = useStyles({ ...props, color: color });
  const onClick = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.onClick();
  }
  return (
    <div style={props.style} onClick={onClick} className={`${classes.fab} ${classes.background} ${props.className}`}>
      <div className={classes.icon} style={{ backgroundImage: `url(/images/${ props.icon }.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%' , ...props.iconStyle}} />
    </div>
  );
};

Fab.defaultProps = {
  color: 'primary',
  style: {},
  iconStyle: {},
  icon: 'settings',
  className: ''
}

Fab.propTypes = { 
  color: PropTypes.oneOf(['primary', 'secondary', 'accent', 'facebook', 'instagram', 'gold']),
  icon: PropTypes.oneOf(['search', 'info', 'forward', 'backward', 'fast-forward', 'fast-backward', 'settings', 'mute', 'volume', 'facebook', 'instagram', 'fullscreen', 'user', 'close', 'trophy', 'back', 'share', 'refresh']),
  iconStyle: PropTypes.object,
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
  style: PropTypes.object
}

export default Fab;
