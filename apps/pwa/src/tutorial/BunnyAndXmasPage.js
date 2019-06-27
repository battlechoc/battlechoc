import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ChatLikeInstructions from './ChatLikeInstructions';
import { connect } from 'react-redux';
import { EntityType } from '../gameplay/GameEntities';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class BunnyAndXmasPage extends Component {
    constructor(props) {
        super(props);
        this.gameRunning = true;
        this.state = {
            breakpoint: 0,
            messages: [
                { text: 'TUTORIAL_BUNNY_MESSAGE_1', type: 'text', delay: 2500 },
                { text: 'TUTORIAL_BUNNY_MESSAGE_2', type: 'text', delay: 3000 },
                { text: 'TUTORIAL_BUNNY_MESSAGE_3', type: 'text', delay: 3000 }
            ]
        };
    }

    componentWillReceiveProps(nextProps) {
        if (typeof this.props.game !== 'undefined' && typeof nextProps.game !== 'undefined') {
            if (!nextProps.game.board.fields[1].grid[4].occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && this.state.breakpoint === 0) {
                this.setState({
                    breakpoint: 1,
                    messages: [...this.state.messages, { text: 'TUTORIAL_BUNNY_MESSAGE_4', type: 'text', delay: 2500}]
                });
            } else if (nextProps.game.state === GameStateTypes.BUILD_PHASE && this.state.breakpoint === 1) {
                this.setState({
                    breakpoint: 2,
                    messages: [...this.state.messages, 
                    { text: 'TUTORIAL_BUNNY_MESSAGE_5', type: 'text', delay: 2500},
                    { text: 'TUTORIAL_BUNNY_MESSAGE_6', type: 'text', delay: 2500},
                    { text: 'TUTORIAL_BUNNY_MESSAGE_7', type: 'text', delay: 2500}]
                });
            } else if (nextProps.game.state === GameStateTypes.BUILD_PHASE && this.props.game.currentPlayerIndex === 0 && nextProps.game.currentPlayerIndex === 1 && this.state.breakpoint === 2) {
                this.setState({ 
                    breakpoint: 3,
                    messages: [...this.state.messages, 
                               { text: 'TUTORIAL_BUNNY_MESSAGE_8', type: 'text', delay: 1000},
                               { src: '../animations/loading.gif', type: 'image', delay: 500, alt: 'opponent turn animation' },
                               { text: 'TUTORIAL_BUNNY_MESSAGE_9', type: 'text', delay: 1000}]
                });           
            } else if (!nextProps.game.players[1].hasFactory && this.gameRunning) {
                this.gameRunning = false;
                setTimeout(() => this.props.fulfilled(), 3000);
            }
        }
    }

    render() {
        return <ChatLikeInstructions messages={this.state.messages} appbar={this.props.appbar}/>;
    }
}

BunnyAndXmasPage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.object.isRequired
}

const mapStateToProps = state => ({ game: state.gameplay.game });
const BunnyAndXmasPageContainer = connect(mapStateToProps)(BunnyAndXmasPage);
export default BunnyAndXmasPageContainer;