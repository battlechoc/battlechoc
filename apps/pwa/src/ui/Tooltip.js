import React, { Component } from 'react';
import './Tooltip.css';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { withStyles } from '@material-ui/core/styles';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import MuiExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import MuiExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import Typography from '@material-ui/core/Typography';
import { withTheme } from '@material-ui/core/styles';

const ExpansionPanelSummary = withStyles(theme => ({
  root: {
    backgroundColor: 'rgba(50, 77, 92, 1)',
    border: '1px solid rgba(50, 77, 92, 0.2)',
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
            var title = 'Initial Turn';
            if (currentPlayer === 0) {
                var message = 'In the first round you can choose a playing field or the first move';
            }
        } else if (gameState === GameStateTypes.CHOOSE_FIELD) {
            title = 'Initial Turn';
            message = this.props.game.players[currentPlayer].name + ' can now select a game field';
        } else if (gameState === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || 
                   gameState === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) {
            title = 'Initial Placement';
            if (currentPlayer === 0) {
                message = 'Now you can build the factory once. Set the factory carefully: ' +
                          'If it is destroyed, you cannot build any other buildings';
            } 
        } else if (gameState === GameStateTypes.BUILD_PHASE) {
            title = 'Build Phase';
            if (currentPlayer === 0) {
                message = 'Choose a building from the list below and build it on any of the free fields. ' + 
                          'The cream is displayed translucent. A building built in cream will be invisible to the enemy';
            }
        } else if (gameState === GameStateTypes.ATTACK_PHASE) {
            title = 'Attack Phase';
            if (currentPlayer === 0) {
                message = 'Click on an enemy building to destroy it. Hint: Smart enemies hide buildings within cream';
            }
        }

        return { title, message }
    }

    render() {
        if (typeof this.props.game !== 'undefined') {
            let { title, message } = this.getContent()
            if (typeof title !== 'undefined') {
                return(
                    <ExpansionPanel square id="tooltip" expanded={this.state.expanded && typeof message !== 'undefined'} onChange={() => {
                        if (typeof message !== 'undefined') {
                            this.setState({expanded: !this.state.expanded});
                        }
                    }}>
                        <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6" color="textSecondary">{ title }</Typography>
                        </ExpansionPanelSummary>
                        <ExpansionPanelDetails>
                            <Typography paragraph={true}>{ message }</Typography>
                        </ExpansionPanelDetails>
                    </ExpansionPanel>
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
  game: state.gameplay.game
});

const TooltipContainer = connect(
  mapStateToProps
)(Tooltip);

export default withTheme()(TooltipContainer);