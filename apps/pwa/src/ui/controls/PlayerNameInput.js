import React, { useState } from 'react';
import { axios } from '../../helper/settings';
import Axios from 'axios';
import { makeStyles } from '@material-ui/core/styles';
import withWidth, { isWidthUp } from '@material-ui/core/withWidth';
import { Send, HourglassFull } from '@material-ui/icons';
import { Fab, TextField, CircularProgress } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'center',
  },
  wrapper: {
    margin: theme.spacing(1),
    position: 'relative',
  },
  buttonSuccess: {
    backgroundColor: '#457B82',
    '&:hover': {
      backgroundColor: '#324D5C',
    },
  },
  fabProgress: {
    color: '#324D5C',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  playerNameInput: {
    width: '100%'
  }
}));

export default withWidth()(props => {
    const classes = useStyles();
    const [loading, setLoading] = useState(false);
    const [playerNameValid, setPlayerNameValid] = useState(false);
    const [playerNameAvailable, setPlayerNameAvailable] = useState(false);
    const [playerName, setPlayerName] = useState(typeof props.current === 'undefined' ? 'Chocnonymous' : props.current);

    const buttonClassname = playerNameAvailable ? classes.buttonSuccess : null;

    const CancelToken = Axios.CancelToken;
    const source = CancelToken.source();

    const checkAvailable = name => {
        if (name !== '') {
            if (loading) {
                source.cancel();
            }

            setLoading(true);
            axios.get('/check/available/' + name, {cancelToken: source.token})
            .then(response => {
                setPlayerNameAvailable(response.data.available);
                setLoading(false);
            })
            .catch(error => {
                if (!Axios.isCancel(error)) {
                    console.warn(error);
                    setPlayerNameAvailable(false);
                }
                setLoading(false);
            });
        }
    }

    const validate = name => {
        let regex = /^([a-zA-Z][a-zA-Z0-9_]{3,15})$/;
        return regex.test(name) && name.toUpperCase() !== 'CHOCNONYMOUS';
    }

    const handleButtonClick = () => {
        if (playerNameAvailable && playerNameValid && !loading) {
            props.setPlayerName(playerName);
        }
    };

    const getHelperText = () => {
        if (loading) {
            return '';
        } else if (!playerNameAvailable) {
            return 'username already in use';
        } else if (!playerNameValid) {
            return 'username not valid (3-15 chars or digits, first sign should be a char)';
        } else {
            return '';
        }
    }

    return (
        <div className={classes.root}>
            <TextField
                label="Name"
                className={classes.playerNameInput}
                error={!playerNameAvailable || !playerNameValid}
                value={playerName}
                helperText={getHelperText()}
                inputProps={{ spellCheck: 'false' }}
                onChange={event => {
                    setPlayerName(event.target.value);
                    setPlayerNameAvailable(false);
                    setPlayerNameValid(false);
                    checkAvailable(event.target.value);
                    setPlayerNameValid(validate(event.target.value));
                }}
                margin="normal"
            />    
            <div className={classes.wrapper}>
                <Fab
                  disabled={loading || !playerNameAvailable || !playerNameValid}
                  aria-label="send"
                  color="primary"
                  size="small"
                  className={buttonClassname}
                  onClick={handleButtonClick}
                >
                  {loading ? <HourglassFull /> :  <Send />}
                </Fab>
                {loading && <CircularProgress size={isWidthUp('md', props.width) ? 48 : 40} className={classes.fabProgress} />}
            </div>
        </div>
    );
});