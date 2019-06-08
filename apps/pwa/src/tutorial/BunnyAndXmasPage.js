import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ChatLikeInstructions from './ChatLikeInstructions';
import { connect } from 'react-redux';
import { EntityType } from '../gameplay/GameEntities';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class BunnyAndXmasPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            breakpoint: 0,
            messages: [
                { text: 'The opponent\'s gamefield is filled with cream. Would you like to bring some light into the darkness?', type: 'text', delay: 2500 },
                { text: 'Use the spying easter bunny to uncover  all the cream on your oppoent\'s gamefield', type: 'text', delay: 3000 },
                { text: 'The bunny is going to uncover the area around the selected field', type: 'text', delay: 3000 }
            ]
        };
    }

    componentWillReceiveProps(nextProps) {
        if (typeof this.props.game !== 'undefined') {
            if (!nextProps.game.board.fields[1].grid[4].occupiedBy.map(entity => entity.type).includes(EntityType.CREAM) && this.state.breakpoint === 0) {
                this.setState({
                    breakpoint: 1,
                    messages: [...this.state.messages, { text: 'Oh no! Your opponent also has a spying easter bunny ...', type: 'text', delay: 2500}]
                });
            } else if (nextProps.game.state === GameStateTypes.BUILD_PHASE && this.state.breakpoint === 1) {
                this.setState({
                    breakpoint: 2,
                    messages: [...this.state.messages, 
                    { text: 'Take this cacao to build a xmas factory. It will protect you from spying attacks', type: 'text', delay: 2500},
                    { text: 'If the bunny is going to spy an area that also conatins a xmas factory..', type: 'text', delay: 2500},
                    { text: 'It gets melted down and you get a hot chocolate ballista', type: 'text', delay: 2500}]
                });
            } else if (nextProps.game.state === GameStateTypes.BUILD_PHASE && this.props.game.currentPlayerIndex === 0 && nextProps.game.currentPlayerIndex === 1 && this.state.breakpoint === 2) {
                this.setState({ 
                    breakpoint: 3,
                    messages: [...this.state.messages, 
                               { text: 'Now it\'s your opponent\'s turn. This animation:', type: 'text', delay: 1000},
                               { src: '../animations/loading.gif', type: 'image', delay: 500, alt: 'opponent turn animation' },
                               { text: 'indicates that your opponent is thinking', type: 'text', delay: 1000}]
                });           
            } else if (!nextProps.game.players[1].hasFactory) {
                setTimeout(() => this.props.fulfilled(), 500);
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