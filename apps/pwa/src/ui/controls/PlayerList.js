import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';
import { SportsEsports, PersonAddDisabled, PersonAdd } from '@material-ui/icons';
import { Fab } from '@material-ui/core';
import logger from '../../helper/logger';

const useStyles = makeStyles(theme => ({
    list: {
        marginTop: '16px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        boxShadow: '2px 2px 6px rgba(0,0,0,0.6)'
    },
    row: {
        borderBottom: '1px solid rgba(224, 224, 224, 1)',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'center',
    },
    button: {
        margin: '0 5px'
    },
    playername: {
        padding: '15px',
        flexGrow: '1',
        display: 'flex',
        alignItems: 'center',
        '@media screen and (min-width: 960px)': {
            padding: '24px'
        }
    },
    actions: {
        display: 'flex',
        alignItems: 'center'
    }
}));

const PlayerList = props => {
    const classes = useStyles();
    const [pendingRequest, setPendingRequest] = useState(null)

    const canNotChallenge = username => {
        return props.sessions.map(session => session.opponent.name).includes(username);
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

    if (props.players.length > 0) {
        return (
            <div className={classes.list}>
            { 
                props.players.map((player, i) => 
                <div key={i} className={classes.row}>
                    <div onClick={() => props.showProfile({ opponent: player })} className={classes.playername}>{player.name}</div>
                    <div className={classes.actions}>
                        <Fab className={classes.button} size="small" disabled={pendingRequest === player.name || canNotChallenge(player.name)} color="primary" onClick={() => props.challenge(player.name)}><SportsEsports /></Fab>
                        
                        {
                            isFriend(player.name) ?
                                <Fab className={classes.button} size="small" disabled={pendingRequest === player.name} color="primary" onClick={() => removeFriend(player.name)} ><PersonAddDisabled /></Fab>
                            :  <Fab className={classes.button} size="small" disabled={pendingRequest === player.name} color="primary" onClick={() => addFriend(player.name)} ><PersonAdd /></Fab> 
                        }
                    
                    </div>
                </div>)
            }
            </div>
        );
    } else {
        return null;
    }
}

PlayerList.propTypes = {
    showProfile: PropTypes.func.isRequired,
    players: PropTypes.array.isRequired,
    friends: PropTypes.array,
    sessions: PropTypes.array.isRequired,
    challenge: PropTypes.func.isRequired,
    addFriend: PropTypes.func,
    removeFriend: PropTypes.func.isRequired
}

export default PlayerList;