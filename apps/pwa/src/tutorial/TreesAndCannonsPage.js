import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import ChatLikeInstructions from './ChatLikeInstructions';
import { AttackType } from '../gameplay/GameEntities';

class TreesAndCannonsPage extends Component {
    constructor(props) {
        super(props);
        this.gameRunning = true;
        this.state = {
            currentPlayerIndex: 0,
            breakpoint: 0,
            messages: [
                { text: 'TUTORIAL_TREES_MESSAGE_1', type: 'text', delay: 500 },
                { src: 'cannon', type: 'image', delay: 500, alt: 'cannon message icon' },
                { src: 'cacaotree', type: 'image', delay: 3500, alt: 'cacao tree message icon' },
                { text: 'TUTORIAL_TREES_MESSAGE_2', type: 'text', delay: 2500 },
                { text: 'TUTORIAL_TREES_MESSAGE_3', type: 'text', delay: 2500 },
                { text: 'TUTORIAL_TREES_MESSAGE_4', type: 'text', delay: 2500 },
                { text: 'TUTORIAL_TREES_MESSAGE_5', type: 'text', delay: 1000}
            ]
        };
    }

    componentDidUpdate() {
        if (typeof this.props.game !== 'undefined') {
            if (this.props.game.players[0].cacao < 50 && this.state.breakpoint === 0) {
                this.setState({
                    breakpoint: 1,
                    messages: [...this.state.messages, 
                        { text: 'TUTORIAL_TREES_MESSAGE_6', type: 'text', delay: 2500},
                        { text: 'TUTORIAL_TREES_MESSAGE_7', type: 'text', delay: 2500},
                        { text: 'TUTORIAL_TREES_MESSAGE_8', type: 'text', delay: 2500}
                    ]
                });
            } else if (this.state.currentPlayerIndex === 1 && this.props.game.currentPlayerIndex === 0 && this.state.breakpoint === 1) {
                this.setState({
                    breakpoint: 2,
                    messages: [...this.state.messages, { text: 'TUTORIAL_TREES_MESSAGE_9', type: 'text', delay: 2500 }]
                });
            } else if (this.props.game.players[0].attacksPerTurn[AttackType.TRUFFLE] === 1 && this.state.breakpoint === 2) {
                this.setState({
                    breakpoint: 3,
                    messages: [...this.state.messages, { text: 'TUTORIAL_TREES_MESSAGE_10', type: 'text', delay: 2500 }]
                });            
            } else if (!this.props.game.players[1].hasFactory && this.gameRunning) {
                this.gameRunning = false;
                setTimeout(() => this.props.fulfilled(), 3000);
            }

            if (this.state.currentPlayerIndex !== this.props.game.currentPlayerIndex) {
                this.setState({ currentPlayerIndex: this.props.game.currentPlayerIndex });
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