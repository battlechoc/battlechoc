import React, { Component } from 'react';
import './InfoPanel.css';
import { AttackType } from '../gameplay/GameEntities';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

class InfoPanel extends Component {
    calculateAttacks() {
        let player = this.props.game.players[0];
        return  player.attacks[AttackType.TRUFFLE] +
                player.attacks[AttackType.HOT_CHOCOLATE] +
                player.attacks[AttackType.BUNNY];
    }

    calculateAttacksPerTurn() {
        let player = this.props.game.players[0];
        return  player.attacksPerTurn[AttackType.TRUFFLE] +
                player.attacksPerTurn[AttackType.HOT_CHOCOLATE] +
                player.attacksPerTurn[AttackType.BUNNY];
    }

    render() {
        if (this.props.isVisible) {
            return(
                <div id="gameMenu">
                    <div className="infoIcon">
                        <img alt="cacao" src="images/cacao_icon.png" />
                        <p>{this.props.game.players[0].cacao}</p>
                    </div>
                    <div className="infoIcon">
                        <img className="infoIcon"alt="buildings" src="images/buildings_icon.png" />
                        <p>{this.props.game.players[0].buildings + '/' + this.props.game.players[0].buildingsPerTurn}</p>
                    </div>    
                    <div className="infoIcon">
                        <img alt="cannon attacks" src="images/attacks_icon.png" />
                        <p>{this.calculateAttacks() + '/' + this.calculateAttacksPerTurn()}</p>
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }
}

InfoPanel.propTypes = {
    isVisible: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game
});

const InfoPanelContainer = connect(
    mapStateToProps
)(InfoPanel);

export default InfoPanelContainer;