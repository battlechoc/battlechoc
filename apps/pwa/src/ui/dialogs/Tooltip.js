import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './Tooltip.css';
import { GameStateTypes, getEntityDescriptor } from 'battlechoc-shared-functions';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { withStyles } from '@material-ui/core/styles';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import MuiExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import MuiExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import Typography from '@material-ui/core/Typography';
import { translate as t } from '../misc';

const ExpansionPanelSummary = withStyles(theme => ({
    root: {
        backgroundColor: 'rgba(69, 123, 130, 1)',
        border: '1px solid rgba(69, 123, 130, 0.2)',
        color: 'rgba(255, 255, 255, 1)',
        marginBottom: -1,
        marginLeft: -1,
        minHeight: 32,
        paddingLeft: theme.spacing(2),
        paddingRight: theme.spacing(2),
        '&$expanded': {
            minHeight: 32,
        },
    },
    content: {
        margin: '8px 0',
        '&$expanded': {
            margin: '8px 0',
        }
    },
    expanded: {},
}))(props => <MuiExpansionPanelSummary {...props} />);

ExpansionPanelSummary.muiName = 'ExpansionPanelSummary';

const ExpansionPanelDetails = withStyles(theme => ({
    root: {
        paddingTop: theme.spacing(1),
        paddingRight: theme.spacing(2),
        paddingBottom: 0,
        paddingLeft: theme.spacing(2)
    },
}))(MuiExpansionPanelDetails);

const Tooltip = props => {
    const [expanded, setExpanded] = useState(false);
    let title = null, message = null;

    if (props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
        title = t('TOOLTIP_INITIAL_TURN_TITLE');
        if (props.playerTurn) {
            message = t('TOOLTIP_INITIAL_TURN_MESSAGE');
        }
    } else if (props.state === GameStateTypes.CHOOSE_FIELD) {
        title = t('TOOLTIP_INITIAL_TURN_TITLE');
        message = t('TOOLTIP_INITIAL_TURN_OPPONENT', props.currentPlayerName);
    } else if (props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
        title = t('TOOLTIP_INITIAL_PLACEMENT_TITLE');
        if (props.playerTurn) {
            message = t('TOOLTIP_INITIAL_PLACEMENT_MESSAGE');
        }
    } else if (props.state === GameStateTypes.BUILD_PHASE) {
        title = t('TOOLTIP_BUILD_PHASE_TITLE');
        if (props.playerTurn) {
            if (typeof props.tappedBuilding === 'undefined') {
                message = t('TOOLTIP_BUILD_PHASE_MESSAGE');
            } else {
                let building = getEntityDescriptor(props.tappedBuilding, props.level);
                let { info, costs, advantages } = t('TOOLTIP_BUILDING_INFO', props.tappedBuilding, building);
                title = t('TOOLTIP_BUILDING_TITLE', props.tappedBuilding);
                message = <span className="tooltipBuildingInfo">
                    <span>{info}</span>
                    {typeof costs !== 'undefined' ? <span>{costs}</span> : null}
                    {typeof advantages !== 'undefined' ? <span>{advantages}</span> : null}
                </span>;
            }
        }
    } else if (props.state === GameStateTypes.ATTACK_PHASE) {
        title = t('TOOLTIP_ATTACK_PHASE_TITLE');
        if (props.playerTurn) {
            if (typeof props.selectedAttack !== 'undefined') {
                title = t('TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE', props.selectedAttack);
                message = t('TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE', props.selectedAttack);
            } else {
                message = t('TOOLTIP_ATTACK_PHASE_MESSAGE');
            }
        }
    }

    let loadingAnimation = !props.playerTurn ? <img className="loadingAnimation" src="/animations/loading.gif" alt="loading" /> : null;
    if (title) {
        return (
            <div id="tooltipContainer">
                <ExpansionPanel square id="tooltip" expanded={expanded && message !== null} onClick={() => {
                    if (message !== null) {
                        setExpanded(!expanded);
                    }
                }}>
                    <ExpansionPanelSummary className="tooltipHeader" expandIcon={message !== null ? <ExpandMoreIcon /> : null}>
                        <Typography variant="h6" color="textSecondary">{title}</Typography>
                    </ExpansionPanelSummary>
                    <ExpansionPanelDetails>
                        <Typography paragraph={true}>{message}</Typography>
                    </ExpansionPanelDetails>
                </ExpansionPanel>
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