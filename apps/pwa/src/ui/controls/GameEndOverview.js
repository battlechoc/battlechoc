import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import Fab from './Fab';
import { translate as t, keys as tr } from '../misc';
import { createUseStyles, useTheme } from 'react-jss';

const useStyles = createUseStyles(theme => ({
    overview: {
        height: '100%',
        width: '100%',
        position: 'absolute',
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    },
    headline: {
        fontFamily: 'Bangers',
        fontSize: '5vw',
        color: 'white',
        '-webkit-text-stroke': '1px #3C1C0C',
        '-webkit-font-smoothing': 'antialiased',
    },
    statistics: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        [theme.breakpoints.orientation.portrait]: {
            flexDirection: 'column-reverse'
        }
    },
    actions: {
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '8vh'
    },
    pie: {
        height: '30vw',
        width: '30vw',
        position: 'relative',
        '&:before': {
            content: '""',
            display: 'block',
            position: 'absolute',
            zIndex: 1,
            width: '50%',
            height: '50%',
            background: 'white',
            borderRadius: '50%',
            top: '25%',
            left: '25%',
        }
    },
    slice: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        clip: 'rect(0vw, 30vw, 30vw, 15vw)',
        animation: 'bake-pie 1s',
        '& > span': {
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            backgroundColor: 'black',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            clip: 'rect(0vw, 30vw, 30vw, 15vw)',
        }
    },
    legend: {
        fontSize: '2vw',
        background: 'white',
        padding: '3vw',
        display: 'flex',
        flexDirection: 'column',
        border: `0.5vw solid ${theme.color.secondary.light}`,
        borderRadius: '2vw',
        '& b': {
            paddingLeft: '0.5vw',
            color: theme.color.primary.light
        },
        '& li': {
            display: 'flex',
            marginBottom: '1.5vw',
            paddingLeft: '1vw',
            borderLeft: '2.5vw solid black'
        },
        '& em': {
            fontStyle: 'normal',
            flexGrow: 1
        },
        '& span': {
            paddingLeft: '2vw'
        }
    },
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
            fontSize: '6vw',
            color: '#fff',
            '-webkit-text-stroke': '0.1vw #3C1C0C',
            '-webkit-font-smoothing': 'antialiased',
            fontFamily: 'Bangers',
            marginRight: '0.5vw'
        },
        '& > div': {
            background: 'url(/images/coins.svg) no-repeat',
            height: '4.717vw',
            width: '7vw'
        }
    }
}));

const useMountEffect = effect => useEffect(effect, [])

const GameEndOverview = props => {
    const classes = useStyles();
    const theme = useTheme();
    const sliceSize = (dataNum, dataTotal) => {
        return (dataNum / dataTotal) * 360;
    }
    
    const addSlice = (sliceSize, offset, color) => {
        const pie = document.getElementsByClassName(classes.pie)[0];
        const slice = document.createElement('div');
        slice.className = classes.slice;
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
          theme.color.accent.light,
          theme.color.secondary.light,
          theme.color.primary.light,
          theme.color.brown.light
        ];
        let offset = 0;
        for(let i = 0; i < data.length; i++) {
            if (data[i] > 0) {
                let size = sliceSize(data[i], total);
                iterateSlices(size, offset, i, color[i]);
                document.querySelector(`.${classes.legend} li:nth-child(${i+1})`).style.borderColor = color[i];
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
        <div className={classes.overview}>
            <h1 className={classes.headline}>{ headine }</h1>
            <div className={classes.statistics}>                    
                <ul className={classes.legend}>
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_ATTACKS)}</em>
                        <span>{ statistics.attacks }</span>
                    </li>
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_ENTITIES)}</em>
                        <span><span>{ statistics.builtEntities }</span><b>&times; 2</b></span>
                    </li>
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_ESPIONAGES)}</em>
                        <span><span>{ statistics.espionages }</span><b>&times; 10</b></span>
                    </li>
                    <li>
                        <em>{t(tr.GAME_END_OVERVIEW_MOLTEN_FIELDS)}</em>
                        <span><span>{ statistics.moltenFields }</span><b>&times; 50</b></span>
                    </li>
                </ul>
                <div className={classes.pie}>
                    <div className={classes.coins}>
                        <span>{ coins }</span>
                        <div />
                    </div>
                </div>
            </div>

            <div className={classes.actions}>
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