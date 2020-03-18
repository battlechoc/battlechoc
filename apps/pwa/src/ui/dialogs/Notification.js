import React, { useState } from 'react';
import { AppBar, Toolbar, IconButton } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Close } from '@material-ui/icons';

const useStyles = makeStyles(() => ({
    root: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        color: 'white',
        position: 'absolute',
        bottom: 0,
        width: '100vw',
        fontSize: '1.4rem',
        '& > span': {
            textShadow: '1px 1px 1px rgba(0,0,0,0.3)',
            background: '#5dbbc3',
            padding: 12
        }
    }, 
    message: {
        background: 'white',
        color: '#5dbbc3',
        fontSize: '1.1rem',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'center'
    }
}));

const Notification = props => {
    const classes = useStyles();
    const [show, setShow] = useState(true);
  
    const onAnimationEnd = () => {
        if (!show) {
            props.close();
        }
    }

    if (props.open) {
        return (
            <div className={classes.root} style={{animation: `${show ? 'fadeIn' : 'fadeOut'} 1s`}} onAnimationEnd={onAnimationEnd}>
                <AppBar position="static" style={{ backgroundColor: '#5dbbc3' }} className="tutorialAppbar">
                    <Toolbar>
                        <h6 className="tutorial-headline">{props.title}</h6>
                        <IconButton onClick={() => setShow(false)}><Close style={{ color: 'white' }} /></IconButton>
                    </Toolbar>
                </AppBar>
                <div className={classes.message}><p>{props.message}</p></div>
            </div>
        );
    } else  {
        return null;
    }
}

export default Notification;