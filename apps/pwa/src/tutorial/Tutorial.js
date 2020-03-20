import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import { AppBar, Toolbar, IconButton } from '@material-ui/core';
import { ArrowBackIos as ArrowBackIcon, ArrowForwardIos as ArrowForwardIcon, Done } from '@material-ui/icons';
import { Jukebox, translate as t, keys as tr } from '../ui/misc';
import { ServerRequest } from '../helper/settings';
import OfflineStore from '../OfflineStore';
import { updatePlayerStats, showNotification } from '../ui/UiActions';
import PlayerNameInput from '../ui/controls/PlayerNameInput';
import BattlechocDialog from '../ui/dialogs/BattlechocDialog';
import LoopAnimation from './LoopAnimation';
import { manipulateGame } from '../gameplay/GameActions';
import { ActionValidationError, EmptyPlayerStats } from 'battlechoc-shared-functions';
import logger from '../helper/logger';
import { BattlechocIntro, Factory, CacaoTree, RumTruffleCannon, Cream, TutorialSituations, FactoryExtension, EasterBunny, XmasFactory, HotChocolateBallista, ChocolateFountain, FruitCannon, DonutFactory, Donuts } from'../situations/tutorial/';

const Tutorial = props => {
    const [page, setPage] = useState(0);
    const [open, setOpen] = useState(false);
    const [playerHasName, setPlayerHasName] = useState(props.playerInfos.stats.username !== EmptyPlayerStats.username)
    
    const { manipulateGame, spawnInfo, setRenderLoop, reset, loadSituation, detonateAtPosition, selectBuilding, tapBuilding, selectAttack } = props;
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
    
    const loopAnimation = useRef(new LoopAnimation(() => props.game, manipulate, spawnInfo, setRenderLoop, reset, loadSituation, detonateAtPosition, selectBuilding, tapBuilding, selectAttack)) 
    loopAnimation.current.getGame = () => props.game;

    const getSituation = situation => {
        switch (situation) {
            case TutorialSituations.BATTLECHOC_INTRO:
                return BattlechocIntro;
            case TutorialSituations.FACTORY:
                return Factory;
            case TutorialSituations.CACAO_TREE:
                return CacaoTree;
            case TutorialSituations.RUM_TRUFFLE_CANNON:
                return RumTruffleCannon;
            case TutorialSituations.CREAM:
                return Cream;
            case TutorialSituations.FACTORY_EXTENSION:
                return FactoryExtension;
            case TutorialSituations.EASTER_BUNNY:
                return EasterBunny;
            case TutorialSituations.XMAS_FACTORY:
                return XmasFactory;
            case TutorialSituations.HOT_CHOCOLATE_BALLISTA:
                return HotChocolateBallista;
            case TutorialSituations.CHOCOLATE_FOUNTAIN:
                return ChocolateFountain;
            case TutorialSituations.FRUIT_CANNON:
                return FruitCannon;
            case TutorialSituations.DONUT_FACTORY:
                return DonutFactory;
            case TutorialSituations.DONUTS:
                return Donuts;
            default:
                throw new Error(`Unkown loop ${situation}`);
        }
    }
    
    useEffect(() => {
        loopAnimation.current.start(getSituation(props.loopAnimations[0]));
    }, [props.loopAnimations]);

    const next = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        loopAnimation.current.start(getSituation(props.loopAnimations[ page + 1 ]));
        setPage(page + 1);
    }

    const back = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        loopAnimation.current.start(getSituation(props.loopAnimations[ page - 1 ]));
        if (page > 0) {
            setPage(page - 1);
        }
    }

    const closeTutorial = startGame => {
        if (playerHasName) {
            loopAnimation.current.stop();
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            setOpen(false);
            if (props.notificationOnLoopsEnd) {
                props.showNotification(props.notificationOnLoopsEnd);
            }
            props.closeTutorial(startGame);
        }
    }

    const setPlayerName = playerName => {
        ServerRequest('post', '/user/username', { username: playerName })
        .then(() => {        
            props.updatePlayerStats({ username: playerName });
            OfflineStore.playerStore.get('stats').then(playerStats => {
                playerStats.username = playerName;
                OfflineStore.playerStore.set('stats', playerStats);
            });
            setPlayerHasName(true);
        })
        .catch(error => console.warn(error));
    }

    
    let backIcon = <IconButton id="prev-loop" color="inherit" aria-label="back" onClick={back}><ArrowBackIcon /></IconButton>
    let nextIcon = <IconButton id="next-loop" color="inherit" aria-label="next" onClick={next}><ArrowForwardIcon /></IconButton>
    if (page === 0) {
        backIcon = null;
    }

    const situation = getSituation(props.loopAnimations[page]);

    if (page >= props.loopAnimations.length - 1) {
        nextIcon = <IconButton color="inherit" aria-label="close tutorial" onClick={() => {
            if (playerHasName) {
                closeTutorial(false);
            } else { 
                setOpen(true);
            }
        }}><Done /></IconButton>
    }

    let dialogTitle = t(tr.TUTORIAL_DIALOG_TITLE_BEFORE);
    let dialogContent = <div>
        <PlayerNameInput setPlayerName={setPlayerName} current={props.playerInfos.stats.username}/>
        <p style={{ color: '#324D5C' }}>{t(tr.TUTORIAL_CHOOSE_NAME_INFO)}</p>
    </div>;
    let canClose = false;

    if (playerHasName) {
        dialogTitle = t(tr.TUTORIAL_DIALOG_TITLE);
        dialogContent = <div className="tutorial-finished">
            <p>{t(tr.TUTORIAL_DIALOG_MESSAGE)} {t(tr.TUTORIAL_DIALOG_HINT)}</p>
            <div className="menuButton" style={{ fontSize: '1.1rem' }} onClick={() => closeTutorial(true)}>
                {t(tr.TUTORIAL_DIALOG_PLAY_GAME)}
            </div>
        </div>;
        canClose = true;
    }

    return (
        <div id="tutorial">
            <div>
                <AppBar position="static" color="secondary" className="tutorialAppbar">
                <Toolbar>
                    { backIcon }
                    <h6 className="tutorial-headline">{ situation.title }</h6>
                    { nextIcon }
                </Toolbar>
                </AppBar>
                <div className="battlechoc-tutorial-info"><p>{ situation.description }</p></div>
            </div>
            <BattlechocDialog
                open={open}
                close={() => closeTutorial(false)}
                closable={ canClose }
                autoHideTitle={ true }
                title={ dialogTitle }>
                { dialogContent }
            </BattlechocDialog>
        </div>
    );
    
}

Tutorial.propTypes = {
    closeTutorial: PropTypes.func.isRequired,
    loadSituation: PropTypes.func.isRequired,
    reset: PropTypes.func.isRequired,
    setRenderLoop: PropTypes.func.isRequired,
    spawnInfo: PropTypes.func.isRequired,
    detonateAtPosition: PropTypes.func.isRequired
}

const mapStateToProps = state => ({ 
    game: state.gameplay.game,
    notificationOnLoopsEnd: state.ui.notificationOnLoopsEnd,
    playerInfos: state.ui.playerInfos,
    loopAnimations: state.ui.loopAnimations
});

const mapDispatchToProps = { updatePlayerStats, manipulateGame, showNotification };

const TutorialContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Tutorial);

export default TutorialContainer;