import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { multiplayer } from '../../Multiplayer';
import { selectAttack } from '../UiActions';
import { AttackType } from '../../gameplay/GameEntities';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { Jukebox } from '../misc';

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

    attackSelectionIsVisible(game) {
        return this.props.state === GameStateTypes.ATTACK_PHASE && multiplayer.isLocalPlayer(game.currentPlayerIndex) === true;
    }

    playerCanAttack(game, type) {
        return game.players[multiplayer.localPlayerIndex].attacks[type] > 0
    }

    getPlayerIndex() {
        if (typeof this.props.pseudoGame === 'undefined') {
            return multiplayer.localPlayerIndex;
        } else {
            return 0;
        }
    }

    attacks(game, attackType) {
        const player = game.players[this.getPlayerIndex()];
        return player.attacks[attackType];
    }

    selectAttack(attackType) {
        if (typeof this.props.pseudoGame === 'undefined') {
            this.props.selectAttack(attackType);
        } else {
            this.props.simulateAttackSelection(attackType);
        }        
    }

    isAttackSelected(attackType) {
        if (typeof this.props.pseudoGame === 'undefined') {
            return this.props.selectedAttack === attackType;
        } else {
            return this.props.pseudoGame.ui.selectedAttack === attackType;
        }         
    }

    render() {
        const game = typeof this.props.pseudoGame !== 'undefined' ? this.props.pseudoGame.gameplay.game : this.props.game;
        if (this.props.isVisible) {
            return (
                <div id="attackSelection">
                    {(() => {
                        if (this.attackSelectionIsVisible(game) || typeof this.props.pseudoGame !== 'undefined') {
                            return this.attacksForSeclection.map((attack, i) => {
                                if (typeof this.props.whitelist !== 'undefined') {
                                    if (!this.props.whitelist.includes(attack.type)) {
                                        return null;
                                    }
                                }

                                let canAttack = this.playerCanAttack(game, attack.type);
                                let className = canAttack ? (this.isAttackSelected(attack.type) ? 'selected previewContainer' : 'canbuild previewContainer') : 'previewContainer';
                                return <div key={i}>
                                    <div className={className} onClick={() => {
                                            if (canAttack) {
                                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                                this.selectAttack(attack.type);
                                            }
                                        }}>
                                        <div className="attackCount">{this.attacks(game, attack.type)}</div>
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
    isVisible: PropTypes.bool.isRequired,
    pseudoGame: PropTypes.object,
    whitelist: PropTypes.array
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