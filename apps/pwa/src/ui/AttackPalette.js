import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { selectAttack } from './UiActions';
import { AttackType } from '../gameplay/GameEntities';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class AttackPalette extends Component {
    componentWillMount() {
        this.attacksForSeclection = [{
            type: AttackType.TRUFFLE,
            image: 'images/cannon_icon.png',
            alt: 'cannon preview'
        }, {
            type: AttackType.BUNNY,
            image: 'images/spying_easter_bunny_icon.png',
            alt: 'easter factory'
        }, {
            type: AttackType.FRUIT,
            image: 'images/fruitCannon_icon.png',
            alt: 'fruit cannon'
        }, {
            type: AttackType.HOT_CHOCOLATE,
            image: 'images/hotChocolateBallista_icon.png',
            alt: 'hot chocolate ballista'
        }];
    }

    attackSelectionIsVisible() {
        return this.props.state === GameStateTypes.ATTACK_PHASE && this.props.game.currentPlayerIndex === 0;
    }

    playerCanAttack(type) {
        return this.props.game.players[0].attacks[type] > 0
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
                                return <div className={className} key={i}>
                                    <div className={canAttack ? '' : 'disabled'}></div>
                                    <img alt={attack.alt} className={canAttack ? 'enabled preview' : 'preview'} src={attack.image} onClick={() => {
                                        if (canAttack) {
                                            this.props.selectAttack(attack.type);
                                        }
                                    }} />
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