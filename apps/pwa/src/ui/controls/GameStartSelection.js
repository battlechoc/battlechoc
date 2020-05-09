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
        [theme.breakpoints.landscape.smartphone]: {
            flexDirection: 'row'
        }
    },
    start: {
        padding: 84,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundImage: 'url(/images/first-turn.svg)',
        [theme.breakpoints.landscape.smartphone]: {
            padding: 108
        }
    },
    button: {
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
        height: '25vh',
        width: '25vh',
        border: `3px solid ${theme.color.secondary.light}`,
        borderRadius: '50%',
        display: 'flex',
        position: 'relative',
        alignSelf: 'center',
        alignItems: 'center',
        margin: 10,
        justifyContent: 'center',
        cursor: 'pointer',
        [theme.breakpoints.landscape.smartphone]: {
            height: '30vw',
            width: '30vw',
        }
    },
    cream: {
        display: 'flex',
        justifyContent: 'center',
        position: 'absolute',
        top: 0,
        left: 0,
        '& > div': {
            padding: 32,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            backgroundImage: 'url(/images/cream.svg)'
        },
        '& > p': {
            position: 'absolute',
            top: 16,
            '-webkit-text-stroke': `1px ${theme.color.secondary.dark}`,
            '-webkit-font-smoothing': 'antialiased',
            fontFamily: 'Bangers',
            margin: '0 0 0 -3px',
            fontSize: '2rem'
        }
    },
    creamy: {
        position: 'absolute',
        padding: 9,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundImage: 'url(/images/cream.svg)',
        transform: 'rotateY(-50deg)',
        transform: 'rotateZ(-135deg)'
    }
}));

const GameStartSelection = props => {
    const classes = useStyles();
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
        const sizeClassName = (game.board.size.cols === 6) ? "six" : (game.board.size.cols === 8) ? "eight" : "ten";
        return <div key={i} className={cell.previewStyle + " " + sizeClassName}>
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
                <div className="fields">
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
                <div className="fields">
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