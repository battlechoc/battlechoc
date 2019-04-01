import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { EntityType } from '../gameplay/GameEntities';
import StartIcon from '@material-ui/icons/SupervisorAccount';
import ChatLikeInstructions from './ChatLikeInstructions';

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
        let choose = <div id="tutorialchooseContainer" className="choose">
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
                </div>;
        let messages = [
            { text: 'Welcome to our interactive battlechoc tutorial!', type:'text', delay: 2000 },
            { text: 'Choose between first turn or one of the game fields to continue with the tutorial', type:'text', delay: 2500 },
            { element: choose, type: 'challenge' }
        ]
        return (
            <ChatLikeInstructions messages={messages}/>
        );
    }
}

ChoosePage.propTypes = {
    fulfilled: PropTypes.func.isRequired
}

export default ChoosePage