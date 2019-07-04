import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import ChatLikeInstructions from './ChatLikeInstructions';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class BuildFactoryPage extends Component {
    componentWillReceiveProps(nextProps) {
        this.gameRunning = true;
        if (typeof nextProps.game !== 'undefined') {
            if (nextProps.game.state !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT && this.gameRunning) {
                this.gameRunning = false;
                setTimeout(() => this.props.fulfilled(), 3000);
            }
        }
    }

    render() {
        let messages = [
            { text: 'TUTORIAL_FACTORY_MESSAGE_1', type: 'text', delay: 1000 },
            { src: 'factory', type: 'image', delay: 2500, alt: 'factory message icon' },
            { text: 'TUTORIAL_FACTORY_MESSAGE_2', type: 'text', delay: 2500 },
            { text: 'TUTORIAL_FACTORY_MESSAGE_3', type: 'text', delay: 3500 },
            { text: 'TUTORIAL_FACTORY_MESSAGE_4', type: 'text'},
        ]
        return <ChatLikeInstructions messages={messages} appbar={this.props.appbar}/>;
    }
}

BuildFactoryPage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.object.isRequired
}

const mapStateToProps = state => ({ game: state.gameplay.game });
const BuildFactoryPageContainer = connect(mapStateToProps)(BuildFactoryPage);
export default BuildFactoryPageContainer;