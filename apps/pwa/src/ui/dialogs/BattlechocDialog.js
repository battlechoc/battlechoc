import React from 'react';
import PropTypes from 'prop-types';
import { Jukebox } from '../misc';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import { makeStyles } from '@material-ui/core/styles';
import Fab from '@material-ui/core/Fab';
import { KeyboardArrowLeft as ArrowBackIcon } from '@material-ui/icons';

const useStyles = makeStyles(theme => ({
    header: {
        backgroundColor: '#324D5C',
        boxShadow: '1px 1px 6px #000',
        color: 'white',
        userSelect: 'none',
        textShadow: '1px 1px 3px #000',
        padding: '8px'
    },
    headline: {
        marginLeft: '5vw'
    }
}));

function debounce(fn, ms) {
    let timer
    return _ => {
        clearTimeout(timer)
        timer = setTimeout(_ => {
            timer = null
            fn.apply(this, arguments)
        }, ms)
    };
}

const BattlechocDialog = props =>  {
    const classes = useStyles();
    const closeDialog = () => {
        if (props.closable) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            props.close();
        }
    }

    const [dimensions, setDimensions] = React.useState({ 
        height: window.innerHeight,
        width: window.innerWidth
    });

    React.useEffect(() => {
        const debouncedHandleResize = debounce(function handleResize() {
            setDimensions({
                height: window.innerHeight,
                width: window.innerWidth
            })
        }, 200);
        window.addEventListener('resize', debouncedHandleResize)
        return _ => { window.removeEventListener('resize', debouncedHandleResize) }
    });

    let displayTitle = true;
    if (props.autoHideTitle && dimensions.height < 100) {
        displayTitle = false;
    }

    return (
        <Dialog
            fullWidth={true}
            fullScreen={true}
            open={props.open}
            PaperProps={{style: {
              background: 'linear-gradient(0deg, rgba(255,255,255,1) 0%, rgba(252,238,228,1) 98%)'
            }}}
            onClose={closeDialog}>
            { displayTitle ? <DialogTitle className={classes.header}>
                { props.closable ? <Fab color="primary" size="small" onClick={closeDialog}><ArrowBackIcon /></Fab> : null }
                <span className={classes.headline}>{props.title}</span>
            </DialogTitle> : null }
            <DialogContent style={ displayTitle ? null : {
                paddingTop: 0,
                '& > :first-child': { padding: 0 }
            }}>
                {props.children}
            </DialogContent>
        </Dialog>
    );
}

BattlechocDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    close: PropTypes.func.isRequired,
    closable: PropTypes.bool,
    autoHideTitle: PropTypes.bool,
    children: PropTypes.element.isRequired,
    title: PropTypes.string.isRequired
}

BattlechocDialog.defaultProps = {
    closable: true,
    autoHideTitle: false
}

export default BattlechocDialog;