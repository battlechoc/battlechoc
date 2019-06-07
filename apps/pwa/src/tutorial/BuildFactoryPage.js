import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import ChatLikeInstructions from './ChatLikeInstructions';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class BuildFactoryPage extends Component {
    componentWillReceiveProps(nextProps) {
        if (nextProps.game.state !== GameStateTypes.PLAYER_1_INITIAL_PLACEMENT) {
            this.props.fulfilled();
        }
    }

    render() {
        let messages = [
            { text: 'To build e.g. cacao trees or cannons, you need to build a chocolate factory', type: 'text', delay: 1000 },
            { src: 'factory', type: 'image', delay: 2500, alt: 'factory message icon' },
            { text: 'The factory allows you to build 2 buildings per turn', type: 'text', delay: 2500 },
            { text: 'Hint: If you build a factory on a black field it can work better and manages 3 buildings per round', type: 'text', delay: 3500 },
            { text: 'Build the factory by clicking on a field of your choice to continue with the tutorial', type: 'text'},
        ]
        return <ChatLikeInstructions messages={messages} appbar={this.props.appbar}/>;
    }
}

BuildFactoryPage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.object.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game
});

const BuildFactoryPageContainer = connect(mapStateToProps)(BuildFactoryPage);
export default BuildFactoryPageContainer;