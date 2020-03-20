import React, { useState, useEffect, useRef } from 'react';
import { ServerRequest } from '../../helper/settings';
import { translate as t, keys as tr } from '../misc';
import Axios from 'axios';
import { makeStyles } from '@material-ui/core/styles';
import withWidth, { isWidthUp } from '@material-ui/core/withWidth';
import { Send, HourglassFull } from '@material-ui/icons';
import { Fab, TextField, CircularProgress } from '@material-ui/core';
import logger from '../../helper/logger';
import { NoHealthyInternetConnectionError } from 'battlechoc-shared-functions';

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
    const { setPlayerName, current, width } = props;
    const [loading, setLoading] = useState(false);
    const [playerNameValid, setPlayerNameValid] = useState(false);
    const [playerNameAvailable, setPlayerNameAvailable] = useState(false);
    const [playerName, updatePlayerName] = useState(typeof current === 'undefined' ? 'Chocnonymous' : current);
    const [unchanged, setUnchanged] = useState(current === playerName);
    const [badInternetConnection, setBadInternetConnection] = useState(false);

    const buttonClassname = playerNameAvailable ? classes.buttonSuccess : null;

    const source = useRef(Axios.CancelToken.source());
    const [requestRunning, setRequestRunning] = useState(false);
    const [requestTimeout, setRequestTimeout] = useState(null);

    useEffect(() => {
        setUnchanged(playerName === current)
        if (playerName !== '' && playerName !== current) {
            setPlayerNameValid(validate(playerName));
            setPlayerNameAvailable(true);

            clearTimeout(requestTimeout);
            if (requestRunning) {
                source.current.cancel();
            }
        
            setLoading(true);
            setRequestTimeout(setTimeout( async () => {
                source.current = Axios.CancelToken.source()
                
                try {
                    setRequestRunning(true);
                    let response = await ServerRequest('get', '/check/available/' + playerName, source.current.token);
                    setPlayerNameAvailable(response.data.available);
                    setBadInternetConnection(false);
                } catch(error) {
                    if (error instanceof NoHealthyInternetConnectionError || error.code === 'auth/network-request-failed') {
                        setBadInternetConnection(true);
                    } else if (!Axios.isCancel(error)) {
                        logger.warn(error);
                    }
                } finally {
                    setRequestRunning(false);
                    setLoading(false);
                }
            }, 500));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playerName])

    const validate = name => {
        let regex = /^([a-zA-Z][a-zA-Z0-9_]{2,15})$/;
        return regex.test(name) && name.toUpperCase() !== 'CHOCNONYMOUS';
    }

    const handleButtonClick = () => {
        if (playerNameAvailable && playerNameValid && !loading) {
            setPlayerName(playerName);
        }
    };

    const getHelperText = () => {
        if (loading || unchanged) {
            return '';
        } else if (badInternetConnection) {
            return t(tr.NO_HEALTHY_INTERNET);
        } else if (!playerNameAvailable) {
            return t(tr.SETTINGS_PLAYER_NAME_IN_USE);
        } else if (!playerNameValid) {
            return t(tr.SETTINGS_PLAYER_NAME_INVALID);
        } else {
            return '';
        }
    }

    return (
        <div className={classes.root}>
            <TextField
                label="Name"
                className={classes.playerNameInput}
                error={(!playerNameAvailable || !playerNameValid || badInternetConnection) && !unchanged}
                value={playerName}
                helperText={getHelperText()}
                inputProps={{ spellCheck: 'false', autoFocus: true, style: { color: '#324D5C'} }}
                InputLabelProps={{ style: {color: 'rgb(48, 86, 91)'}}}
                onChange={event => {
                    updatePlayerName(event.target.value);
                }}
                margin="normal"
            />    
            <div className={classes.wrapper}>
                <Fab
                  disabled={loading || !playerNameAvailable || !playerNameValid || unchanged || badInternetConnection}
                  aria-label="send"
                  color="primary"
                  size="small"
                  className={buttonClassname}
                  onClick={handleButtonClick}
                >
                  {loading ? <HourglassFull /> :  <Send />}
                </Fab>
                {loading && <CircularProgress size={isWidthUp('md', width) ? 48 : 40} className={classes.fabProgress} />}
            </div>
        </div>
    );
});