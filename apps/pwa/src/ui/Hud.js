import React, { Component } from 'react';
import './Hud.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { chooseField, chooseStart } from '../gameplay/GameActions';
import { GameStateTypes } from '../gameplay/GameplayReducer';
import { EntityType } from '../gameplay/GameEntities';
import Tooltip from './Tooltip';
import Actionbar from './Actionbar';
import InfoPanel from './InfoPanel';
import BuildingPalette from './BuildingPalette';
import AttackPalette from './AttackPalette';
import Button from '@material-ui/core/Button';
import StartIcon from '@material-ui/icons/SupervisorAccount';
import t from './Translation';
import InfoDialog from './InfoDialog';

class Hud extends Component {
    constructor(props) {
        super(props);
        this.state = {
            clickable: true
        }
    }

    componentDidMount() {
        this.props.onRef(this)
    }

    unlockUi() {
        this.setState({ clickable: true });
    }

    lockUi() {
        this.setState({ clickable: false });
    }

    showTurnMessage(message) {
        this.setState({ message: message });
        // estimate browser animation type
        let pivot = document.createElement("fakeelement");
        let animations = {
            "animation"      : "animationend",
            "OAnimation"     : "oAnimationEnd",
            "MozAnimation"   : "animationend",
            "WebkitAnimation": "webkitAnimationEnd"
        }
        let supportedAnimation = 'animation';

        for (let animation in animations) {
            if (typeof pivot.style[animation] !== 'undefined') {
                supportedAnimation = animations[animation];
            }
        }

        let textAnimation = document.getElementById('textAnimation');
        textAnimation.addEventListener(supportedAnimation, () => {
            this.setState({ message: undefined });
        });
        textAnimation.addEventListener('click', () => {
            this.setState({ message: undefined });
        });
    }

    choose(option) {
        if (this.state.clickable) {
            if (option === 'START' && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
                this.props.chooseStart({ issuer: this.props.game.players[0].id });
            } else if (option === 'LEFT_GAMEFIELD') {
                this.props.chooseField({ fieldIdx: 0, issuer: this.props.game.players[0].id });
            } else if (option === 'RIGHT_GAMEFIELD') {
                this.props.chooseField({ fieldIdx: 1, issuer: this.props.game.players[0].id });
            }
        }
    }

    isInitalStage() {
        return this.props.state === GameStateTypes.START ||
            this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START ||
            this.props.state === GameStateTypes.CHOOSE_FIELD;
    }

    isTitleScreen() {
        return typeof this.props.state === 'undefined';
    }

    estimateButtonClasses() {
        let classNames = 'button'
        if (this.state.clickable && this.props.state === GameStateTypes.CHOOSE_FIELD_OR_START) {
            classNames += ' active';
        } else if (this.props.state === GameStateTypes.CHOOSE_FIELD) {
            if (this.props.game.currentPlayerIndex === 0) {
                classNames += ' selectedByOpponent';
            } else {
                classNames += ' selectedByPlayer';
            }
        }
        return classNames;
    }

    render() {
        let showInGameMenu = !this.isInitalStage() && !this.isTitleScreen();
        let textAnimation = typeof this.state.message === 'undefined' ? undefined : <div id="textAnimation" className="zoom">{this.state.message}</div>
        return (
            <div>
                <Tooltip />
                <Actionbar toggleMusic={this.props.toggleMusic} showSettings={this.props.showSettings} />
                <InfoDialog isVisible={this.isTitleScreen()} />
                <AttackPalette isVisible={showInGameMenu} />
                <BuildingPalette isVisible={showInGameMenu} />
                <InfoPanel isVisible={showInGameMenu} />
                { textAnimation }
                
                {(() => {
                    if (this.isTitleScreen()) {
                        let buttons = [<Button key="0" color="primary" aria-label="new game" className="menuButton" variant="contained" onClick={() => this.props.prepareNewGameCallback()}>{t[this.props.language].NEW_GAME}</Button>];
                        if (this.props.resumeGamePossible === true) {
                            buttons.push(<Button key="1" color="primary" aria-label="resume game" className="menuButton" variant="contained" onClick={() => this.props.prepareResumedGameCallback()}>{t[this.props.language].RESUME_GAME}</Button>);
                        }
                        return (
                            <div id="mainMenu">
                                { buttons }
                            </div>
                        );
                    } else if (this.isInitalStage()) {
                        return (
                            <div className="choose">
                                <div className={(this.state.clickable ? 'active ' : null) + ' button'} onClick={() => this.choose('LEFT_GAMEFIELD')}>
                                    {(() => {
                                        if (typeof this.props.game.board !== 'undefined') {
                                            const creamedCells = this.props.game.board.fields[0].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                                            return <div className="creamedCellCount">
                                                <img alt="filled with cream" src="images/cream_preview.png" />
                                                <p>{creamedCells.length}</p>
                                            </div>
                                        }
                                    })()}
                                    <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board.fields[0].grid.map(
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

                                <div className={(this.state.clickable ? 'active ' : null) + ' button'} onClick={() => this.choose('RIGHT_GAMEFIELD')}>
                                    {(() => {
                                        if (typeof this.props.game.board !== 'undefined') {
                                            const creamedCells = this.props.game.board.fields[1].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                                            return <div className="creamedCellCount">
                                                <img alt="filled with cream" src="images/cream_preview.png" />
                                                <p>{creamedCells.length}</p>
                                            </div>
                                        }
                                    })()}
                                    <div className="fields">
                                        {(() => {
                                            if (typeof this.props.game.board !== 'undefined') {
                                                return this.props.game.board.fields[1].grid.map(
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
                })()}
            </div>
        );
    }
}

Hud.propTypes = {
    toggleMusic: PropTypes.func.isRequired,
    prepareNewGameCallback: PropTypes.func.isRequired,
    prepareResumedGameCallback: PropTypes.func.isRequired,
    showSettings: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state,
    language: state.ui.language,
    resumeGamePossible: state.ui.resumeGamePossible
});

const mapDispatchToProps = {
    chooseField,
    chooseStart
};

const HudContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Hud);

export default HudContainer;