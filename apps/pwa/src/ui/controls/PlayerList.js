import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';
import { SportsEsports, PersonAddDisabled, PersonAdd } from '@material-ui/icons';
import { Fab } from '@material-ui/core';
import logger from '../../helper/logger';
import { translate as t, keys as tr } from '../misc';

const useStyles = makeStyles(theme => ({
    list: {
        marginTop: '16px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        boxShadow: '2px 2px 6px rgba(0,0,0,0.6)',
        '@media screen and (max-width: 450px)': {
            fontSize: '0.8rem'
        }
    },
    row: {
        borderBottom: '1px solid rgba(224, 224, 224, 1)',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'center',
    },
    headline: {
        color: 'white',
        backgroundColor: '#324D5C',
        boxShadow: '1px 1px 3px #000',
        borderBottom: 0,
        textShadow: '1px 1px 3px #000',
        '& > div:last-child': {
            padding: '15px'
        }
    },
    button: {
        margin: '0 5px'
    },
    property: {
        padding: '15px',
        display: 'flex',
        justifyContent: 'flex-start',
        width: '15%',
        '@media screen and (min-width: 960px)': {
            padding: '24px'
        }
    },
    name: {
        justifyContent: 'center',
        flexGrow: 1,
        padding: '15px',
        display: 'flex',
        '@media screen and (min-width: 960px)': {
            padding: '24px'
        }
    },
    actions: {
        display: 'flex',
        alignItems: 'center'
    },
    own: {
        backgroundColor: '#5b2f19',
        color: 'white'
    },
    placeholder: {
        width: 100,
        '@media screen and (min-width: 960px)': {
            width: 116
        },
        '@media screen and (max-width: 600px)': {
            width: 92
        }
    }
}));

const PlayerList = props => {
    const classes = useStyles();
    const [pendingRequest, setPendingRequest] = useState(null)

    const canNotChallenge = player => {
        return props.sessions.map(session => session.opponent.name).includes(player.name) ||
            player.score < 1000;
    }

    let friends = props.players;
    if (typeof props.friends !== 'undefined') {
        friends = props.friends;
    }

    const isFriend = username => {
        return friends.map(friend => friend.name).includes(username);
    }

    const addFriend = async username => {
        if (!pendingRequest) {
            setPendingRequest(username);
            try {
                await props.addFriend(username);
            } catch (error) {
                logger.warn(error);
            } finally {
                setPendingRequest(null);
            }
        }
    }

    const removeFriend = async username => {
        if (!pendingRequest) {
            setPendingRequest(username);
            try {
                await props.removeFriend(username);
            } catch (error) {
                logger.warn(error);
            } finally {
                setPendingRequest(null);
            }
        }
    }

    let openPlayerProfile = player => {
        let isPlayer = props.username === player.name;
        if (!isPlayer) {
            props.showProfile({ opponent: player });
        }
    }

    if (props.players.length > 0) {
        return (
            <div className={classes.list}>
                {props.withScore ? <div className={`${classes.row} ${classes.headline}`}><div className={classes.property} style={{ width: '10%' }}>{t(tr.ACCOUNT_OVERVIEW_RANK)}</div><div className={classes.property}>{t(tr.PLAYERLIST_SCORE)}</div><div className={classes.name}>{t(tr.PLAYERLIST_NAME)}</div><div className={classes.actions}>{t(tr.PLAYERLIST_ACTIONS)}</div></div> : null}
                {
                    props.players.map((player, i) => {
                        let isPlayer = props.username === player.name;
                        return <div key={i} className={isPlayer ? `${classes.own} ${classes.row}` : classes.row}>
                            {props.withScore ? <div onClick={() => openPlayerProfile(player)} className={classes.property} style={{ width: '10%' }}>{player.ranking}</div> : null}
                            {props.withScore ? <div onClick={() => openPlayerProfile(player)} className={classes.property}>{player.score}</div> : null}
                            <div onClick={() => openPlayerProfile(player)} className={classes.name}>{player.name}</div>
                            {!isPlayer ? <div className={classes.actions}>
                                <Fab className={classes.button} size="small" disabled={pendingRequest === player.name || canNotChallenge(player)} color="primary" onClick={() => props.challenge(player.name)}><SportsEsports /></Fab>
                                {
                                    isFriend(player.name) ?
                                        <Fab className={classes.button} size="small" disabled={pendingRequest === player.name} color="primary" onClick={() => removeFriend(player.name)} ><PersonAddDisabled /></Fab>
                                        : <Fab className={classes.button} size="small" disabled={pendingRequest === player.name} color="primary" onClick={() => addFriend(player.name)} ><PersonAdd /></Fab>
                                }

                            </div> : <div className={classes.placeholder} />}
                        </div>
                    })
                }
            </div>
        );
    } else {
        return null;
    }
}

PlayerList.propTypes = {
    showProfile: PropTypes.func.isRequired,
    withScore: PropTypes.bool,
    username: PropTypes.string,
    players: PropTypes.array.isRequired,
    friends: PropTypes.array,
    sessions: PropTypes.array.isRequired,
    challenge: PropTypes.func.isRequired,
    addFriend: PropTypes.func,
    removeFriend: PropTypes.func.isRequired
}

PlayerList.defaultProps = {
    withScore: false,
    username: ''
}

export default PlayerList;