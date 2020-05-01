import React from 'react';
import PropTypes from 'prop-types';
import { Jukebox } from '../misc';
import { createUseStyles } from 'react-jss'
import Fab from '../controls/Fab';

const useStyles = createUseStyles(theme => ({
    overlay: {
        background: 'rgba(0, 0, 0, 0.85)',
        height: '100%',
        width: '100%',
        zIndex: 10,
        top: 0,
        left: 0,
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center'
    },
    stacked: {
        background: 'unset !important',
        zIndex: 20
    },
    dialog: {
        width: '80%',
        height: '90%',
        padding: 16,
        position: 'relative'
    },
    body: {
        borderRadius: 20,
        position: 'absolute',
        top: 12,
        right: 6,
        overflow: 'hidden',
        height: 'calc(100% - 88px)', // 12px (top) + 2 * 32px (padding) = 88px 
        width: 'calc(100% - 30px)', // 6px (left) + 2 * 12px (padding) = 30px
        padding: '32px 12px',
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        '&:before': {
            content: '""',
            position: 'absolute',
            borderRadius: 20,
            top: 0,
            left: 0,
            zIndex: -1,
            width: '100%',
            height: 'calc(100% - 1px)',
            background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`
        },
        [theme.breakpoints.smartphone]: {
            top: 12,
            right: 8,
            overflow: 'hidden',
            height: 'calc(100% - 88px)', // 12px (top) + 2 * 32px (padding) = 88px 
            width: 'calc(100% - 56px)',
            padding: '32px 24px'
        }
    },
    title: props => {
        let fontSize = '2.5rem';
        if (props.autoscale && props.title.length > 7) {
            fontSize = '1.7rem';
        }

        return { 
            zIndex: 12,
            fontFamily: 'Bangers',
            fontSize: fontSize,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            padding: '12px 0',
            '-webkit-text-stroke': `1px ${theme.color.secondary.dark}`,
            '-webkit-font-smoothing': 'antialiased'
        }
    },
    subtitle: {
        zIndex: 12,
        fontFamily: 'Bangers',
        fontSize: '1.2rem',
        color: 'white',
        margin: '-12px 0px 12px 0px',
        '-webkit-text-stroke': `1px ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased'
    },
    close: {
        position: 'absolute',
        right: 0,
        top: 0,
        zIndex: 16
    },
    content: {
        overflowY: 'auto',
        overflowX: 'hidden',
        height: '75%',
        width: '100%',
        color: 'white',
        display: 'flex',
        justifyContent: 'center',
        [theme.breakpoints.smartphone]: {
            width: '80%',
            paddingRight: '5'
        }
    },
    border: {
        position: 'absolute',
        zIndex: 12
    },
    top: { 
        top: 0,
        left: 0,
        width: 267,
        height: 107,
        background: 'url(/images/dialog-border-top.svg) no-repeat' 
    },
    left: {
        bottom: 0,
        left: 0,
        width: 133,
        height: 135,
        background: 'url(/images/dialog-border-left.svg) no-repeat' 
    },
    right: { 
        bottom: 0,
        right: 0,
        width: 133,
        height: 71,
        background: 'url(/images/dialog-border-right.svg) no-repeat' 
    },
    icon: {
        width: 42,
        height: 42,
        marginLeft: -12
    }
}));

const Dialog = props =>  {
    const classes = useStyles(props);
    const closeDialog = () => {
        if (props.closable) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            props.close();
        }
    }

    return (
        <div className={`${classes.overlay} ${props.stacked ? classes.stacked : ''}`} style={props.open ? { display: 'flex' } : { display: 'none' }}>
            <div className={classes.dialog}>
                { props.closable ? <Fab className={classes.close} color={ props.stacked ? 'secondary' : 'accent' } icon={ props.stacked ? 'back' : 'close' } onClick={closeDialog} /> : null }
                <div className={classes.body}>
                    <div className={`${classes.border} ${classes.top}`} />
                    <div className={`${classes.border} ${classes.left}`} />
                    <div className={`${classes.border} ${classes.right}`} />
                    <span className={classes.title}>
                        { props.icon ? <span className={classes.icon} style={{ marginRight: 12, background: `url(/images/${ props.icon }.svg) no-repeat`, backgroundSize: '100% 100%' }} /> : null }
                        { props.title }
                        { props.titleSlot }
                    </span>
                    { props.subtitle ? <span className={classes.subtitle}>{ props.subtitle }</span> : null }
                    <div className={classes.content}>{ props.children }</div>
                </div>
            </div>
        </div>
    );
}

Dialog.propTypes = {
    open: PropTypes.bool.isRequired,
    close: PropTypes.func.isRequired,
    closable: PropTypes.bool,
    children: PropTypes.element.isRequired,
    title: PropTypes.string,
    icon: PropTypes.string,
    titleSlot: PropTypes.element,
    subtitle: PropTypes.string,
    stacked: PropTypes.bool,
    autoscale: PropTypes.bool
}

Dialog.defaultProps = {
    closable: true,
    subtitle: null,
    icon: null,
    stacked: false,
    titleSlot: null,
    autoscale: false
}

export default Dialog;