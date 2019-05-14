import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { multiplayer } from '../Multiplayer';
import { selectAttack } from './UiActions';
import { AttackType } from '../gameplay/GameEntities';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import Jukebox from './Jukebox';

class AttackPalette extends Component {
    componentWillMount() {
        this.attacksForSeclection = [{
            type: AttackType.TRUFFLE,
            className: 'cannon',
            alt: 'cannon preview'
        }, {
            type: AttackType.BUNNY,
            className: 'bunny',
            alt: 'easter factory'
        }, {
            type: AttackType.FRUIT,
            className: 'fruitCannon',
            alt: 'fruit cannon'
        }, {
            type: AttackType.HOT_CHOCOLATE,
            className: 'ballista',
            alt: 'hot chocolate ballista'
        }];
    }

    attackSelectionIsVisible() {
        return this.props.state === GameStateTypes.ATTACK_PHASE && multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true;
    }

    playerCanAttack(type) {
        return this.props.game.players[multiplayer.localPlayerIndex].attacks[type] > 0
    }

    attacks(attackType) {
        const player = this.props.game.players[multiplayer.localPlayerIndex];
        return player.attacks[attackType];
    }

    attacksPerTurn(attackType) {
        const player = this.props.game.players[multiplayer.localPlayerIndex];
        return player.attacksPerTurn[attackType];
    }

    render() {
        if (this.props.isVisible) {
            return (
                <div id="attackSelection">
                    {(() => {
                        if (this.attackSelectionIsVisible()) {
                            return this.attacksForSeclection.map((attack, i) => {
                                let canAttack = this.playerCanAttack(attack.type);
                                let className = canAttack ? (this.props.selectedAttack === attack.type ? 'selected previewContainer' : 'canbuild previewContainer') : 'previewContainer';
                                return <div key={i}>
                                    <div className={className} onClick={() => {
                                            if (canAttack) {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.props.selectAttack(attack.type);
                                            }
                                        }}>
                                        <div className="attackCount">{this.attacks(attack.type)}</div>
                                        <div style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} 
                                             className={attack.className + (canAttack ? ' enabled preview' : ' disabled preview')} />
                                    </div>
                                </div>
                            });
                        }
                    })()}
                </div>
            );
        } else {
            return null;
        }
    }
}

AttackPalette.propTypes = {
    isVisible: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    selectedAttack: state.ui.selectedAttack
});

const mapDispatchToProps = {
    selectAttack
};

const AttackPaletteContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(AttackPalette);

export default AttackPaletteContainer;