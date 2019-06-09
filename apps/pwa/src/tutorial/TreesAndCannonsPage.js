import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import ChatLikeInstructions from './ChatLikeInstructions';
import { AttackType } from '../gameplay/GameEntities';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            breakpoint: 0,
            messages: [
                { text: 'The most important buildings are the cacao tree and the rum truffle cannon', type: 'text', delay: 500 },
                { src: 'cannon', type: 'image', delay: 500, alt: 'cannon message icon' },
                { src: 'cacaotree', type: 'image', delay: 3500, alt: 'cacao tree message icon' },
                { text: 'You win a game if you destroy the factory and all cannons of your opponent', type: 'text', delay: 2500 },
                { text: 'Plant a few trees to get cacao. You need it to build a cannon', type: 'text', delay: 2500 },
                { text: 'Build a cannon and attack your opponent\'s facotry to continue with the tutorial', type: 'text', delay: 2500 },
                { text: 'Hint: If you build a cacao tree on a white field it grows better produces 1.5x more cacao per round', type: 'text', delay: 1000}
            ]
        };
    }

    componentWillReceiveProps(nextProps) {
        if (typeof this.props.game !== 'undefined' && typeof nextProps.game !== 'undefined') {
            if (nextProps.game.players[0].cacao < 50 && this.state.breakpoint === 0) {
                this.setState({
                    breakpoint: 1,
                    messages: [...this.state.messages, 
                        { text: 'battlechoc is a turn-based strategy game. A turn consists of two game phases: Build and attack', type: 'text', delay: 2500},
                        { text: 'The game notices when no other action can be performed and guides you to the next phase or turn', type: 'text', delay: 2500},
                        { text: 'If you want to end a phase earlier you can use the Play or Fast Forward button above', type: 'text', delay: 2500},
                        { text: 'Build one more tree or use the button to end your turn', type: 'text', delay: 2500}
                    ]
                });
            } else if (this.props.game.currentPlayerIndex === 1 && nextProps.game.currentPlayerIndex === 0 && this.state.breakpoint === 1) {
                this.setState({
                    breakpoint: 2,
                    messages: [...this.state.messages, { text: 'look: you gained some cacao! Now you can build a cannon. Select the cannon by clicking the icon', delay: 2500 }]
                });
            } else if (nextProps.game.players[0].attacksPerTurn[AttackType.TRUFFLE] === 1 && this.state.breakpoint === 2) {
                this.setState({
                    breakpoint: 3,
                    messages: [...this.state.messages, { text: 'Now you are able to attack your opponent. Just finish your build phase and click on your opponent\'s facotry!', type: 'text', delay: 2500}]
                });            
            } else if (!nextProps.game.players[1].hasFactory) {
                setTimeout(() => this.props.fulfilled(), 500);
            }
        }
    }

    render() {
        return <ChatLikeInstructions messages={this.state.messages} appbar={this.props.appbar} />;
    }
}

TreesAndCannonsPage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.object.isRequired
}

const mapStateToProps = state => ({ game: state.gameplay.game });
const TreesAndCannonsPageContainer = connect(mapStateToProps)(TreesAndCannonsPage);
export default TreesAndCannonsPageContainer;