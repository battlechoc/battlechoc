import React from 'react';
import PropTypes from 'prop-types';
import { makeStyles } from '@material-ui/core/styles';
import { multiplayer } from '../../Multiplayer';
import { features } from '../../helper/compatibility';

const useStyles = makeStyles(theme => ({
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
        alignItems: 'flex-start'
    },
    icon: {
        display: 'flex',
        alignItems: 'center',
        marginTop: 5,
        '& p': {
            fontSize: '1rem',
            color: '#324D5C',
            userSelect: 'none',
            margin: '0 0 0 6px'
        }
    },
    cacao: {
        backgroundImage: 'url(/images/toolbar_icon_palette.png)',
        backgroundPosition: '-200% -200%' 
    },
    buildings: {
        backgroundImage: 'url(/images/toolbar_icon_palette.png)',
        backgroundPosition: '-300% -200%' 
    },
    webPCacao: {
        backgroundImage: 'url(/images/toolbar_icon_palette.webp)',
        backgroundPosition: '-200% -200%' 
    },
    webPBuildings: {
        backgroundImage: 'url(/images/toolbar_icon_palette.webp)',
        backgroundPosition: '-300% -200%' 
    },
    image: {
        userSelect: 'none',
        filter: 'brightness(130%)',
        '@media screen and (min-width: 901px)': {
            width: '54px',
            height: '54px',
            backgroundSize: '216px 162px'
        },
        '@media screen and (max-width: 900px)': {
            width: '42px',
            height: '42px',
            backgroundSize: '168px 126px'
        },
        '@media screen and (max-width: 600px)': {
            width: '30px',
            height: '30px',
            backgroundSize: '120px 90px'
        },
    }
}));

const InfoPanel = props => {
    const classes = useStyles();
    let index = multiplayer.localPlayerIndex;

    let cacaoClass = features.isWebPSupported ? classes.webPCacao : classes.cacao;
    let buildingsClass = features.isWebPSupported ? classes.webPBuildings : classes.buildings;

    return (
        <div className={classes.panel}>
            <div className={classes.icon}>
                <div className={`${cacaoClass} ${classes.image}`}/>
                <p>{props.players[index].cacao}</p>
            </div>
            <div className={classes.icon}>
                <div className={`${buildingsClass} ${classes.image}`}/>
                <p>{props.players[index].buildings + '/' + props.players[index].buildingsPerTurn}</p>
            </div>
        </div>
    );
}

InfoPanel.propTypes = {
    players: PropTypes.array
}

export default InfoPanel;