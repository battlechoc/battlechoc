import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ChatLikeInstructions from './ChatLikeInstructions';
import { GameStartSelection } from '../ui/controls';
import Situation from '../situations/Situation';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class ChoosePage extends Component {
    componentWillMount() {
        let situation = new Situation(3);
        situation.game.gameplay.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
        this.game = situation.game;
    }

    render() {
        let messages = [
            { text: 'Welcome to our interactive battlechoc tutorial!', type:'text', delay: 2000 },
            { text: 'Choose between first turn or one of the game fields to continue with the tutorial', type:'text'}
        ]
        return (
            <div id="tutorialGameStartSelection">
                <GameStartSelection pseudoGame={this.game} pseudoCallback={() => this.props.fulfilled()} clickable={true} />
                <ChatLikeInstructions messages={messages} appbar={this.props.appbar}/>
            </div>
        );
    }
}

ChoosePage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.element.isRequired
}

export default ChoosePage