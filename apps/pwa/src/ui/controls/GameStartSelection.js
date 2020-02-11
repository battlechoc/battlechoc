import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { chooseField, chooseStart } from '../../gameplay/GameActions';
import { GameStateTypes, EntityType } from 'battlechoc-shared-functions';
import StartIcon from '@material-ui/icons/SupervisorAccount';
import { multiplayer } from '../../Multiplayer';
import { Jukebox } from '../misc';

class GameStartSelection extends Component {
    choose(option) {
        if (this.props.clickable) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            if (option === 'START' && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
                this.props.chooseStart({ issuer: this.props.game.players[multiplayer.localPlayerIndex].id });
            } else if (option === 'LEFT_GAMEFIELD') {
                this.props.chooseField({ fieldIdx: 0, issuer: this.props.game.players[multiplayer.localPlayerIndex].id });
            } else if (option === 'RIGHT_GAMEFIELD') {
                this.props.chooseField({ fieldIdx: 1, issuer: this.props.game.players[multiplayer.localPlayerIndex].id });
            }
        }
    }

    estimateButtonClasses() {
        let classNames = 'button'
        if (this.props.clickable && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
            classNames += ' active';
        } else if (this.props.state === GameStateTypes.CHOOSE_FIELD) {
            if (multiplayer.isLocalPlayer(this.props.game.currentPlayerIndex) === true) {
                classNames += ' inactive';
            } else {
                if (this.props.clickable === true) {
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

    render() {
        let drawCell = (cell, i) => {
            let className = 'without cream';
            if (cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM)) { 
                className = 'cream';
            }
            return <div key={i} className={cell.previewStyle}>
                <img className={className} alt="filled with cream" src="/images/cream_preview.png" />
            </div>
        };
        return (
			<div className="choose">
                <div className={(this.props.clickable ? 'active ' : 'inactive') + ' button'} onClick={() => this.choose('LEFT_GAMEFIELD')}>
                    {(() => {
                        if (typeof this.props.game.board !== 'undefined') {
                            const creamedCells = this.props.game.board.fields[0].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
                            return <div className="creamedCellCount">
                                <img alt="filled with cream" src="/images/cream_preview.png" />
                                <p>{creamedCells.length}</p>
                            </div>
                        }
                    })()}
                    <div className="fields">
                        {(() => {
                            if (typeof this.props.game.board !== 'undefined') {
                                return this.props.game.board.fields[0].grid.map(drawCell);
                            }
                        })()}
                    </div>
                </div>

                <div className={this.estimateButtonClasses()} onClick={() => this.choose('START')}>
                    <div className="stackedIcon"><div className="firstIcon">#1</div><StartIcon fontSize="large" /></div>
                </div>

                <div className={(this.props.clickable ? 'active ' : 'inactive') + ' button'} onClick={() => this.choose('RIGHT_GAMEFIELD')}>
                    {(() => {
                        if (typeof this.props.game.board !== 'undefined') {
                            const creamedCells = this.props.game.board.fields[1].grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CREAM));
                            return <div className="creamedCellCount">
                                <img alt="filled with cream" src="/images/cream_preview.png" />
                                <p>{creamedCells.length}</p>
                            </div>
                        }
                    })()}
                    <div className="fields">
                        {(() => {
                            if (typeof this.props.game.board !== 'undefined') {
                                return this.props.game.board.fields[1].grid.map(drawCell);
                            }
                        })()}
                    </div>
                </div>
            </div>
       	);
    }
}

GameStartSelection.propTypes = {
	clickable: PropTypes.bool.isRequired
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