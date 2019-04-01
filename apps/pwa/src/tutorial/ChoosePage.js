import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import { EntityType } from '../gameplay/GameEntities';
import StartIcon from '@material-ui/icons/SupervisorAccount';

class ChoosePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            fields: [   
                        [      
                            {previewStyle: 'brown', occupiedBy: [EntityType.CREAM]},
                            {previewStyle: 'white', occupiedBy: []},
                            {previewStyle: 'black', occupiedBy: []},
                            {previewStyle: 'black', occupiedBy: []},
                            {previewStyle: 'brown', occupiedBy: [EntityType.CREAM]},
                            {previewStyle: 'white', occupiedBy: []},
                            {previewStyle: 'white', occupiedBy: []},
                            {previewStyle: 'black', occupiedBy: []},
                            {previewStyle: 'brown', occupiedBy: [EntityType.CREAM]}
                        ],[
                            {previewStyle: 'black', occupiedBy: [EntityType.CREAM]},
                            {previewStyle: 'white', occupiedBy: []},
                            {previewStyle: 'brown', occupiedBy: [EntityType.CREAM]},
                            {previewStyle: 'black', occupiedBy: [EntityType.CREAM]},
                            {previewStyle: 'white', occupiedBy: [EntityType.CREAM]},
                            {previewStyle: 'white', occupiedBy: []},
                            {previewStyle: 'white', occupiedBy: []},
                            {previewStyle: 'black', occupiedBy: [EntityType.CREAM]},
                            {previewStyle: 'brown', occupiedBy: [EntityType.CREAM]}
                        ]
                    ]
        }
    }

    render() {
        return (
            <div>
                <Paper className="tutorial-message" elevation={1}>
                    <Typography component="p">
                       Welcome to our interactive battlechoc tutorial! This is where you will be introduced to the rules, menus and displays to become a battlechoc master one day.
                       But for now we can keep things simple: When you start a new game we generate two game fields. The fields are randomly covered with cream and there are white and black fields in addition to the regular brown fields. You can find out what these mean on the next pages.
                    </Typography>
                    <br />
                    <Typography component="p">
                       Choose one of the options below to continue with the tutorial. 
                    </Typography>
                </Paper>

                <div className="choose">
                    <div className="active button" onClick={this.props.fulfilled}>
                        {(() => {
                            const creamedCells = this.state.fields[0].filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                            return <div className="creamedCellCount">
                                <img alt="filled with cream" src="images/cream_preview.png" />
                                <p>{creamedCells.length}</p>
                            </div>
                        })()}
                        <div className="tutorial fields">
                            {(() => {
                                return this.state.fields[0].map(
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
                            })()}
                        </div>
                    </div>

                    <div className="active button" onClick={this.props.fulfilled}>
                        <div className="stackedIcon"><div className="firstIcon">#1</div><StartIcon fontSize="large" /></div>
                    </div>

                    <div className="active button" onClick={this.props.fulfilled}>
                        {(() => {     
                            const creamedCells = this.state.fields[1].filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
                            return <div className="creamedCellCount">
                                <img alt="filled with cream" src="images/cream_preview.png" />
                                <p>{creamedCells.length}</p>
                            </div>                        
                        })()}
                        <div className="tutorial fields">
                            {(() => {
                                return this.state.fields[1].map(
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
                            })()}
                        </div>
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