import React from 'react';
import { connect } from 'react-redux';
import { chooseField, chooseStart } from '../../gameplay/GameActions';
import { GameStateTypes, EntityType } from 'battlechoc-shared-functions';
import StartIcon from '@material-ui/icons/SupervisorAccount';
import { multiplayer } from '../../Multiplayer';
import { Jukebox } from '../misc';

const GameStartSelection = props => {
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
        let classNames = 'button'
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
        let className = 'without cream';
        if (cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM)) { 
            className = 'cream';
        }
        const sizeClassName = (game.board.size.cols === 6) ? "six" : (game.board.size.cols === 8) ? "eight" : "ten";
        return <div key={i} className={cell.previewStyle + " " + sizeClassName}>
            <img className={className} alt="filled with cream" src="/images/cream_preview.png" />
        </div>
    };

    return (
        <div className="choose">
            <div className={(unlocked ? 'active ' : 'inactive') + ' button'} onClick={() => choose('LEFT_GAMEFIELD')}>
                {(() => {
                    if (typeof game.board !== 'undefined') {
                        const creamedCells = game.board.fields[0].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
                        return <div className="creamedCellCount">
                            <img alt="filled with cream" src="/images/cream_preview.png" />
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
                <div className="stackedIcon"><div className="firstIcon">#1</div><StartIcon fontSize="large" /></div>
            </div>

            <div className={(unlocked ? 'active ' : 'inactive') + ' button'} onClick={() => choose('RIGHT_GAMEFIELD')}>
                {(() => {
                    if (typeof game.board !== 'undefined') {
                        const creamedCells = game.board.fields[1].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
                        return <div className="creamedCellCount">
                            <img alt="filled with cream" src="/images/cream_preview.png" />
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