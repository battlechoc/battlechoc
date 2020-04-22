import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './Tooltip.css';
import { GameStateTypes, getEntityDescriptor } from 'battlechoc-shared-functions';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { translate as t, keys as tr } from '../misc';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
    title: {
        display: 'flex',
        fontFamily: 'Bangers',
        padding: 5,
        justifyContent: 'space-between',
        fontSize: '1.5rem'
    },
    button: {
        background: 'linear-gradient(0deg, #427F83, #13C894)',
        padding: 5,
        border: '3px solid #13C894',
        margin: '5px 0 10px 0',
        borderRadius: 10,
        color: 'white'
    },
    expanded: {
        padding: 5,
        '& p': {
            margin: '5px 0'
        }
    },
    invisible: {
        display: 'none'
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
            <div id="tooltipContainer">
                <div className={classes.button} onClick={openTooltip}>
                    <span className={classes.title}>{title} {message !== null ? <ExpandMoreIcon /> : null}</span>
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