import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import './GameEndOverview.css';
import Fab from './Fab';
import { translate as t, keys as tr } from '../misc';
import { createUseStyles } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    coins: {
        position: 'absolute',
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        '& span': {
            fontSize: '2rem',
            color: '#fff',
            '-webkit-text-stroke': '1px #3C1C0C',
            '-webkit-font-smoothing': 'antialiased',
            fontFamily: 'Bangers',
            marginRight: 10
        },
        '& > div': {
            background: 'url(/images/coins.svg) no-repeat',
            height: 31,
            width: 46
        }
    }
}));

const useMountEffect = effect => useEffect(effect, [])

const GameEndOverview = props => {
    const classes = useStyles();
    const sliceSize = (dataNum, dataTotal) => {
        return (dataNum / dataTotal) * 360;
    }
    
    const addSlice = (sliceSize, offset, color) => {
        const pie = document.getElementById('pie');
        const slice = document.createElement('div');
        slice.className = 'slice';
        const span = document.createElement('span');
        slice.appendChild(span);
        pie.appendChild(slice);
        
        offset = offset - 1;
        const sizeRotation = -179 + sliceSize;
        slice.style.transform = "rotate("+offset+"deg) translate3d(0,0,0)";
        span.style.transform = "rotate("+sizeRotation+"deg) translate3d(0,0,0)";
        span.style.backgroundColor = color;
    }
    
    const iterateSlices = (sliceSize, offset, dataCount, color) => {
        const maxSize = 179;
        if(sliceSize <= maxSize) {
            addSlice(sliceSize, offset, color);
        } else {
            addSlice(maxSize, offset, color);
            iterateSlices(sliceSize-maxSize, offset+maxSize, dataCount, color);
        }
    }
    
    useMountEffect(() => {
        const statistics = props.player.statistics;
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
        let offset = 0;
        for(let i = 0; i < data.length; i++) {
            if (data[i] > 0) {
                let size = sliceSize(data[i], total);
                iterateSlices(size, offset, i, color[i]);
                document.querySelector('.legend li:nth-child(' + (i+1) + ')').style.borderColor = color[i];
                offset += size;
            }
        }
    });
    
    const statistics = props.player.statistics;
    let coins = statistics.attacks + statistics.builtEntities * 2 + statistics.espionages * 10 + statistics.moltenFields * 50;
    let outcome = 'win';

    if (props.winners.length === 1) {
        if (props.player.id !== props.winners[0].id) {
            coins = 0;
            outcome = 'lost';
        }
    } else if (props.winners.length === 2) {
        coins = Math.floor(coins / 2);
        outcome = 'draw';
    }

    let headine = t(tr.MESSAGE_WIN_GAME);
    if (props.winners.length === 1) {
        if (props.player.id !== props.winners[0].id) {
            headine = t(tr.MESSAGE_LOST_GAME);
        }
    } else if (props.winners.length === 2) {
        headine = t(tr.MESSAGE_DRAW_GAME);
    }

    return (
        <div className="overview">
            <h1>{ headine }</h1>
            <div className="statistics">                    
                <ul className="legend">
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_ATTACKS)}</em>
                        <span className="amount">{ statistics.attacks }</span>
                    </li>
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_ENTITIES)}</em>
                        <span><span className="amount">{ statistics.builtEntities }</span><b>&times; 2</b></span>
                    </li>
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_ESPIONAGES)}</em>
                        <span><span className="amount">{ statistics.espionages }</span><b>&times; 10</b></span>
                    </li>
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_MOLTEN_FIELDS)}</em>
                        <span><span className="amount">{ statistics.moltenFields }</span><b>&times; 50</b></span>
                    </li>
                </ul>
                <div id="pie">
                    <div className={classes.coins}>
                        <span>{ coins }</span>
                        <div />
                    </div>
                </div>
            </div>

            <div className="actions">
                <Fab
                    color="secondary"
                    icon="back"
                    onClick={() => props.finishGame(coins)} />
            </div>
        </div>
    );
}

GameEndOverview.propTypes = {
    finishGame: PropTypes.func.isRequired,
    winners: PropTypes.array.isRequired,
    player: PropTypes.object.isRequired
};

export default GameEndOverview;