import React from 'react';
import { connect } from 'react-redux';
import { multiplayer } from '../../Multiplayer';
import { selectAttack } from '../UiActions';
import { GameStateTypes, BattlechocError, AttackType } from 'battlechoc-shared-functions';
import { Jukebox } from '../misc';
import { createUseStyles } from 'react-jss';
import { sharedPaletteStyles } from './BuildingPalette';

const useStyles = createUseStyles(theme => ({
    count: {
        position: 'absolute',
        fontSize: '5vw',
        color: 'white',
        textShadow: '0.4vw 0.4vw 0.2vw #222',
        fontFamily: 'Bangers',
        '-webkit-text-stroke': `0.2vw ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        marginLeft: 5,
        zIndex: 10,
        width: 'min-content !important',
        height: 'min-content !important',
        bottom: '-18%',
        right: 0,
        [theme.breakpoints.orientation.portrait]: {
            fontSize: '8vw',
            textShadow: '0.5vw 0.5vw 0.2vw #222',
            '-webkit-text-stroke': `0.3vw ${theme.color.secondary.dark}`,
        },
        [theme.breakpoints.orientation.square]: {
            fontSize: '5.5vw',
            textShadow: '0.3vw 0.3vw 0.15vw #222',
            '-webkit-text-stroke': `0.2vw ${theme.color.secondary.dark}`
        }
    }
}));

const attacksForSeclection = [{
    type: AttackType.TRUFFLE,
    image: 'truffle-cannon',
}, {
    type: AttackType.BUNNY,
    image: 'easter-bunny',
}, {
    type: AttackType.FRUIT,
    image: 'fruit-cannon',
}, {
    type: AttackType.HOT_CHOCOLATE,
    image: 'ballista',
}];

const AttackPalette = props => {
    const classes = { ...useStyles(), ...sharedPaletteStyles() };
    const attackSelectionIsVisible = () => {
        return props.state === GameStateTypes.ATTACK_PHASE && multiplayer.isLocalPlayer(props.game.currentPlayerIndex);
    }

    const playerHasAttacksLeft = type => {
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

    let whitelist = props.whitelist;
    if (!props.tutorial) {
        if ( props.score < 200) {
            whitelist = [AttackType.TRUFFLE];
        } else if ( props.score < 500) {
            whitelist = [AttackType.TRUFFLE, AttackType.BUNNY, AttackType.HOT_CHOCOLATE];
        }
    }

    return (
        <div className={classes.palette}>
            {(() => {
                if (attackSelectionIsVisible() || typeof props.pseudoGame !== 'undefined') {
                    return attacksForSeclection.map((attack, i) => {
                        if (typeof whitelist !== 'undefined') {
                            if (!whitelist.includes(attack.type)) {
                                if (!props.tutorial) {
                                    return <div className={`${classes.preview} ${classes.locked}`} key={i}><div /></div>;
                                } else {
                                    return null
                                }
                            }
                        }

                        const attackPossible = playerHasAttacksLeft(attack.type);
                        return <div key={i}>
                            <div style={{ position: 'relative'}} className={`${classes.preview} ${props.selectedAttack === attack.type ? classes.selected : ''} ${attackPossible ? '' : classes.disabled}`} onClick={() => {
                                if (attackPossible) {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    selectAttack(attack.type);
                                }
                            }}>
                                <div className={classes.count}>{attacks(attack.type)}</div>
                                <div style={{ backgroundImage: `url(/images/${attack.image}-icon.svg)` }} />
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