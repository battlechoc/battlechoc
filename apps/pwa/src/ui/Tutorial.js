import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import Paper from '@material-ui/core/Paper';
import ArrowBackIcon from '@material-ui/icons/ArrowBackIos';
import ArrowForwardIcon from '@material-ui/icons/ArrowForwardIos';
import CloseIcon from '@material-ui/icons/Close';
import MicroGamefield from './MicroGamefield';
//import t from './Translation';

class Tutorial extends Component {
    constructor(props) {
        super(props);
        this.state = {
            page: 0
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

        if (this.state.page === 0) {
            backIcon = <IconButton color="inherit" aria-label="close tutorial" onClick={this.props.closeTutorial}><CloseIcon /></IconButton>
        }

        return (
            <div id="tutorial">
                <AppBar position="static">
                <Toolbar>
                  { backIcon }
                  <Typography variant="h6" className="tutorial-headline" color="inherit">
                    Interactive battlechoc Tutorial 
                  </Typography>
                  <IconButton color="inherit" aria-label="next" onClick={this.next}>
                    <ArrowForwardIcon />
                  </IconButton>
                </Toolbar>
                </AppBar>

                <Paper className="tutorial-message" elevation={1}>
                    <Typography component="p">
                       Welcome to our interactive battlechoc tutorial! This is where you will be introduced to the rules, menus and displays to become a battlechoc master one day.
                       But for now we can keep things simple: This is your gamefield (no worry: The real one is bigger)
                    </Typography>
                    <br />
                    <Typography component="p">
                       Build a chocolate factory to start the tutorial by clicking on a field of your choice  
                    </Typography>
                </Paper>

                <div className="microGamefield">
                    <MicroGamefield size={3} />
                </div>

                <div id="buildingSelection">
                    <div className="selected previewContainer">
                        <img alt="factory preview" className="enabled preview" src="images/factory_icon.png"/>
                    </div>
                </div>
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