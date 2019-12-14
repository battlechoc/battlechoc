import React, { useState, useEffect } from 'react';
import { ServerRequest } from '../../helper/settings';
import { Translation as t } from '../misc';
import Axios from 'axios';
import { makeStyles } from '@material-ui/core/styles';
import withWidth, { isWidthUp } from '@material-ui/core/withWidth';
import { Send, HourglassFull } from '@material-ui/icons';
import { Fab, TextField, CircularProgress } from '@material-ui/core';
import logger from '../../helper/logger';

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
    const { setPlayerName, current, width, language } = props;
    const [loading, setLoading] = useState(false);
    const [playerNameValid, setPlayerNameValid] = useState(false);
    const [playerNameAvailable, setPlayerNameAvailable] = useState(false);
    const [playerName, updatePlayerName] = useState(typeof current === 'undefined' ? 'Chocnonymous' : current);
    const [unchanged, setUnchanged] = useState(current === playerName);

    const buttonClassname = playerNameAvailable ? classes.buttonSuccess : null;

    const [axiosSource, setAxiosSource] = useState(Axios.CancelToken.source());
    const [requestRunning, setRequestRunning] = useState(false);
    const [requestTimeout, setRequestTimeout] = useState(null);

    useEffect(() => {
        setUnchanged(playerName === current)
        if (playerName !== '' && playerName !== current) {
            setPlayerNameValid(validate(playerName));

            clearTimeout(requestTimeout);
            if (requestRunning) {
                axiosSource.cancel();
            }
        
            setLoading(true);
            setRequestTimeout(setTimeout( async () => {
                let source = Axios.CancelToken.source()
                setAxiosSource(source);
                
                try {
                    setRequestRunning(true);
                    let response = await ServerRequest('get', '/check/available/' + playerName, source.token);
                    setPlayerNameAvailable(response.data.available);
                } catch(error) {
                    if (!Axios.isCancel(error)) {
                        logger.warn(error);
                        setPlayerNameAvailable(false);
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
        } else if (!playerNameAvailable) {
            return t[language].SETTINGS_PLAYER_NAME_IN_USE;
        } else if (!playerNameValid) {
            return t[language].SETTINGS_PLAYER_NAME_INVALID;
        } else {
            return '';
        }
    }

    return (
        <div className={classes.root}>
            <TextField
                label="Name"
                className={classes.playerNameInput}
                error={(!playerNameAvailable || !playerNameValid) && !unchanged}
                value={playerName}
                helperText={getHelperText()}
                inputProps={{ spellCheck: 'false' }}
                InputLabelProps={{ style: {color: 'rgb(48, 86, 91)'}}}
                onChange={event => {
                    updatePlayerName(event.target.value);
                }}
                margin="normal"
            />    
            <div className={classes.wrapper}>
                <Fab
                  disabled={loading || !playerNameAvailable || !playerNameValid || unchanged}
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