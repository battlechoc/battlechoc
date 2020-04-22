import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles, useTheme } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    button: {
      color: 'white',
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
    border: {
      cursor: 'pointer',
      clipPath: 'url(#menu-button-clip-path)',
      position: 'relative'
    },
    primary: {
      background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 70%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color.primary.light} 0%, ${theme.color.primary.dark} 70%)`
      }
    },
    secondary: {
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color.secondary.light} 0%, ${theme.color.secondary.dark} 70%)`
      }
    },
    accent: {
      background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%)`,
      '&:hover': {
        background: `linear-gradient(0deg, ${theme.color.accent.light} 0%, ${theme.color.accent.dark} 70%)`
      }
    },
    huge: {
      fontSize: '2.5rem',
      width: 252,
      height: 68,
    },
    normal: {
      fontSize: '1.5rem',
      width: 246,
      height: 62,
    }
  })
)

const Button = props => {
  const classes = useStyles(props);
  const theme = useTheme();
  return (
    <div onClick={props.onClick} className={`${classes.border} ${classes[props.size]} ${props.className}`} style={{ background: theme.color[props.color].light }}>
      <div className={`${classes[props.color]} ${classes[props.size]} ${classes.button}`}>{props.children}</div>
    </div>
  );
};

Button.defaultProps = {
  color: 'primary',
  size: 'normal',
  className: ''
}

Button.propTypes = { 
  color: PropTypes.oneOf(['primary', 'secondary', 'accent']),
  onClick: PropTypes.func.isRequired,
  className: PropTypes.string,
  size: PropTypes.oneOf(['huge', 'normal'])
}

export default Button;
