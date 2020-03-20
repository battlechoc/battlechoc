import React from 'react';
import { connect } from 'react-redux';
import { multiplayer } from '../../Multiplayer';
import { selectAttack } from '../UiActions';
import { GameStateTypes, BattlechocError, AttackType } from 'battlechoc-shared-functions';
import { Jukebox } from '../misc';
import LockIcon from '@material-ui/icons/Lock';

const AttackPalette = props => {
    const attacksForSeclection = [{
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
    

    const attackSelectionIsVisible = () => {
        return props.state === GameStateTypes.ATTACK_PHASE && multiplayer.isLocalPlayer(props.game.currentPlayerIndex) === true;
    }

    const playerCanAttack = type => {
        return props.game.players[multiplayer.localPlayerIndex].attacks[type] > 0
    }

    const attacks = attackType => {
        return props.game.players[multiplayer.localPlayerIndex].attacks[attackType];
    }

    const selectAttack = attackType => {
        props.selectAttack(attackType).catch(error => {
            if (error instanceof BattlechocError) {
                console.warn(error);
            } else {
                throw error;
            }
        });
    }

    const isAttackSelected = attackType => {
        return props.selectedAttack === attackType;
    }

    let whitelist = props.whitelist;
    if (!props.tutorial) {
        if ( props.score < 200) {
            whitelist = [AttackType.TRUFFLE];
        } else if ( props.score < 500) {
            whitelist = [AttackType.TRUFFLE, AttackType.BUNNY, AttackType.HOT_CHOCOLATE];
        }
    }

    return (
        <div id="attackSelection">
            {(() => {
                if (attackSelectionIsVisible() || typeof props.pseudoGame !== 'undefined') {
                    return attacksForSeclection.map((attack, i) => {
                        if (typeof whitelist !== 'undefined') {
                            if (!whitelist.includes(attack.type)) {
                                if (!props.tutorial) {
                                    return <div className="unlocked-entity preview" key={i}><LockIcon className="lock-icon" /></div>;
                                } else {
                                    return null
                                }
                            }
                        }

                        const canAttack = playerCanAttack(attack.type);
                        const className = canAttack ? (isAttackSelected(attack.type) ? 'selected previewContainer' : 'canbuild previewContainer') : 'previewContainer';
                        return <div key={i}>
                            <div className={className} onClick={() => {
                                if (canAttack) {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    selectAttack(attack.type);
                                }
                            }}>
                                <div className="attackCount">{attacks(attack.type)}</div>
                                <div style={{ backgroundImage: 'url(/images/toolbar_icon_palette.png)' }}
                                    className={attack.className + (canAttack ? ' enabled preview' : ' disabled preview')} />
                            </div>
                        </div>
                    });
                }
            })()}
        </div>
    );
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    selectedAttack: state.ui.selectedAttack,
    whitelist: state.ui.whitelistAttacks,
    score: state.ui.playerInfos.stats.score,
    tutorial: state.ui.tutorial
});

const mapDispatchToProps = {
    selectAttack
};

const AttackPaletteContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(AttackPalette);

export default AttackPaletteContainer;