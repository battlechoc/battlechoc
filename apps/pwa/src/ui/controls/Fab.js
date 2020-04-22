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
    icon: {
      width: '60%',
      height: '60%'
    },
    primary: {
      border: `3px solid ${theme.color.primary.light}`,
      background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color.primary.light} 0%, ${theme.color.primary.dark} 100%)`
      }
    },
    secondary: {
      border: `3px solid ${theme.color.secondary.light}`,
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color.secondary.light} 0%, ${theme.color.secondary.dark} 100%)`
      }      
    },
    accent: {
      border: `3px solid ${theme.color.accent.light}`,
      background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color.accent.light} 0%, ${theme.color.accent.dark} 100%)`
      }      
    },
    facebook: {
      border: '3px solid #6589F4',
      background: 'linear-gradient(0deg, #435DAC 0%, #6589F4 100%)',
      '&:hover': {
        background: 'linear-gradient(0deg, #6589F4 0%, #435DAC 100%)'
      }  
    },
    instagram: {
      border: '3px solid #FE5A93',
      background: 'linear-gradient(0deg, #803FBB 0%, #FE5A93 100%)',
      '&:hover': {
        background: 'linear-gradient(0deg, #FE5A93 0%, #803FBB 100%)'
      }       
    }
  })
)

const Fab = props => {
  const classes = useStyles(props);
  const color = (props.icon === 'facebook' || props.icon === 'instagram') ? props.icon : props.color;
  return (
    <div onClick={props.onClick} className={`${classes.fab} ${classes[color]} ${props.className}`}>
      <div className={classes.icon} style={{ background: `url(/images/${ props.icon }.svg) no-repeat`, backgroundSize: '100% 100%' }} />
    </div>
  );
};

Fab.defaultProps = {
  color: 'primary',
  icon: 'settings',
  className: ''
}

Fab.propTypes = { 
  color: PropTypes.oneOf(['primary', 'secondary', 'accent', 'facebook', 'instagram']),
  icon: PropTypes.oneOf(['info', 'settings', 'mute', 'volume', 'facebook', 'instagram', 'fullscreen', 'user', 'close']),
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired
}

export default Fab;
