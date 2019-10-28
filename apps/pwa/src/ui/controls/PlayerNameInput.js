import React from 'react';
import { ServerConfig } from '../../helper/settings';
import { makeStyles } from '@material-ui/core/styles';
import { green } from '@material-ui/core/colors';
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
    backgroundColor: green[500],
    '&:hover': {
      backgroundColor: green[700],
    },
  },
  fabProgress: {
    color: '#324D5C',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  }
}));

export default withWidth()(props => {
    const classes = useStyles();
    const [loading, setLoading] = React.useState(false);
    const [playerNameValid, setPlayerNameValid] = React.useState(false);
    const [playerNameAvailable, setPlayerNameAvailable] = React.useState(false);
    const [playerName, setPlayerName] = React.useState(typeof props.current === 'undefined' ? 'Chocnonymous' : props.current);

    const buttonClassname = playerNameAvailable ? classes.buttonSuccess : null;

    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            let data = JSON.parse(xhr.responseText);
            if (xhr.status === 200) {
                setPlayerNameAvailable(data.available);
            } else {
                setPlayerNameAvailable(false);
            }
            setLoading(false);
        }
    };

    const checkAvailable = name => {
        if (xhr.readyState < 4) {
            xhr.abort();
        }
        xhr.open("GET", ServerConfig.baseUrl + '/check/available/' + name, true);
        xhr.setRequestHeader('Authorization', 'Basic ' + ServerConfig.auth);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send();
    }

    const validate = name => {
        let regex = /^([a-zA-ZäöüÄöü][a-zA-Z0-9_äöüÄÖÜ]{3,15})$/;
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
                error={!playerNameAvailable || !playerNameValid}
                value={playerName}
                helperText={getHelperText()}
                inputProps={{ spellCheck: 'false' }}
                onChange={event => {
                    setPlayerName(event.target.value);
                    setPlayerNameAvailable(false);
                    setPlayerNameValid(false);
                    setLoading(true);
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