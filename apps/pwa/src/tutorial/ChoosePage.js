import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ChatLikeInstructions from './ChatLikeInstructions';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class ChoosePage extends Component {
    componentWillReceiveProps(nextProps) {
        if (nextProps.game.state !== GameStateTypes.CHOOSE_FIELD_OR_START) {
            this.props.fulfilled();
        }
    }

    render() {
        let messages = [
            { text: 'Welcome to our interactive battlechoc tutorial!', type:'text', delay: 2000 },
            { text: 'Choose between first turn or one of the game fields to continue with the tutorial', type:'text'}
        ]
        return <ChatLikeInstructions messages={messages} appbar={this.props.appbar}/>;
    }
}

ChoosePage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.element.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game
});

const ChoosePageContainer = connect(mapStateToProps)(ChoosePage);
export default ChoosePageContainer;