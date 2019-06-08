import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ChatLikeInstructions from './ChatLikeInstructions';
import { connect } from 'react-redux';
import { EntityType, getEntityDescriptor, AttackType } from '../gameplay/GameEntities';
import { Jukebox } from '../ui/misc';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import BunnyAndXmasTutorialSituation from '../situations/tutorial/BunnyAndXmasTutorial';

class BunnyAndXmasPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            messages: [
                { text: 'The opponent\'s gamefield is filled with cream. Would you like to bring some light into the darkness?', type: 'text', delay: 2500 },
                { text: 'Use the spying easter bunny to uncover  all the cream on your oppoent\'s gamefield', type: 'text', delay: 3000 },
                { text: 'The bunny is going to uncover the area around the selected field', type: 'text', delay: 3000 }
            ]
        };
        this.game = BunnyAndXmasTutorialSituation.game;
    }

    buildCallback(building, celltype) {
        let description = getEntityDescriptor(building)
        if (building === EntityType.XMAS_FACTORY) {
            this.setState({ 
                messages: [...this.state.messages, 
                           { text: 'Now it\'s your opponent\'s turn. This animation:', type: 'text', delay: 1000},
                           { src: '../animations/loading.gif', type: 'image', delay: 500, alt: 'opponent turn animation' },
                           { text: 'indicates that your opponent is thinking', type: 'text', delay: 1000}]
            });
            this.game.gameplay.game.players[0].cacao -= description.costs;
            this.game.ui.selectedBuilding =undefined;
            this.game.gameplay.game.currentPlayerIndex = 1;
            this.forceUpdate();

            this.simulateOpponentTurn = setTimeout(() => {
                this.gamefield.microGamefield.receiveBallista({row: 1, col: 1});
                this.gamefield.opponentGamefield.meltDownEasterBunny();
                this.game.gameplay.game.currentPlayerIndex = 0;
                this.game.gameplay.game.players[0].attacks[AttackType.HOT_CHOCOLATE] = 1;
                this.game.gameplay.game.players[0].attacksPerTurn[AttackType.HOT_CHOCOLATE] = 1;
                this.game.gameplay.game.state = GameStateTypes.ATTACK_PHASE;
                this.game.ui.selectedAttack = AttackType.HOT_CHOCOLATE;
                this.forceUpdate();
            }, 4000);
        }
    }

    attackCallback(attackType, position) {
        let attackedField = this.game.gameplay.game.board.fields[1].grid[position.row * 3 + position.col]

        if (attackType === AttackType.HOT_CHOCOLATE) {
            this.game.gameplay.game.board.fields[1].grid[position.row * 3 + position.col].molten = true;
            this.gamefield.meltDownField()
        }
        if (attackedField.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY) && attackType === AttackType.HOT_CHOCOLATE) {
            setTimeout(() => this.props.fulfilled(), 1000);
        } else if (this.state.messages.length === 3 && attackType === AttackType.BUNNY) {
            this.setState({
                messages: [...this.state.messages, 
                           { text: 'Oh no! Your opponent also has a spying easter bunny ...', type: 'text', delay: 2500}]
            });
            this.gotoBuildPhase();
        }
    }

    gotoBuildPhase() {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.gamefield.triggerFlyingTreeInfo();
        this.game.gameplay.game.state = GameStateTypes.BUILD_PHASE;
        this.game.gameplay.game.players[0].buildings = this.game.gameplay.game.players[0].buildingsPerTurn;
        this.game.gameplay.game.players[0].attacks[AttackType.BUNNY] = this.game.gameplay.game.players[0].attacksPerTurn[AttackType.BUNNY];
        this.game.gameplay.game.players[0].attacks[AttackType.HOT_CHOCOLATE] = this.game.gameplay.game.players[0].attacksPerTurn[AttackType.HOT_CHOCOLATE];

        if (this.state.messages.length === 4) {
            this.setState({ 
                messages: [...this.state.messages, 
                { text: 'Take this cacao to build a xmas factory. It will protect you from spying attacks', type: 'text', delay: 2500},
                { text: 'If the bunny is going to spy an area that also conatins a xmas factory..', type: 'text', delay: 2500},
                { text: 'It gets melted down and you get a hot chocolate ballista', type: 'text', delay: 2500}]
            });
            this.game.gameplay.game.players[0].cacao = 100;
            this.simulateBuildingSelection(EntityType.XMAS_FACTORY);
        }   
        this.forceUpdate();
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