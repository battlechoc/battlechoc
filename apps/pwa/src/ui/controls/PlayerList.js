import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    list: {
        marginTop: 8,
        fontFamily: 'Bangers',
        fontSize: '1.2rem',
        '& > :nth-child(odd)': {
            backgroundColor: theme.color.secondary.dark
        },
        display: 'table',
        [theme.breakpoints.smartphone]: {
            fontSize: '1.4rem'
        }
    },
    row: {
        cursor: 'pointer',
        userSelect: 'none',
        padding: 5,
        display: 'table-row',
    },
    cell: {
        display: 'table-cell',
        borderTop: '4px solid transparent',
        borderBottom: '4px solid transparent'
    },
    name: {
        width: '100%',
        textAlign: 'center',
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent'
    },
    own: {
        backgroundColor: `${theme.color.accent.light} !important`,
        color: 'white'
    },
    icon: {
        padding: 12
    }
}));

const PlayerList = props => {
    const { username, players, showProfile, withScore } = props;
    const classes = useStyles();

    const openPlayerProfile = player => {
        const isPlayer = username === player.name;
        if (!isPlayer) {
            showProfile({ opponent: player });
        }
    }

    if (players.length > 0) {
        return (
            <div className={classes.list}>
            { 
                players.map((player, i) => {
                    const isPlayer = username === player.name;
                    return <div key={i} className={isPlayer ? `${classes.own} ${classes.row}` : classes.row }>
                        { withScore ? <div onClick={() => openPlayerProfile(player)} className={classes.ranking}>{`${player.ranking}.`}</div> : null }
                        <div onClick={() => openPlayerProfile(player)} className={`${classes.cell} ${classes.name}`}>{player.name}</div>
                        { withScore ? <>
                            <div style={{ borderRight: '4px solid transparent'}} className={classes.cell}>{player.score}</div>
                            <div className={`${classes.icon} ${classes.cell}`} style={{ background: `url(/images/score.svg) no-repeat`, backgroundSize: '100% 100%', borderRight: '12px solid transparent' }} />
                        </> : null }

                        { withScore ? <>
                            <div style={{ borderRight: '4px solid transparent'}} className={classes.cell}>{player.level}</div>
                            <div className={`${classes.icon} ${classes.cell}`} style={{ background: `url(/images/level.svg) no-repeat`, backgroundSize: '100% 100%', borderRight: '4px solid transparent' }} />
                        </> : null }
                    </div>
                })
            }
            </div>
        );
    } else {
        return null;
    }
}

PlayerList.defaultProps = {
    withScore: false,
    username: ''
}

PlayerList.propTypes = {
    showProfile: PropTypes.func.isRequired,
    players: PropTypes.array.isRequired,
    withScore: PropTypes.bool,
    username: PropTypes.string,
}

export default PlayerList;