import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import { AppBar, Toolbar, Typography, IconButton } from '@material-ui/core';
import { ArrowBackIos as ArrowBackIcon, ArrowForwardIos as ArrowForwardIcon, Done } from '@material-ui/icons';
import ChoosePage from './ChoosePage';
import BuildFactoryPage from './BuildFactoryPage';
import TreesAndCannonsPage from './TreesAndCannonsPage';
import BunnyAndXmasPage from './BunnyAndXmasPage';
import FountainAndFruitCannonPage from './FountainAndFruitCannonPage';
import { Jukebox } from '../ui/misc';
import ChoosePageTutorial from '../situations/tutorial/ChoosePageTutorial';
import FactoryTutorial from '../situations/tutorial/FactoryTutorial';
import TreeAndCannonTutorial from '../situations/tutorial/TreeAndCannonTutorial';
import BunnyAndXmasTutorial from '../situations/tutorial/BunnyAndXmasTutorial';
import FountainAndFruitCannonTutorial from '../situations/tutorial/FountainAndFruitCannonTutorial';
import { Translation as t } from '../ui/misc';
import { ServerRequest } from '../helper/settings';
import OfflineStore from '../OfflineStore';
import { updatePlayerStats } from '../ui/UiActions';
import PlayerNameInput from '../ui/controls/PlayerNameInput';
import BattlechocDialog from '../ui/dialogs/BattlechocDialog';

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

    componentDidMount() {
        this.props.loadSituation(ChoosePageTutorial);
    }

    fulfilled = () => {
        if ((this.state.page + 1) === this.state.maxPages) {
            this.finishedTutorial();
        } else {
            this.next();
        }
    }

    next = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 0) {
            this.props.loadSituation(FactoryTutorial);
        } else if (this.state.page === 1) {
            this.props.loadSituation(TreeAndCannonTutorial);
        } else if (this.state.page === 2) {
            this.props.loadSituation(BunnyAndXmasTutorial);
        } else if (this.state.page === 3) {
            this.props.loadSituation(FountainAndFruitCannonTutorial);
        } 
        this.setState({ page: this.state.page + 1});
    }

    back = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 1) {
            this.props.loadSituation(ChoosePageTutorial);
        } else if (this.state.page === 2) {
            this.props.loadSituation(FactoryTutorial);
        } else if (this.state.page === 3) {
            this.props.loadSituation(TreeAndCannonTutorial);
        } else if (this.state.page === 4) {
            this.props.loadSituation(BunnyAndXmasTutorial);
        } 

        if (this.state.page > 0) {
            this.setState({ page: this.state.page - 1});
        }
    }

    finishedTutorial = () => {
        this.setState({ open: true });
    }

    closeTutorial = startGame => {
        console.log('CLOSE TUTORIAL');
        if (this.state.playerHasName) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            this.setState({ open: false });
            this.props.closeTutorial(startGame);
        }
    }

    setPlayerName = playerName => {
        ServerRequest('post', '/user/username', { username: playerName })
        .then(response => {        
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

        let title = t[this.props.language].TUTORIAL_TITLE_1;
        if (this.state.page === 1) {
            title = t[this.props.language].TUTORIAL_TITLE_2;
        } else if (this.state.page === 2) {
            title = t[this.props.language].TUTORIAL_TITLE_3;
        } else if (this.state.page === 3) {
            title = t[this.props.language].TUTORIAL_TITLE_4;
        } else if (this.state.page === 4) {
            title = t[this.props.language].TUTORIAL_TITLE_5;
        }

        let appbar = <AppBar position="static" color="secondary" className="tutorialAppbar">
                        <Toolbar>
                          { backIcon }
                          <Typography variant="h6" className="tutorial-headline" color="inherit">
                          { title }
                          </Typography>
                          { nextIcon }
                        </Toolbar>
                     </AppBar>

        let pages = [
            <ChoosePage fulfilled={this.fulfilled} appbar={appbar}/>, 
            <BuildFactoryPage fulfilled={this.fulfilled} appbar={appbar}/>,
            <TreesAndCannonsPage fulfilled={this.fulfilled} appbar={appbar}/>,
            <BunnyAndXmasPage fulfilled={this.fulfilled} appbar={appbar}/>,
            <FountainAndFruitCannonPage fulfilled={this.fulfilled} appbar={appbar}/>
        ];

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
                {pages[this.state.page]}

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
    loadSituation: PropTypes.func.isRequired
}

const mapStateToProps = state => ({ language: state.ui.language, playerInfos: state.ui.playerInfos });
const mapDispatchToProps = { updatePlayerStats };

const TutorialContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Tutorial);

export default TutorialContainer;