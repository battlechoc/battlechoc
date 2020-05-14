import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import AddBox from '@material-ui/icons/AddBox';
import ScreenRotation from '@material-ui/icons/ScreenRotation';
import SvgIcon from '@material-ui/core/SvgIcon';
import { createUseStyles } from 'react-jss';
import { Fab } from '../controls';

const useStyles = createUseStyles(theme => ({
    message: {
        color: 'white',
        margin: 12,
        padding: 6,
        display: 'flex',
        borderRadius: 12,
        alignItems: 'flex-start',
        border: props => {
            if (props.variant === 'error') {
                return `3px solid ${theme.color.accent.light}`;
            } else if (props.variant === 'warning') {
                return `3px solid ${theme.color.warning.light}`;
            } else {
                return `3px solid ${theme.color.secondary.light}`;
            }
        },
        background: props => {
            if (props.variant === 'error') {
                return `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`;
            } else if (props.variant === 'warning') {
                return `linear-gradient(0deg, ${theme.color.warning.dark} 0%, ${theme.color.warning.light} 100%)`;
            } else {
                return `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`;
            }
        }
    },
    icon: {
        margin: '12px 6px',
        '& > div': {
            padding: 18,
            backgroundSize: '100% 100%',
        } 
    },
    info: {
        '& > div': {
            background: `url(/images/info-icon.svg) no-repeat`
        }
    },
    error: {
        '& > div': {
            background: `url(/images/error-icon.svg) no-repeat`
        }
    },
    warning: {
        '& > div': {
            background: `url(/images/warning-icon.svg) no-repeat`
        }
    },
    actions: {
        margin: '12px 6px',
        padding: 6,
        '& > div': {
            padding: 12,
            background: props => {
                if (props.variant === 'error') {
                    return `url(/images/close.svg) no-repeat`;
                } else if (props.variant === 'warning') {
                    return `url(/images/warning-close.svg) no-repeat`;
                } else {
                    return `url(/images/secondary-close.svg) no-repeat`;
                }
            },
            backgroundSize: '100% 100%',
        }
    },
    text: {
        margin: '12px 6px',
        alignSelf: 'center'
    },
    invisible: {
        transition: 'opacity 1s ease-out',
        opacity: 0,
    },
    visible: {
        opacity: 1,
    }
}));

const QuickMessage = props => {
    const classes = useStyles(props);
    const [visible, setVisible] = useState(true);
    let { message, onClose, variant, autoHideDuration } = props;

    if (variant === 'apple-pwa-hint') {
        variant = 'info';
        const share = <SvgIcon fontSize="small"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" enableBackground="new 0 0 50 50"><meta name="license" content="https://commons.wikimedia.org/wiki/Category:Expat/MIT_License" /><meta name="copyright" content="Copyright © 2014 Alexander Madyankin, Roman Shamin" /><path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/><path d="M24 7h2v21h-2z"/><path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/></svg></SvgIcon>
        message = <span>
            {message.substring(0, message.indexOf('[0]'))}
            <ScreenRotation />
            {message.substring(message.indexOf('[0]') + 3, message.indexOf('[1]'))}
            {share}
            {message.substring(message.indexOf('[1]') + 3, message.indexOf('[2]'))}
            <AddBox />
            {message.substring(message.indexOf('[2]') + 3)}
        </span>;
    }

    const close = useCallback(() => {
        if (visible) {
            setVisible(false);
            setTimeout(onClose, 1000);
        }
    }, [onClose, visible])

    useEffect(() => {
        if (autoHideDuration > 0) {
            const timeout = setTimeout(close, autoHideDuration);
            return () => {
                clearTimeout(timeout);
            }
        }
    }, [autoHideDuration, close]);

    return (
        <div className={`${visible ? classes.visible : classes.invisible} ${classes.message}`}>
            <div className={`${classes[props.variant]} ${classes.icon}`}>
                <div />
            </div>    
            <div className={classes.text}>{message}</div>
            <div className={classes.actions}>
                <div onClick={close} />
            </div>
        </div>
    );
}

QuickMessage.propTypes = {
    open: PropTypes.bool.isRequired,
    autoHideDuration: PropTypes.number,
    message: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    variant: PropTypes.oneOf(['error', 'info', 'success', 'warning', 'apple-pwa-hint']),
};

QuickMessage.defaultProps = {
    variant: 'warning',
    autoHideDuration: 4000,
    messageId: 0
}

export default QuickMessage;