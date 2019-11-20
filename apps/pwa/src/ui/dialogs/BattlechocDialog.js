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
        textShadow: '1px 1px 3px #000',
        padding: '8px'
    },
    headline: {
        marginLeft: '5vw'
    }
}));

const BattlechocDialog = props =>  {
    const classes = useStyles();
    const closeDialog = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        props.close();
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
            <DialogTitle className={classes.header}>
                <Fab color="primary" size="small" onClick={closeDialog}><ArrowBackIcon /></Fab>
                <span className={classes.headline}>{props.title}</span>
            </DialogTitle>
            <DialogContent>
                {props.children}
            </DialogContent>
        </Dialog>
    );
}

BattlechocDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired,
  children: PropTypes.element.isRequired,
  title: PropTypes.string.isRequired
}

export default BattlechocDialog;