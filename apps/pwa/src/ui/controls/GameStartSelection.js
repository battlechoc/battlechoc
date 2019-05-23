import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { GameStateTypes } from '../../gameplay/GameplayReducer';
import { chooseField, chooseStart } from '../../gameplay/GameActions';
import { EntityType } from '../../gameplay/GameEntities';
import StartIcon from '@material-ui/icons/SupervisorAccount';
import { multiplayer } from '../../Multiplayer';
import { Jukebox } from '../misc';

class GameStartSelection extends Component {
    choose(option) {
        if (this.props.clickable) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            if (typeof this.props.pseudoGame === 'undefined') {
	            if (option === 'START' && this.getGameState() === GameStateTypes.CHOOSE_FIELD_OR_START) {
	                this.props.chooseStart({ issuer: this.props.game.players[this.getPlayerIndex()].id });
	            } else if (option === 'LEFT_GAMEFIELD') {
	                this.props.chooseField({ fieldIdx: 0, issuer: this.props.game.players[this.getPlayerIndex()].id });
	            } else if (option === 'RIGHT_GAMEFIELD') {
	                this.props.chooseField({ fieldIdx: 1, issuer: this.props.game.players[this.getPlayerIndex()].id });
	            }
	        } else {
	        	this.props.pseudoCallback();
	        }
        }
    }

    getPlayerIndex() {
        if (typeof this.props.pseudoGame === 'undefined') {
            return multiplayer.localPlayerIndex;
        } else {
            return 0;
        }
    }

    getGameState() {
		if (typeof this.props.pseudoGame === 'undefined') {
            return this.props.state
        } else {
            return this.props.pseudoGame.gameplay.game.state;
        }
    }

    estimateButtonClasses() {
        let classNames = 'button'
        console.log(this.getGameState())
        if (this.props.clickable && this.getGameState() === GameStateTypes.CHOOSE_FIELD_OR_START) {
            classNames += ' active';
        } else if (this.getGameState() === GameStateTypes.CHOOSE_FIELD) {
            if (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true) {
                classNames += ' inactive';
            } else {
                classNames += ' selectedByPlayer';
            }
        } else {
            classNames += ' inactive';
        }
        return classNames;
    }

    render() {
    	const game = typeof this.props.pseudoGame !== 'undefined' ? this.props.pseudoGame.gameplay.game : this.props.game; 
        return (
			<div className="choose">
                <div className={(this.props.clickable ? 'active ' : 'inactive') + ' button'} onClick={() => this.choose('LEFT_GAMEFIELD')}>
                    {(() => {
                        if (typeof game.board !== 'undefined') {
                            const creamedCells = game.board.fields[0].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                            return <div className="creamedCellCount">
                                <img alt="filled with cream" src="images/cream_preview.png" />
                                <p>{creamedCells.length}</p>
                            </div>
                        }
                    })()}
                    <div className="fields">
                        {(() => {
                            if (typeof game.board !== 'undefined') {
                                return game.board.fields[0].grid.map(
                                    (cell, i) => {
                                        if (cell.occupiedBy.includes(EntityType.CREAM)) {
                                            return <div key={i} className={cell.previewStyle}>
                                                <img className="cream" alt="filled with cream" src="images/cream_preview.png" />
                                            </div>
                                        } else {
                                            return <div key={i} className={cell.previewStyle}></div>
                                        }
                                    }
                                );
                            }
                        })()}
                    </div>
                </div>

                <div className={this.estimateButtonClasses()} onClick={() => this.choose('START')}>
                    <div className="stackedIcon"><div className="firstIcon">#1</div><StartIcon fontSize="large" /></div>
                </div>

                <div className={(this.props.clickable ? 'active ' : 'inactive') + ' button'} onClick={() => this.choose('RIGHT_GAMEFIELD')}>
                    {(() => {
                        if (typeof game.board !== 'undefined') {
                            const creamedCells = game.board.fields[1].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                            return <div className="creamedCellCount">
                                <img alt="filled with cream" src="images/cream_preview.png" />
                                <p>{creamedCells.length}</p>
                            </div>
                        }
                    })()}
                    <div className="fields">
                        {(() => {
                            if (typeof game.board !== 'undefined') {
                                return game.board.fields[1].grid.map(
                                    (cell, i) => {
                                        if (cell.occupiedBy.includes(EntityType.CREAM)) {
                                            return <div key={i} className={cell.previewStyle}>
                                                <img className="cream" alt="filled with cream" src="images/cream_preview.png" />
                                            </div>
                                        } else {
                                            return <div key={i} className={cell.previewStyle}></div>
                                        }
                                    }
                                );
                            }
                        })()}
                    </div>
                </div>
            </div>
       	);
    }
}

GameStartSelection.propTypes = {
	clickable: PropTypes.bool.isRequired,
	pseudoGame: PropTypes.object,
	pseudoCallback: PropTypes.func
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