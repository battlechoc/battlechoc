import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import { AppBar, Toolbar, IconButton } from '@material-ui/core';
import { ArrowBackIos as ArrowBackIcon, ArrowForwardIos as ArrowForwardIcon, Done } from '@material-ui/icons';
import { Jukebox } from '../ui/misc';
import BattlechocIntro from '../situations/tutorial/BattlechocIntro';
import Factory from '../situations/tutorial/Factory';
import CacaoTree from '../situations/tutorial/CacaoTree';
import RumTruffleCannon from '../situations/tutorial/RumTruffleCannon';
import Cream from  '../situations/tutorial/Cream';
import { Translation as t } from '../ui/misc';
import { ServerRequest } from '../helper/settings';
import OfflineStore from '../OfflineStore';
import { updatePlayerStats } from '../ui/UiActions';
import PlayerNameInput from '../ui/controls/PlayerNameInput';
import BattlechocDialog from '../ui/dialogs/BattlechocDialog';
import LoopAnimation from './LoopAnimation';
import { manipulateGame } from '../gameplay/GameActions';
import { ActionValidationError } from 'battlechoc-shared-functions';
import logger from '../helper/logger';

class Tutorial extends Component {
    constructor(props) {
        super(props);
        let username = 'Chocnonymous';
        if (typeof this.props.playerInfos.stats !== 'undefined') {
            if (typeof this.props.playerInfos.stats.username !== 'undefined') {
                username = this.props.playerInfos.stats.username;
            }
        }
        this.state = {
            page: 0,
            open: false,
            maxPages: 5,
            playerHasName: username !== 'Chocnonymous',
        }
    }

    async componentDidMount() {
        const { manipulateGame, spawnInfo, setRenderLoop, reset, loadSituation } = this.props;
        const manipulate = async state => { 
            try {
                await manipulateGame(state);
            } catch (error) {
                if (error instanceof ActionValidationError) {
                    logger.info('game manipulation invalid because tutorial already ended');
                } else {
                    logger.error(error);
                }
            }
            return JSON.parse(JSON.stringify(state));
        }
        this.loopAnimation = new LoopAnimation(() => this.props.game, manipulate, spawnInfo, setRenderLoop, reset, loadSituation);
        this.loopAnimation.start(BattlechocIntro);
    }

    next = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 0) {
            this.loopAnimation.start(Factory);
        } else if (this.state.page === 1) {
            this.loopAnimation.start(CacaoTree);
        } else if (this.state.page === 2) {
            this.loopAnimation.start(RumTruffleCannon);
        } else if (this.state.page === 3) {
            this.loopAnimation.start(Cream);
        }
        this.setState({ page: this.state.page + 1});
    }

    back = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 1) {
            this.loopAnimation.start(BattlechocIntro);
        } else if (this.state.page === 2) {
            this.loopAnimation.start(Factory);
        } else if (this.state.page === 3) {
            this.loopAnimation.start(CacaoTree);
        } else if (this.state.page === 4) {
            this.loopAnimation.start(RumTruffleCannon);
        } 

        if (this.state.page > 0) {
            this.setState({ page: this.state.page - 1});
        }
    }

    finishedTutorial = () => {
        this.setState({ open: true });
    }

    closeTutorial = startGame => {
        if (this.state.playerHasName) {
            if (typeof this.loopAnimation !== 'undefined') {
                this.loopAnimation.stop();
            }
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            this.setState({ open: false });
            this.props.closeTutorial(startGame);
        }
    }

    setPlayerName = playerName => {
        ServerRequest('post', '/user/username', { username: playerName })
        .then(() => {        
            this.props.updatePlayerStats({ username: playerName });
            OfflineStore.playerStore.get('stats').then(playerStats => {
                playerStats.username = playerName;
                OfflineStore.playerStore.set('stats', playerStats);
            });
            this.setState({ playerHasName: true });
        })
        .catch(error => console.warn(error));
    }

    render() {
        let backIcon = <IconButton color="inherit" aria-label="back" onClick={this.back}><ArrowBackIcon /></IconButton>
        let nextIcon = <IconButton color="inherit" aria-label="next" onClick={this.next}><ArrowForwardIcon /></IconButton>
        if (this.state.page === 0) {
            backIcon = null;
        }

        if (this.state.page >= this.state.maxPages - 1) {
            nextIcon = <IconButton color="inherit" aria-label="close tutorial" onClick={this.finishedTutorial}><Done /></IconButton>
        }

        let title = 'Welcome to battlechoc';
        let description = 'battlechoc is a turn-based strategy game with chocolate flavor. You win the game if you distroy the chocolate factory and cannons of your opponent';
        if (this.state.page === 1) {
            title = 'The Chocolate Factory';
            description = 'The factory can be build in the first turn and allows you to build all other entities. It performs better on a dark chocolate field';
        } else if (this.state.page === 2) {
            title = 'Appreciate the Cacao Tree';
            description = 'You need cacao to produce entities. The cacao tree will give you cacao per turn. It performs better on a white chocolate field';
        } else if (this.state.page === 3) {
            title = 'All you need is a Rum Truffle Cannon';
            description = 'To distroy your opponents entites you will need cannons. You can attack 1 field per turn using a Rum Truffle Cannon.';
        } else if (this.state.page === 4) {
            title = 'Never build without cream';
            description = 'All entities that are built in cream are invisible to your opponent';
        }

        let appbar = <AppBar position="static" color="secondary" className="tutorialAppbar">
                        <Toolbar>
                          { backIcon }
                          <h6 className="tutorial-headline">{ title }</h6>
                          { nextIcon }
                        </Toolbar>
                     </AppBar>

        let dialogTitle = t[this.props.language].TUTORIAL_DIALOG_TITLE_BEFORE;
        let dialogContent = <div>
            <PlayerNameInput setPlayerName={this.setPlayerName} current={this.props.playerInfos.stats.username} language={this.props.language}/>
            <p style={{ color: '#324D5C' }}>{t[this.props.language].TUTORIAL_CHOOSE_NAME_INFO}</p>
        </div>;
        let canClose = false;

        if (this.state.playerHasName) {
            dialogTitle = t[this.props.language].TUTORIAL_DIALOG_TITLE;
            dialogContent = <div className="tutorial-finished">
                <p>{t[this.props.language].TUTORIAL_DIALOG_MESSAGE} {t[this.props.language].TUTORIAL_DIALOG_HINT}</p>
                <div className="menuButton" style={{ fontSize: '1.1rem' }} onClick={() => this.closeTutorial(true)}>
                  {t[this.props.language].TUTORIAL_DIALOG_PLAY_GAME}
                </div>
            </div>;
            canClose = true;
        }

        return (
            <div id="tutorial">
                <div>
                    { appbar }
                    <div className="battlechoc-tutorial-info"><p>{ description }</p></div>
                </div>
                <BattlechocDialog
                    open={this.state.open}
                    close={() => this.closeTutorial(false)}
                    closable={ canClose }
                    autoHideTitle={ true }
                    title={ dialogTitle }>
                    { dialogContent }
                </BattlechocDialog>
            </div>
        );
    }
}

Tutorial.propTypes = {
    closeTutorial: PropTypes.func.isRequired,
    loadSituation: PropTypes.func.isRequired,
    reset: PropTypes.func.isRequired,
    setRenderLoop: PropTypes.func.isRequired,
    spawnInfo: PropTypes.func.isRequired
}

const mapStateToProps = state => ({ 
    game: state.gameplay.game, 
    language: state.ui.language, 
    playerInfos: state.ui.playerInfos 
});

const mapDispatchToProps = { updatePlayerStats, manipulateGame };

const TutorialContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Tutorial);

export default TutorialContainer;