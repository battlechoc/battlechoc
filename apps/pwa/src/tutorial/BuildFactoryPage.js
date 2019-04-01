import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MicroGamefield from './MicroGamefield';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';

class ChoosePage extends Component {
    render() {
        return (
            <div>
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

ChoosePage.propTypes = {
    fulfilled: PropTypes.func.isRequired
}

export default ChoosePage