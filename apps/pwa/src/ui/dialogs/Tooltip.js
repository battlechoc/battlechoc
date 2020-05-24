import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './Tooltip.css';
import { GameStateTypes, getEntityDescriptor } from 'battlechoc-shared-functions';
import { translate as t, keys as tr } from '../misc';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    tooltip: {
        top: 0,
        right: 0,
        width: 260,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        position: 'absolute',
        zIndex: 1,
        marginRight: 5
    },
    title: {
        display: 'flex',
        fontFamily: 'Bangers',
        padding: '1vh',
        width: 'max-content',
        justifyContent: 'space-between',
        fontSize: '7vh',
        '-webkit-text-stroke': `0.1vh ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        [theme.breakpoints.orientation.portrait]: {
            padding: '1vw',
            fontSize: '7vw'       
        }
    },
    button: {
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        padding: '1.5vh',
        border: `0.5vh solid ${theme.color.secondary.light}`,
        marginTop: 6,
        borderRadius: '3vh',
        color: 'white',
        [theme.breakpoints.orientation.portrait]: {
            padding: '1.5vw',
            border: `0.5vw solid ${theme.color.secondary.light}`,
            borderRadius: '3vw',       
        } 
    },
    expanded: {
        padding: '1vh',
        fontSize: '3vh',
        '& p': {
            margin: '6px 0'
        },
        [theme.breakpoints.orientation.portrait]: {
            padding: '1vw',
            fontSize: '3vw'       
        } 
    },
    invisible: {
        display: 'none'
    },
    dropdown: {
        width: '7vh',
        height: '7vh',
        marginLeft: '2vh',
        background: `url(/images/dropdown.svg) no-repeat`, 
        backgroundSize: '100% 100%',
        [theme.breakpoints.orientation.portrait]: {
            width: '7vw',
            height: '7vw',
            marginLeft: '2vw',         
        } 
    }
}));

const Tooltip = props => {
    const classes = useStyles();
    const [expanded, setExpanded] = useState(false);
    let title = null, message = null;

    if (props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
        title = t(tr.TOOLTIP_INITIAL_TURN_TITLE);
        if (props.playerTurn) {
            message = t(tr.TOOLTIP_INITIAL_TURN_MESSAGE);
        }
    } else if (props.state === GameStateTypes.CHOOSE_FIELD) {
        title = t(tr.TOOLTIP_INITIAL_TURN_TITLE);
        message = t(tr.TOOLTIP_INITIAL_TURN_OPPONENT, props.currentPlayerName);
    } else if (props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
        title = t(tr.TOOLTIP_INITIAL_PLACEMENT_TITLE);
        if (props.playerTurn) {
            message = t(tr.TOOLTIP_INITIAL_PLACEMENT_MESSAGE);
        }
    } else if (props.state === GameStateTypes.BUILD_PHASE) {
        title = t(tr.TOOLTIP_BUILD_PHASE_TITLE);
        if (props.playerTurn) {
            if (typeof props.tappedBuilding === 'undefined') {
                message = t(tr.TOOLTIP_BUILD_PHASE_MESSAGE);
            } else {
                let building = getEntityDescriptor(props.tappedBuilding, props.level);
                let { info, costs, advantages } = t(tr.TOOLTIP_BUILDING_INFO, props.tappedBuilding, building);
                title = t(tr.TOOLTIP_BUILDING_TITLE, props.tappedBuilding);
                message = <span className="tooltipBuildingInfo">
                    <span>{info}</span>
                    {typeof costs !== 'undefined' ? <span>{costs}</span> : null}
                    {typeof advantages !== 'undefined' ? <span>{advantages}</span> : null}
                </span>;
            }
        }
    } else if (props.state === GameStateTypes.ATTACK_PHASE) {
        title = t(tr.TOOLTIP_ATTACK_PHASE_TITLE);
        if (props.playerTurn) {
            if (typeof props.selectedAttack !== 'undefined') {
                title = t(tr.TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE, props.selectedAttack);
                message = t(tr.TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE, props.selectedAttack);
            } else {
                message = t(tr.TOOLTIP_ATTACK_PHASE_MESSAGE);
            }
        }
    }

    const loadingAnimation = !props.playerTurn ? <img className="loadingAnimation" src="/animations/loading.gif" alt="loading" /> : null;
    const openTooltip = () => {
        if (message !== null) {
            setExpanded(!expanded);
        }
    }
    
    if (title) {
        return (
            <div className={classes.tooltip}>
                <div className={classes.button} onClick={openTooltip}>
                    <span className={classes.title}>{title} {message !== null ? <span className={classes.dropdown} /> : null}</span>
                    <div className={(expanded && message !== null ? classes.expanded : classes.invisible)}><p>{message}</p></div>
                </div>
                { loadingAnimation }
            </div>
        );
    } else {
        return null;
    }
}

Tooltip.propTypes = {
  state: PropTypes.string.isRequired,
  currentPlayerName: PropTypes.string.isRequired,
  tappedBuilding: PropTypes.string,
  selectedAttack: PropTypes.string,
  level: PropTypes.object.isRequired,
  playerTurn: PropTypes.bool.isRequired
}

export default Tooltip;