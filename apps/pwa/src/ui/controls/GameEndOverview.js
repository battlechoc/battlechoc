import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import './GameEndOverview.css';
import { ArrowBack } from '@material-ui/icons';
import Fab from '@material-ui/core/Fab';
import { Translation as t } from '../misc';
import { multiplayer } from '../../Multiplayer';
import { OptimizedImage } from '../../helper/compatibility';

const useMountEffect = effect => useEffect(effect, [])

const GameEndOverview = props => {
    let sliceSize = (dataNum, dataTotal) => {
        return (dataNum / dataTotal) * 360;
    }
    
    let addSlice = (sliceSize, offset, sliceID, color) => {
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
    
    let iterateSlices = (sliceSize, offset, dataCount, sliceCount, color) => {
        var sliceID = "s"+dataCount+"-"+sliceCount;
        var maxSize = 179;
        if(sliceSize <= maxSize) {
            addSlice(sliceSize, offset, sliceID, color);
        } else {
            addSlice(maxSize, offset, sliceID, color);
            iterateSlices(sliceSize-maxSize, offset+maxSize, dataCount, sliceCount+1, color);
        }
    }
    
    useMountEffect(() => {
        let statistics = props.player.statistics;
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
                let size = sliceSize(data[i], total);
                iterateSlices(size, offset, i, 0, color[i]);
                document.querySelector('.legend li:nth-child(' + (i+1) + ')').style.borderColor = color[i];
                offset += size;
            }
        }
    });
    
    let statistics = props.player.statistics;
    let awards = statistics.attacks + statistics.builtEntities * 2 + statistics.espionages * 10 + statistics.moltenFields * 50;
    let outcome = 'win';

    if (props.winners.length === 1) {
        if (!multiplayer.isLocalPlayer(props.winners[0].idx)) {
            awards = 0;
            outcome = 'lost';
        }
    } else if (props.winners.length === 2) {
        awards = Math.floor(awards / 2);
        outcome = 'draw';
    }

    let headine = t[props.language].MESSAGE_WIN_GAME
    if (props.winners.length === 1) {
        if (!multiplayer.isLocalPlayer(props.winners[0].idx)) {
            headine = t[props.language].MESSAGE_LOST_GAME;
        }
    } else if (props.winners.length === 2) {
        headine = t[props.language].MESSAGE_DRAW_GAME;
    }

    return (
        <div className="overview">
            <h1>{ headine }</h1>
            <div className="statistics">                    
                <ul className="legend">
                    <li>
                        <em>{t[props.language].GAME_END_OVERVIEW_ATTACKS}</em>
                        <span className="amount">{ statistics.attacks }</span>
                    </li>
                    <li>
                        <em>{t[props.language].GAME_END_OVERVIEW_ENTITIES}</em>
                        <span><span className="amount">{ statistics.builtEntities }</span><b>&times; 2</b></span>
                    </li>
                    <li>
                        <em>{t[props.language].GAME_END_OVERVIEW_ESPIONAGES}</em>
                        <span><span className="amount">{ statistics.espionages }</span><b>&times; 10</b></span>
                    </li>
                    <li>
                        <em>{t[props.language].GAME_END_OVERVIEW_MOLTEN_FIELDS}</em>
                        <span><span className="amount">{ statistics.moltenFields }</span><b>&times; 50</b></span>
                    </li>
                </ul>
                <div id="pie">
                    <div id="coins">
                        <span className={ outcome }>{ awards }</span>
                        <OptimizedImage src="/images/coins.png" alt="choco coins" />
                    </div>
                </div>
            </div>

            <div className="actions">
                <Fab
                    size="large"
                    color="primary"
                    aria-label="back"
                    className="icon"
                    onClick={() => props.finishGame()}>
                    <ArrowBack  />
                </Fab>
            </div>
        </div>
    );
}

GameEndOverview.propTypes = {
    finishGame: PropTypes.func.isRequired,
    winners: PropTypes.array.isRequired,
    player: PropTypes.object.isRequired,
    language: PropTypes.string.isRequired
};

export default GameEndOverview;