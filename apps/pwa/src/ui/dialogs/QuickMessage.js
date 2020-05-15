import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';

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
            } else if (props.variant === 'success') {
                return `3px solid ${theme.color.primary.light}`;
            }  else {
                return `3px solid ${theme.color.secondary.light}`;
            }
        },
        background: props => {
            if (props.variant === 'error') {
                return `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`;
            } else if (props.variant === 'success') {
                return `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`;
            }  else if (props.variant === 'warning') {
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
    success: {
        '& > div': {
            background: `url(/images/success-icon.svg) no-repeat`
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
                } else if (props.variant === 'success') {
                    return `url(/images/primary-close.svg) no-repeat`;
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
    },
    rotate: {
        padding: 10,
        margin: 4,
        background: `url(/images/phone-rotation.svg) no-repeat`,
        backgroundSize: '100% 100%',
    },
    share: {
        padding: 8,
        margin: 4,
        background: `url(/images/apple-share-icon.svg) no-repeat`,
        backgroundSize: '100% 100%',
    },
    add: {
        padding: 10,
        margin: 4,
        background: `url(/images/add-icon.svg) no-repeat`,
        backgroundSize: '100% 100%',
    }
}));

const QuickMessage = props => {
    const classes = useStyles(props);
    const [visible, setVisible] = useState(true);
    let { message, onClose, variant, autoHideDuration } = props;

    if (variant === 'apple-pwa-hint') {
        variant = 'info';
        message = <span>
            {message.substring(0, message.indexOf('[0]'))}
            <span className={classes.rotate} />
            {message.substring(message.indexOf('[0]') + 3, message.indexOf('[1]'))}
            <span className={classes.share} />
            {message.substring(message.indexOf('[1]') + 3, message.indexOf('[2]'))}
            <span className={classes.add} />
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
            <div className={`${classes[variant]} ${classes.icon}`}>
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