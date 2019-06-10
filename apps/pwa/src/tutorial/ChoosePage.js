import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ChatLikeInstructions from './ChatLikeInstructions';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { Translation as t } from '../ui/misc';

class ChoosePage extends Component {
    componentWillReceiveProps(nextProps) {
        if (typeof nextProps.game !== 'undefined') {
            if (nextProps.game.state !== GameStateTypes.CHOOSE_FIELD_OR_START) {
                this.props.fulfilled();
            }
        }
    }

    render() {
        let messages = [
            { text: t[this.props.language].TUTORIAL_CHOOSE_MESSAGE_1, type:'text', delay: 2000 },
            { text: t[this.props.language].TUTORIAL_CHOOSE_MESSAGE_2, type:'text'}
        ]
        return <ChatLikeInstructions messages={messages} appbar={this.props.appbar}/>;
    }
}

ChoosePage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.element.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language
});

const ChoosePageContainer = connect(mapStateToProps)(ChoosePage);
export default ChoosePageContainer;