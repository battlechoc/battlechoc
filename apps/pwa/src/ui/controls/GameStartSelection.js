import React from 'react';
import { connect } from 'react-redux';
import { chooseField, chooseStart } from '../../gameplay/GameActions';
import { GameStateTypes, EntityType } from 'battlechoc-shared-functions';
import { multiplayer } from '../../Multiplayer';
import { Jukebox } from '../misc';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    page: {
        marginTop: 20,
        display: 'flex',
        color: 'white',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        [theme.breakpoints.orientation.landscape]: {
            flexDirection: 'row'
        }
    },
    start: {
        padding: '15vw',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundImage: 'url(/images/first-turn.svg)',
        [theme.breakpoints.orientation.portrait]: {
            padding: '13vh'           
        }
    },
    button: {
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        height: '28vh',
        width: '28vh',
        border: `0.1vh solid ${theme.color.secondary.light}`,
        borderRadius: '50%',
        display: 'flex',
        position: 'relative',
        alignSelf: 'center',
        alignItems: 'center',
        margin: 10,
        justifyContent: 'center',
        cursor: 'pointer',
        [theme.breakpoints.orientation.landscape]: {
            height: '30vw',
            width: '30vw',
            border: `0.1vw solid ${theme.color.secondary.light}`,
        }
    },
    cream: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        top: 0,
        left: 0,
        '& > div': {
            padding: '4.5vw',
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            backgroundImage: 'url(/images/cream.svg)',
            [theme.breakpoints.orientation.portrait]: {
                padding: '4.2vh'           
            }
        },
        '& > p': {
            position: 'absolute',
            fontFamily: 'Bangers',
            margin: '0 0 0 -3px',
            textShadow: '0.1vw 0.1vw 0.3vw white',
            color: theme.color.secondary.dark,
            fontSize: '4vw',
            [theme.breakpoints.orientation.portrait]: {
                fontSize: '3.7vh'           
            }
        }
    },
    creamy: {
        position: 'absolute',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundImage: 'url(/images/cream.svg)',
        transform: 'rotateZ(-135deg)',
    },
    six: {
        flex: '1 0 16.666%',
        '& $creamy': {
            padding: '1.25vw',
            [theme.breakpoints.orientation.portrait]: {
                padding: '1.2vh'           
            }
        }
    },
    eight: {
        flex: '1 0 12.5%',
        '& $creamy': {
            padding: '1.2vw',
            [theme.breakpoints.orientation.portrait]: {
                padding: '1.1vh'           
            }
        }
    },
    ten: {
        flex: '1 0 10%',
        '& $creamy': {
            padding: '1.15vw',
            [theme.breakpoints.orientation.portrait]: {
                padding: '1vh'           
            }
        }
    },
    fields: {
        width: '20vw',
        height: '20vw',
        display: 'flex',
        flexWrap: 'wrap',
        transform: 'rotateZ(135deg)',
        '& > div': {
            borderRadius: '15%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        [theme.breakpoints.orientation.portrait]: {
            width: '18vh',
            height: '18vh',            
        }
    },
    white: {
        backgroundColor: '#bdbd83'
    },
    brown: {
        backgroundColor: '#523112'
    },
    black: {
        backgroundColor: '#140e09'
    }
}));

const GameStartSelection = props => {
    const classes = useStyles(props);
    const { game, state, chooseStart, chooseField } = props;
    const unlocked = multiplayer.isLocalPlayer(game.currentPlayerIndex);

    const choose = option => {
        if (unlocked) { 
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            if (option === 'START') {
                chooseStart({ issuer: game.players[multiplayer.localPlayerIndex].id });
            } else if (option === 'LEFT_GAMEFIELD') {
                chooseField({ fieldIdx: 0, issuer: game.players[multiplayer.localPlayerIndex].id });
            } else if (option === 'RIGHT_GAMEFIELD') {
                chooseField({ fieldIdx: 1, issuer: game.players[multiplayer.localPlayerIndex].id });
            }
        }
    }

    const estimateButtonClasses = () => {
        let classNames = classes.button
        if (unlocked && state === GameStateTypes.CHOOSE_FIELD_OR_START) {
            classNames += ' active';
        } else if (state === GameStateTypes.CHOOSE_FIELD) {
            if (multiplayer.isLocalPlayer(game.currentPlayerIndex)) {
                classNames += ' inactive';
            } else {
                if (unlocked) {
                    classNames += ' selectedByPlayer';
                } else {
                    classNames += ' inactiveSelected';
                }
            }
        } else {
            classNames += ' inactive';
        }
        return classNames;
    }
    
    const drawCell = (cell, i) => {
        const creamy = cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM);
        const sizeClassName = (game.board.size.cols === 6) ? classes.six : (game.board.size.cols === 8) ? classes.eight : classes.ten;
        return <div key={i} className={`${classes[cell.previewStyle]} ${sizeClassName}`}>
            <div className={creamy ? classes.creamy : ''} />
        </div>
    };

    return (
        <div className={classes.page}>
            <div className={(unlocked ? 'active ' : 'inactive ') + classes.button} onClick={() => choose('LEFT_GAMEFIELD')}>
                {(() => {
                    if (typeof game.board !== 'undefined') {
                        const creamedCells = game.board.fields[0].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
                        return <div className={classes.cream}>
                            <div />
                            <p>{creamedCells.length}</p>
                        </div>
                    }
                })()}
                <div className={classes.fields}>
                    {(() => {
                        if (typeof game.board !== 'undefined') {
                            return game.board.fields[0].grid.map(drawCell);
                        }
                    })()}
                </div>
            </div>

            <div className={estimateButtonClasses()} onClick={() => choose('START')}>
                <div className={classes.start}  />
            </div>

            <div className={(unlocked ? 'active ' : 'inactive ') + classes.button} onClick={() => choose('RIGHT_GAMEFIELD')}>
                {(() => {
                    if (typeof game.board !== 'undefined') {
                        const creamedCells = game.board.fields[1].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
                        return <div className={classes.cream}>
                            <div />
                            <p>{creamedCells.length}</p>
                        </div>
                    }
                })()}
                <div className={classes.fields}>
                    {(() => {
                        if (typeof game.board !== 'undefined') {
                            return game.board.fields[1].grid.map(drawCell);
                        }
                    })()}
                </div>
            </div>
        </div>
    );
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state
});

const mapDispatchToProps = {
    chooseField,
    chooseStart
};

const GameStartSelectionContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(GameStartSelection);

export default GameStartSelectionContainer;