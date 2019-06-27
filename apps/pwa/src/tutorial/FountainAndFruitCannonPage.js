import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ChatLikeInstructions from './ChatLikeInstructions';
import { connect } from 'react-redux';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class FountainAndFruitCannonPage extends Component {
    constructor(props) {
        super(props);
        this.gameRunning = true;
        this.state = {
            breakpoint: 0,
            messages: [
                { text: 'TUTORIAL_FOUNTAIN_MESSAGE_1', type: 'text', delay: 3000 },
                { text: 'TUTORIAL_FOUNTAIN_MESSAGE_2', type: 'text', delay: 2500 }
            ]
        };
    }

    componentWillReceiveProps(nextProps) {
        if (typeof this.props.game !== 'undefined') {
            if (nextProps.game.state === GameStateTypes.ATTACK_PHASE && this.state.breakpoint === 0) {
                this.setState({
                    breakpoint: 1,
                    messages: [...this.state.messages, 
                    	{ text: 'TUTORIAL_FOUNTAIN_MESSAGE_3', type: 'text', delay: 2500},
                    	{ text: 'TUTORIAL_FOUNTAIN_MESSAGE_4', type: 'text', delay: 2500},
                    	{ text: 'TUTORIAL_FOUNTAIN_MESSAGE_5', type: 'text', delay: 2500}
                    ]
                });
            } else if (nextProps.game.players[0].cacao >= 40 && nextProps.game.state === GameStateTypes.BUILD_PHASE && nextProps.game.currentPlayerIndex === 0 && this.state.breakpoint === 1) {
                this.setState({ 
                    breakpoint: 2,
                    messages: [...this.state.messages, 
                               { text: 'TUTORIAL_FOUNTAIN_MESSAGE_6', type: 'text', delay: 1000},
                               { src: 'fruitCannon', type: 'image', delay: 2500, alt: 'fruit cannon message icon' },
                               { text: 'TUTORIAL_FOUNTAIN_MESSAGE_7', type: 'text', delay: 1000},
                               { text: 'TUTORIAL_FOUNTAIN_MESSAGE_8', type: 'text', delay: 1000}]
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

FountainAndFruitCannonPage.propTypes = {
    fulfilled: PropTypes.func.isRequired,
    appbar: PropTypes.object.isRequired
}

const mapStateToProps = state => ({ game: state.gameplay.game });
const FountainAndFruitCannonPageContainer = connect(mapStateToProps)(FountainAndFruitCannonPage);
export default FountainAndFruitCannonPageContainer;