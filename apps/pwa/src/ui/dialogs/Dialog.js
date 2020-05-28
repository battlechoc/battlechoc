import React from 'react';
import PropTypes from 'prop-types';
import { Jukebox } from '../misc';
import { createUseStyles } from 'react-jss';
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
    notification: {
        background: 'unset !important',
        position: 'relative',
        '& > div > div ': {
            left: 0,
            bottom: 0,
            top: 'unset',
            padding: 12,
            height: 'calc(100% - 32px)',
            width: 'calc(100% - 24px)'
        }
    },
    info: {
        '& > div > div ': {
            position: 'relative'
        }
    },
    dialog: {
        width: props => props.mode === 'notification' ? '100%' : '80%',
        height: '90%',
        padding: 16,
        position: 'relative',
        top: props => props.mode === 'info' ? '10vh' : 'unset'
    },
    body: {
        borderRadius: props => props.mode === 'notification' ? 0 : 20,
        position: 'absolute',
        top: 12,
        right: 6,
        overflow: 'hidden',
        height: props => props.mode === 'info' ? 'unset' : 'calc(100% - 88px)', // 12px (top) + 2 * 32px (padding) = 88px 
        width: 'calc(100% - 30px)', // 6px (left) + 2 * 12px (padding) = 30px
        padding: '32px 12px',
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        '&:before': {
            content: '""',
            position: 'absolute',
            borderRadius: props => props.mode === 'notification' ? 0 : 20,
            top: 0,
            left: 0,
            zIndex: -1,
            width: '100%',
            height: 'calc(100% - 1px)',
            background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`
        },
        [theme.breakpoints.smartphone]: {
            right: 8,
            width: 'calc(100% - 56px)',
            padding: '32px 24px'
        }
    },
    title: {
        zIndex: 12,
        marginTop: '2vh',
        fontFamily: 'Bangers',
        fontSize: props => (props.autoscale && props.title.length > 7) || ['notification', 'info'].includes(props.mode) ? '5vw' : '8vw',
        display: 'flex',
        textAlign: props => props.mode === 'info' ? 'center' : 'unset',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'white',
        '-webkit-text-stroke': `0.1vw ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        [theme.breakpoints.orientation.portrait]: {
            fontSize: props => (props.autoscale && props.title.length > 7) || ['notification', 'info'].includes(props.mode) ? '6vw' : '8vw',         
        }
    },
    subtitle: {
        zIndex: 12,
        fontFamily: 'Bangers',
        fontSize: '3.5vh',
        color: 'white',
        '-webkit-text-stroke': `1px ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        [theme.breakpoints.orientation.landscape]: {
            fontSize: '3.5vw',
        }
    },
    close: {
        position: 'absolute',
        right: '-2vw',
        top: 0,
        zIndex: 16,
        [theme.breakpoints.orientation.portrait]: {
            right: '-2vh',            
        }
    },
    content: {
        position: 'relative',
        zIndex: 16,
        overflowY: 'auto',
        overflowX: 'hidden',
        height: '75%',
        width: '100%',
        color: 'white',
        display: 'flex',
        justifyContent: 'center',
        fontSize: '3vh',
        textAlign: 'center',
        [theme.breakpoints.smartphone]: {
            width: '80%',
            paddingRight: '5'
        },
        [theme.breakpoints.orientation.landscape]: {
            width: '90%',
            height: '90%',
            fontSize: '3vw',
        }
    },
    border: {
        position: 'absolute',
        zIndex: 12
    },
    top: { 
        top: 0,
        left: 0,
        width: props => props.mode === 'info' ? '50vw' : '80vw',
        height: props => props.mode === 'info' ? '20vh' : '32vh',
        background: 'url(/images/dialog-border-top.svg) no-repeat' 
    },
    left: {
        display: props => ['notification', 'info'].includes(props.mode) ? 'none' : 'block',
        bottom: 0,
        left: 0,
        width: '16vw',
        height: '32vh',
        background: 'url(/images/dialog-border-left.svg) no-repeat',
        backgroundPositionY: 'bottom'
    },
    right: { 
        bottom: 0,
        right: 0,
        width: props => props.mode === 'info' ? '15vw' : '24vw',
        height: props => props.mode === 'info' ? '20vh' : '32vh',
        background: 'url(/images/dialog-border-right.svg) no-repeat',
        backgroundPositionX: 'right',
        backgroundPositionY: 'bottom'
    },
    icon: {
        padding: '4vw',
        marginRight: '1vw',
        marginLeft: '-4vw'
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
        <div className={`${classes.overlay} ${classes[props.mode]}`} style={props.open ? { display: 'flex' } : { display: 'none' }}>
            <div className={classes.dialog}>
                { props.closable ? <Fab className={classes.close} color={ props.mode === 'stacked' ? 'secondary' : 'accent' } icon={ props.mode === 'stacked' ? 'back' : 'close' } onClick={closeDialog} /> : null }
                <div className={classes.body}>
                    <div className={`${classes.border} ${classes.top}`} />
                    <div className={`${classes.border} ${classes.left}`} />
                    <div className={`${classes.border} ${classes.right}`} />
                    <span className={classes.title}>
                        { props.titleSlotBefore }
                        { props.icon ? <span className={classes.icon} style={{ background: `url(/images/${ props.icon }.svg) no-repeat`, backgroundSize: '100% 100%' }} /> : null }
                        { props.title }
                        { props.titleSlotAfter }
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
    close: PropTypes.func,
    closable: PropTypes.bool,
    children: PropTypes.element.isRequired,
    title: PropTypes.string,
    icon: PropTypes.string,
    titleSlotBefore: PropTypes.element,
    titleSlotAfter: PropTypes.element,
    subtitle: PropTypes.string,
    mode: PropTypes.oneOf(['default', 'stacked', 'notification', 'info']),
    autoscale: PropTypes.bool
}

Dialog.defaultProps = {
    closable: true,
    subtitle: null,
    icon: null,
    mode: 'default',
    titleSlotBefore: null,
    titleSlotAfter: null,
    autoscale: false
}

export default Dialog;