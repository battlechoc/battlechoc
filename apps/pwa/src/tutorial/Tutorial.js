import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import { AppBar, Toolbar, Typography, IconButton } from '@material-ui/core';
import { ArrowBackIos as ArrowBackIcon, ArrowForwardIos as ArrowForwardIcon, Done } from '@material-ui/icons';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
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

class Tutorial extends Component {
    constructor(props) {
        super(props);
        this.state = {
            page: 0,
            open: false,
            maxPages: 5
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
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        this.setState({ open: false });
        this.props.closeTutorial(startGame);   
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

        return (
            <div id="tutorial">
                {pages[this.state.page]}

                <Dialog
                  fullWidth={true}
                  fullScreen={this.props.fullScreen}
                  open={this.state.open}
                  onClose={this.closeTutorial}
                  aria-labelledby="report-form-dialog-title"
                >
                  <DialogTitle id="report-form-dialog-title">{t[this.props.language].TUTORIAL_DIALOG_TITLE}</DialogTitle>
                  <DialogContent>
                    <Typography>{t[this.props.language].TUTORIAL_DIALOG_MESSAGE}</Typography>
                    <Typography color="primary" className="hint">{"\u27AA " + t[this.props.language].TUTORIAL_DIALOG_HINT}</Typography>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => this.closeTutorial(false)} color="primary">
                      {t[this.props.language].TUTORIAL_DIALOG_BACK}
                    </Button>
                    <Button onClick={() => this.closeTutorial(true)} color="primary">
                      {t[this.props.language].TUTORIAL_DIALOG_PLAY_GAME}
                    </Button>
                  </DialogActions>
                </Dialog>

            </div>
        );
    }
}

Tutorial.propTypes = {
    closeTutorial: PropTypes.func.isRequired,
    loadSituation: PropTypes.func.isRequired
}

const mapStateToProps = state => ({ language: state.ui.language });
const TutorialContainer = connect(mapStateToProps)(Tutorial);

export default withMobileDialog({ breakpoint: 'sm' })(TutorialContainer);