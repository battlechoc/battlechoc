import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss'

const useStyles = createUseStyles(theme => ({
    fab: {
      color: 'white',
      width: 42,
      height: 42,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '100%'
    },
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
    background: props => ({
      border: `3px solid ${theme.color[props.color].light}`,
      background: `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${theme.color[props.color].light} 100%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${theme.color[props.color].light} 150%)`
      }
    })
  })
)

const Fab = props => {
  const color = (props.icon === 'facebook' || props.icon === 'instagram') ? props.icon : props.color;
  const classes = useStyles({ ...props, color: color });
  return (
    <div style={props.style} onClick={props.onClick} className={`${classes.fab} ${classes.background} ${props.className}`}>
      <div className={classes.icon} style={{ background: `url(/images/${ props.icon }.svg) no-repeat`, backgroundSize: '100% 100%' , ...props.iconStyle}} />
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
