import React from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';
import { multiplayer } from '../../Multiplayer';

const useStyles = createUseStyles(theme => ({
    panel: {
        position: 'absolute',
        whiteSpace: 'nowrap',
        marginRight: 5,
        marginBottom: 5,
        bottom: 0,
        right: 0,
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        userSelect: 'none'
    },
    info: {
        display: 'flex',
        alignItems: 'center',
        marginTop: 5,
        '& p': {
            fontSize: '3.5vw',
            color: 'white',
            userSelect: 'none',
            margin: '0 0 0 5px',
            fontFamily: 'Bangers',
            justifyContent: 'space-between',
            '-webkit-text-stroke': `0.18vw ${theme.color.secondary.dark}`,
            '-webkit-font-smoothing': 'antialiased',
            [theme.breakpoints.orientation.portrait]: {
                fontSize: '6vw'
            },
            [theme.breakpoints.orientation.square]: {
                fontSize: '3.5vw'
            }
        }
    },
    cacao: {
        backgroundImage: 'url(/images/cacao-icon.svg)'
    },
    buildings: {
        backgroundImage: 'url(/images/buildings-icon.svg)'
    },
    icon: {
        border: `0.4vw solid ${theme.color.secondary.dark}`,
        borderRadius: '50%',
        background: 'linear-gradient(0deg, #3DA2CE 0%, #9DD5E9 80%)',
        '& > div': {
            padding: '3.5vw',
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            [theme.breakpoints.orientation.portrait]: {
                padding: '6vw'
            },
            [theme.breakpoints.orientation.square]: {
                padding: '3.5vw'
            }
        }
    }
}));

const InfoPanel = props => {
    const classes = useStyles();
    let index = multiplayer.localPlayerIndex;

    return (
        <div className={classes.panel}>
            <div className={classes.info}>
            <div className={classes.icon}>
                    <div className={classes.cacao} />
                </div>
                <p>{props.players[index].cacao}</p>
            </div>
            <div className={classes.info}>
                <div className={classes.icon}>
                    <div className={classes.buildings} />
                </div>
                <p>{props.players[index].buildings + '/' + props.players[index].buildingsPerTurn}</p>
            </div>
        </div>
    );
}

InfoPanel.propTypes = {
    players: PropTypes.array
}

export default InfoPanel;