import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { ServerRequest } from '../../helper/settings';
import { translate as t, keys as tr } from '../misc';
import Axios from 'axios';
import { createUseStyles } from 'react-jss';
import logger from '../../helper/logger';
import { NoHealthyInternetConnectionError } from 'battlechoc-shared-functions';
import Progress from './Progress';

const useStyles = createUseStyles(theme => ({
    root: {
        display: 'flex',
        alignItems: 'center',
        position: 'relative'
    },
    input: {
        width: 'calc(100% - 10vh)',
        outline: 'none',
        borderRadius: '2.857vh 0 0 2.857vh',
        color: theme.color.secondary.dark,
        fontFamily: 'Bangers',
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'center',
        fontSize: '7vh',
        height: '11.428vh',
        background: 'white',
        border: `0.2vh solid ${theme.color.secondary.light}`,
    },
    error: {
        border: `0.2vh solid ${theme.color.accent.light} !important`,
        color: `${theme.color.accent.dark} !important`
    },
    errorLabel: {
        color: theme.color.accent.light,
        fontFamily: 'Bangers',
        '-webkit-text-stroke': `1px ${theme.color.accent.dark}`,
        '-webkit-font-smoothing': 'antialiased'
    },
    icon: {
        padding: '4vh 8vh'
    },
    actionButton: {
        border: `3px solid ${theme.color.secondary.light}`,
        borderRadius: '2.857vh',
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        height: '10vh',
        width: '10vh',
        position: 'absolute',
        top: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    buttonError: {
        border: `3px solid ${theme.color.accent.light}`,
        background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%)`,
        '& > div': {
            filter: 'hue-rotate(120deg)'
        }
    },
    actionIcon: {
        width: '60%',
        height: '60%'
    },
    disabled: {
        background: 'linear-gradient(0deg, #666 0%, #aaa 70%)',
        border: '3px solid #aaa',
        '& > div': {
            filter: 'grayscale(1)'
        }
    }
}));

const PlayerNameInput = props => {
    const classes = useStyles();
    const { setPlayerName, startValue, current } = props;
    const [loading, setLoading] = useState(false);
    const [playerNameValid, setPlayerNameValid] = useState(true);
    const [playerNameAvailable, setPlayerNameAvailable] = useState(true);
    const [playerName, updatePlayerName] = useState(typeof startValue === 'undefined' ? 'Chocnonymous' : startValue);
    const [unchanged, setUnchanged] = useState(current === startValue);
    const [badInternetConnection, setBadInternetConnection] = useState(false);
    const [editMode, setEditMode] = useState(props.editMode);

    const source = useRef(Axios.CancelToken.source());
    const [requestRunning, setRequestRunning] = useState(false);
    const [requestTimeout, setRequestTimeout] = useState(null);

    useEffect(() => {
        setEditMode(props.editMode);
        updatePlayerName(typeof startValue === 'undefined' ? 'Chocnonymous' : startValue);
        if (!props.editMode) {
            setPlayerNameAvailable(true);
            setPlayerNameValid(true);
            setLoading(false);
        }
    }, [props.editMode, startValue]);

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
        let regex = /^([a-zA-Z][a-zA-Z0-9_]{2,24})$/;
        return regex.test(name) && name.toUpperCase() !== 'CHOCNONYMOUS';
    }

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

    const hasError = editMode && (!playerNameAvailable || !playerNameValid || badInternetConnection) && !unchanged;
    const actionIcon = editMode ? 'send' : 'pen';
    const handleAction = () => {
        if (editMode) {
            if (playerNameAvailable && playerNameValid && !loading) {
                setPlayerName(playerName);
            }
        } else {
            if (typeof props.onEditMode === 'function') {
                props.onEditMode();
            }
            setEditMode(true);
        }
    }

    const buttonError = editMode && ( !playerNameAvailable || !playerNameValid );
    const buttonDisabled = !buttonError && editMode && ( loading || unchanged || badInternetConnection );

    return (
        <div className={props.className}>
            {hasError ? <span className={classes.errorLabel}>{ getHelperText() }</span> : null}
            <div className={classes.root}>
                { editMode ? <input
                    noValidate
                    style={{ paddingLeft: 5 }}
                    className={`${classes.input} ${hasError ? classes.error : ''}`}
                    value={playerName}
                    spellCheck={false} 
                    autoFocus={true}
                    onChange={event => {
                        updatePlayerName(event.target.value);
                    }}
                /> : <div className={classes.input}>
                    <div className={`${classes.icon} ${classes.fixed}`} style={{ backgroundImage: 'url(/images/user.svg)', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%'}}></div> 
                    <div style={{ marginLeft: 6, fontSize: playerName.length > 7 ? '6vh' : '8vh' }}>{ playerName }</div>
                </div> }
                <div onClick={handleAction} className={`${classes.actionButton} ${buttonDisabled ? classes.disabled : null} ${buttonError ? classes.buttonError : null}`}>
                { loading ? <Progress infiniteAnimation={true} size={24} /> : <div className={classes.actionIcon} style={{ backgroundImage: `url(/images/${actionIcon}.svg)`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%'}}></div> }
                </div>
            </div>
        </div>
    );
}

PlayerNameInput.defaultProps = {
    editMode: true,
    className: ''
}

PlayerNameInput.propTypes = {
    editMode: PropTypes.bool,
    className: PropTypes.string,
    onEditMode: PropTypes.func
}

export default PlayerNameInput;