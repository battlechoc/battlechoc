import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    list: props => ({
        marginTop: 8,
        fontFamily: 'Bangers',
        fontSize: props.size === 'small' ? '1.2rem' : '1.6rem',
        '& > :nth-child(odd)': {
            backgroundColor: theme.color.secondary.dark
        },
        display: 'table',
        [theme.breakpoints.smartphone]: {
            fontSize: props.size === 'small' ? '1.4rem' : '1.8rem'
        },
        '-webkit-text-stroke': `1px ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased'
    }),
    row: props => ({
        cursor: 'pointer',
        userSelect: 'none',
        padding: props.size === 'small' ? 5 : 8,
        display: 'table-row',
    }),
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
    const classes = useStyles(props);

    const openPlayerProfile = player => {
        const isPlayer = username === player.name;
        if (!isPlayer) {
            showProfile({ opponent: player });
        }
    }

    if (players.length > 0) {
        return (
            <div style={props.style} className={`${classes.list} ${props.className}`}>
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
    style: {},
    className: '',
    username: '',
    size: 'small'
}

PlayerList.propTypes = {
    showProfile: PropTypes.func.isRequired,
    players: PropTypes.array.isRequired,
    withScore: PropTypes.bool,
    style: PropTypes.object,
    username: PropTypes.string,
    className: PropTypes.string,
    size: PropTypes.oneOf(['small', 'medium'])
}

export default PlayerList;