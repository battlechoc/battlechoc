import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import { AppBar, Toolbar, Typography, IconButton } from '@material-ui/core';
import { ArrowBackIos as ArrowBackIcon, ArrowForwardIos as ArrowForwardIcon, Close as CloseIcon } from '@material-ui/icons';
import ChoosePage from './ChoosePage';
import BuildFactoryPage from './BuildFactoryPage';
import TreesAndCannonsPage from './TreesAndCannonsPage';
import EasterBunnyAndXmasFactoryPage from './EasterBunnyAndXmasFactory';
import { Jukebox } from '../ui/misc';
import ChoosePageTutorial from '../situations/tutorial/ChoosePageTutorial';
import FactoryTutorial from '../situations/tutorial/FactoryTutorial';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class Tutorial extends Component {
    constructor(props) {
        super(props);
        this.state = {
            page: 0,
            maxPages: 4
        }
    }

    componentDidMount() {
        this.props.loadSituation(ChoosePageTutorial);
    }

    fulfilled = () => {
        if ((this.state.page + 1) === this.state.maxPages) {
            this.props.closeTutorial();
        } else {
            this.next();
        }
    }

    next = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 0) {
            this.props.loadSituation(FactoryTutorial);
        }
        this.setState({ page: this.state.page + 1});
    }

    back = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 1) {
            this.props.loadSituation(ChoosePageTutorial);
        }

        if (this.state.page > 0) {
            this.setState({ page: this.state.page - 1});
        }
    }

    render() {
        let backIcon = <IconButton color="inherit" aria-label="back" onClick={this.back}><ArrowBackIcon /></IconButton>
        let nextIcon = <IconButton color="inherit" aria-label="next" onClick={this.next}><ArrowForwardIcon /></IconButton>
        if (this.state.page === 0) {
            backIcon = <IconButton color="inherit" aria-label="close tutorial" onClick={this.props.closeTutorial}><CloseIcon /></IconButton>
        }

        if (this.state.page >= this.state.maxPages - 1) {
            nextIcon = <IconButton color="inherit" aria-label="close tutorial" onClick={this.props.closeTutorial}><CloseIcon /></IconButton>
        }

        let title = 'Interactive battlechoc Tutorial';
        if (this.state.page === 1) {
            title = 'The chocolate factory';
        } else if (this.state.page === 2) {
            title = 'About trees and cannons';
        } else if (this.state.page === 3) {
            title = 'X-mas and bunnies';
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
            <EasterBunnyAndXmasFactoryPage fulfilled={this.fulfilled} appbar={appbar}/>
        ];

        return (
            <div id="tutorial">
                {pages[this.state.page]}
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

export default TutorialContainer;