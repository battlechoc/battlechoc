import React, { Component } from 'react';
import './Tooltip.css';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { getEntity, BuildingType } from '../gameplay/GameEntities';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { withStyles } from '@material-ui/core/styles';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import MuiExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import MuiExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import Typography from '@material-ui/core/Typography';
import { withTheme } from '@material-ui/core/styles';
import t from './Translation';

const ExpansionPanelSummary = withStyles(theme => ({
    root: {
        backgroundColor: 'rgba(69, 123, 130, 1)',
        border: '1px solid rgba(69, 123, 130, 0.2)',
        color: 'rgba(255, 255, 255, 1)',
        marginBottom: -1,
        marginLeft: -1,
        minHeight: 32,
        paddingLeft: theme.spacing.unit * 2,
        paddingRight: theme.spacing.unit * 2,
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
        paddingTop: theme.spacing.unit * 1,
        paddingRight: theme.spacing.unit * 2,
        paddingBottom: 0,
        paddingLeft: theme.spacing.unit * 2
    },
}))(MuiExpansionPanelDetails);

class Tooltip extends Component {
    constructor(props) {
        super(props);
        this.state = {
            expanded: true
        }
    }

    getContent() {
        let gameState = this.props.game.state;
        let currentPlayer = this.props.game.currentPlayerIndex;

        if (gameState === GameStateTypes.CHOOSE_FIELD_OR_START) {
            var title = t[this.props.language].TOOLTIP_INITIAL_TURN_TITLE;
            if (currentPlayer === 0) {
                var message = t[this.props.language].TOOLTIP_INITIAL_TURN_MESSAGE;
            }
        } else if (gameState === GameStateTypes.CHOOSE_FIELD) {
            title = t[this.props.language].TOOLTIP_INITIAL_TURN_TITLE;
            message = t[this.props.language].TOOLTIP_INITIAL_TURN_OPPONENT(this.props.game.players[currentPlayer].name);
        } else if (gameState === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            gameState === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
            title = t[this.props.language].TOOLTIP_INITIAL_PLACEMENT_TITLE;
            if (currentPlayer === 0) {
                message = t[this.props.language].TOOLTIP_INITIAL_PLACEMENT_MESSAGE;
            }
        } else if (gameState === GameStateTypes.BUILD_PHASE) {
            title = t[this.props.language].TOOLTIP_BUILD_PHASE_TITLE;
            if (currentPlayer === 0) {
                if (typeof this.props.selectedBuilding === 'undefined' || this.props.selectedBuilding === BuildingType.EMPTY) {
                    message = t[this.props.language].TOOLTIP_BUILD_PHASE_MESSAGE;
                } else {
                    const buildingInfo = getEntity(this.props.selectedBuilding);
                    message = "building props for " + buildingInfo.type + " " + buildingInfo.costs;
                }

            }
        } else if (gameState === GameStateTypes.ATTACK_PHASE) {
            title = t[this.props.language].TOOLTIP_ATTACK_PHASE_TITLE;
            if (currentPlayer === 0) {
                message = t[this.props.language].TOOLTIP_ATTACK_PHASE_MESSAGE;
            }
        }

        return { title, message }
    }

    render() {
        if (typeof this.props.game !== 'undefined') {
            let { title, message } = this.getContent()
            let currentPlayer = this.props.game.currentPlayerIndex;
            let loadingAnimation = currentPlayer === 1 ? <img className="loadingAnimation" src="animations/loading.gif" alt="loading" /> : null;
            if (typeof title !== 'undefined') {
                return (
                    <div id="tooltipContainer">
                        <ExpansionPanel square id="tooltip" expanded={this.state.expanded && typeof message !== 'undefined'} onChange={() => {
                            if (typeof message !== 'undefined') {
                                this.setState({ expanded: !this.state.expanded });
                            }
                        }}>
                            <ExpansionPanelSummary className="tooltipHeader" expandIcon={<ExpandMoreIcon />}>
                                <Typography variant="h6" color="textSecondary">{title}</Typography>
                            </ExpansionPanelSummary>
                            <ExpansionPanelDetails>
                                <Typography paragraph={true}>{message}</Typography>
                            </ExpansionPanelDetails>
                        </ExpansionPanel>
                        {loadingAnimation}
                    </div>
                );
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language,
    selectedBuilding: state.ui.selectedBuilding
});

const TooltipContainer = connect(
    mapStateToProps
)(Tooltip);

export default withTheme()(TooltipContainer);