import React, { Component } from 'react';
import './GameEndOverview.css';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { ArrowBack } from '@material-ui/icons';
import Fab from '@material-ui/core/Fab';
import { Translation as t } from '../misc';
import { multiplayer } from '../../Multiplayer';

class GameEndOverview extends Component {
    constructor(props) {
        super(props);
        this.state = { 
            outcome: 'win',
            awards: 0
        }
    }

    componentDidMount() {
        this.calculateChocoCoins();
        this.createPie();
    }

    sliceSize(dataNum, dataTotal) {
        return (dataNum / dataTotal) * 360;
    }

    estimateHeadlineText() {
        let headine = t[this.props.language].MESSAGE_WIN_GAME
        if (this.props.game.winners.length === 1) {
            if (!multiplayer.isLocalPlayer(this.props.game.winners[0].idx)) {
                headine = t[this.props.language].MESSAGE_LOST_GAME;
            }
        } else if (this.props.game.winners.length === 2) {
            headine = t[this.props.language].MESSAGE_DRAW_GAME;
        }

        return headine;
    }
    
    addSlice(sliceSize, offset, sliceID, color) {
        let pie = document.getElementById('pie');
        let slice = document.createElement('div');
        slice.className = 'slice';
        let span = document.createElement('span');
        slice.appendChild(span);
        pie.appendChild(slice);
        
        offset = offset - 1;
        let sizeRotation = -179 + sliceSize;
        slice.style.transform = "rotate("+offset+"deg) translate3d(0,0,0)";
        span.style.transform = "rotate("+sizeRotation+"deg) translate3d(0,0,0)";
        span.style.backgroundColor = color;
    }
    
    iterateSlices(sliceSize, offset, dataCount, sliceCount, color) {
        var sliceID = "s"+dataCount+"-"+sliceCount;
        var maxSize = 179;
        if(sliceSize <= maxSize) {
            this.addSlice(sliceSize, offset, sliceID, color);
        } else {
            this.addSlice(maxSize, offset, sliceID, color);
            this.iterateSlices(sliceSize-maxSize, offset+maxSize, dataCount, sliceCount+1, color);
        }
    }
    
    createPie() {
        const statistics = this.props.game.players[multiplayer.localPlayerIndex].statistics;
        const data = [statistics.attacks, 
                    statistics.builtEntities * 2, 
                    statistics.espionages * 10, 
                    statistics.moltenFields * 50];
        const total = data.reduce((a, b) => a + b, 0);
        const color = [
          "#D92B4B", 
          "#7EBFD9",
          "#F2BF27",
          "#F2E18D"
        ];
        var offset = 0;
        for(let i = 0; i < data.length; i++) {
            if (data[i] > 0) {
                let size = this.sliceSize(data[i], total);
                this.iterateSlices(size, offset, i, 0, color[i]);
                document.querySelector('.legend li:nth-child(' + (i+1) + ')').style.borderColor = color[i];
                offset += size;
            }
        }
    }

    calculateChocoCoins() {
        let statistics = this.props.game.players[multiplayer.localPlayerIndex].statistics;
        let awards = statistics.attacks + statistics.builtEntities * 2 + statistics.espionages * 10 + statistics.moltenFields * 50;
        
        if (this.props.game.winners.length === 1) {
            if (!multiplayer.isLocalPlayer(this.props.game.winners[0].idx)) {
                awards = 0;
                this.setState({ 
                    outcome: 'lost',
                    awards: awards 
                });
            } else {
                this.setState({ 
                    outcome: 'win',
                    awards: awards 
                });                
            }
        } else if (this.props.game.winners.length === 2) {
            awards = Math.floor(awards / 2);
            this.setState({ 
                outcome: 'draw',
                awards: awards 
            });
        }
    }

    render() {
        let statistics = this.props.game.players[multiplayer.localPlayerIndex].statistics;
        return (
            <div className="overview">
                <h1>{ this.estimateHeadlineText() }</h1>
                <div className="statistics">                    
                    <ul className="legend">
                        <li>
                            <em>Attacks</em>
                            <span className="amount">{ statistics.attacks }</span>
                        </li>
                        <li>
                            <em>Entities Overall</em>
                            <span><span className="amount">{ statistics.builtEntities }</span><b>&times; 2</b></span>
                        </li>
                        <li>
                            <em>Espionages</em>
                            <span><span className="amount">{ statistics.espionages }</span><b>&times; 10</b></span>
                        </li>
                        <li>
                            <em>Molten fields</em>
                            <span><span className="amount">{ statistics.moltenFields }</span><b>&times; 50</b></span>
                        </li>
                    </ul>
                    <div id="pie">
                        <div id="coins">
                            <span className={ this.state.outcome }>{ this.state.awards }</span>
                            <img src="images/coins.png" alt="choco coins" />
                        </div>
                    </div>
                </div>

                <div className="actions">
                    <Fab
                        size="large"
                        color="primary"
                        aria-label="back"
                        className="icon"
                        onClick={() => this.props.finishGame()}>
                        <ArrowBack  />
                    </Fab>
                </div>
            </div>
        );
    }
}

GameEndOverview.propTypes = {
    finishGame: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language,
    playerInfos: state.ui.playerInfos
});

const GameEndOverviewContainer = connect(mapStateToProps)(GameEndOverview);
export default GameEndOverviewContainer;