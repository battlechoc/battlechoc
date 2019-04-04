import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import ArrowBackIcon from '@material-ui/icons/ArrowBackIos';
import ArrowForwardIcon from '@material-ui/icons/ArrowForwardIos';
import CloseIcon from '@material-ui/icons/Close';
import ChoosePage from './ChoosePage';
import BuildFactoryPage from './BuildFactoryPage';
import TreesAndCannonsPage from './TreesAndCannonsPage';
//import t from './Translation';

class Tutorial extends Component {
    constructor(props) {
        super(props);
        this.state = {
            page: 0,
            pages: [
                <ChoosePage fulfilled={this.fulfilled} />, 
                <BuildFactoryPage fulfilled={this.fulfilled} />,
                <TreesAndCannonsPage fulfilled={this.fulfilled} />
            ]
        }
    }

    fulfilled = () => {
        if ((this.state.page + 1) === this.state.pages.length) {
            this.props.closeTutorial();
        } else {
            this.next();
        }
    }

    next = () => {
        this.setState({ page: this.state.page + 1});
    }

    back = () => {
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

        if (this.state.page >= this.state.pages.length - 1) {
            nextIcon = <IconButton color="inherit" aria-label="close tutorial" onClick={this.props.closeTutorial}><CloseIcon /></IconButton>
        }

        return (
            <div id="tutorial">
                <AppBar position="static">
                <Toolbar>
                  { backIcon }
                  <Typography variant="h6" className="tutorial-headline" color="inherit">
                    Interactive battlechoc Tutorial 
                  </Typography>
                  { nextIcon }
                </Toolbar>
                </AppBar>
                {this.state.pages[this.state.page]}
            </div>
        );
    }
}

Tutorial.propTypes = {
    closeTutorial: PropTypes.func.isRequired
}

const mapStateToProps = state => ({ language: state.ui.language });
const TutorialContainer = connect(mapStateToProps)(Tutorial);

export default TutorialContainer;