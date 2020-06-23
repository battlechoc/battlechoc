import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import Fab from './Fab';
import { translate as t, keys as tr } from '../misc';
import { createUseStyles } from 'react-jss';
import ConfettiGenerator from "confetti-js";
import CountUp from 'react-countup';

const useStyles = createUseStyles(theme => ({
    overview: {
        height: '100%',
        width: '100%',
        position: 'absolute',
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'Bangers',
        fontSize: '8vh',
        color: 'white',
        '-webkit-text-stroke': `0.05vh ${theme.color.secondary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        [theme.breakpoints.orientation.portrait]: {
            fontSize: '5vh',
        }
    },
    headline: {
        textAlign: 'center',
        marginTop: '2vh'
    },
    total: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
    },
    actions: {
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '8vh'
    },
    coins: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '& span': {
            fontSize: '10vh',
            marginRight: '0.5vh',
            [theme.breakpoints.orientation.portrait]: {
                fontSize: '6.5vh'
            }
        },
        '& > div': {
            background: 'url(/images/coins.svg) no-repeat',
            height: '7vh',
            width: '10vh',
            marginLeft: '1.5vh',
            [theme.breakpoints.orientation.portrait]: {
                height: '5vh',
                width: '7.5vh',
            }
        }
    },
    award: {
        display: 'flex',
        flexDirection: 'column',
        fontSize: '5vh',
        opacity: 1,
        transition: 'opacity .25s ease-in-out',
        textAlign: 'center',
        '& > div': {
            minHeight: '5.5vh'
        }
    },
    table: {
        display: 'table',
        fontSize: '5vh',
        margin: '0 auto',
        width: 'fit-content',
        borderSpacing: '5vw 1vh',
        color: theme.color.primary.light,
        '-webkit-text-stroke': `0.05vh ${theme.color.primary.dark}`,
        '-webkit-font-smoothing': 'antialiased',
        '& > div': {
            display: 'table-row',
            '& > div': {
                textAlign: 'left',
                display: 'table-cell'
            }
        }
    },
    confetti: {
        position: 'absolute',
        zIndex: -1
    }
}));

const GameEndOverview = props => {
    const classes = useStyles();
    const { outcome, awards } = props;
    
    const pointer = useRef(0);
    const confetti = useRef();
    const highlight = useRef();
    const [award, setAward] = useState(pointer.current);
    const counter = useRef();
    const count = useRef(awards.length > 0 ? awards[0].coins : 0);
    let headline = t(tr.MESSAGE_WIN_GAME);
    if (outcome !== 'won') {
        headline = t(tr.MESSAGE_LOST_GAME);
    }

    React.useEffect(() => {
        if (outcome === 'won') {
            const confettiSettings = { target: confetti.current };
            const confettiGenerator = new ConfettiGenerator(confettiSettings);
            confettiGenerator.render();
        
            return () => confettiGenerator.clear();
        }
      }, [outcome]);

    const coins = awards.reduce((previous, current) => current.coins + previous, 0);
    
    const showNextAward = skip => {
        pointer.current++;
        if (skip) {
            pointer.current = awards.length;
            setAward(pointer.current);
        } else if (pointer.current < awards.length + 1) {
            setAward(pointer.current);
        }
    }

    useEffect(() => {
        const opacity = highlight.current.style.opacity;
        highlight.current.style.opacity = 1 - opacity;
        const timeout = setTimeout(() => highlight.current.style.opacity = opacity, 2200);

        if (award > 0 && award < awards.length) {
            count.current += awards[award].coins;           
            counter.current.update(count.current);
        }

        return () => clearTimeout(timeout);
    }, [award, awards]);

    let title = '';
    let subtitle = '';
    if (award < awards.length) {
        title = `${awards[award].title} +${awards[award].coins}`;
        subtitle = awards[award].subtitle;
    }

    const counterView = <CountUp duration={2.5} useEasing={false} ref={counter} end={count.current} onEnd={() => showNextAward(false)} preserveValue={true} />;

    return (
        <div className={classes.overview}>
            <canvas className={classes.confetti} ref={confetti}/>
            <div className={classes.headline}>{ headline }</div>
            <div className={classes.total}>
                <div className={classes.coins}><span>{ award < awards.length ? counterView : coins }</span><div /></div>
                <div className={classes.table}>
                    {awards.map((entry, index) => <div key={index} style={index < award ? null : {visibility: 'hidden'}}><div>{entry.title}</div><div>{`+${entry.coins}`}</div></div>)}
                </div>
                <div ref={highlight} style={award < awards.length ? {opacity: 1} : {opacity: 0, visibility: 'hidden'}} className={classes.award}>
                    <div>{title}</div>
                    <div>{subtitle}</div>
                </div>
            </div>

            <div className={classes.actions}>
                {   award < awards.length ?
                    <Fab
                        color="accent"
                        icon="fast-forward"
                        onClick={() => showNextAward(true)} /> :
                    <Fab
                        color="secondary"
                        icon="done"
                        onClick={() => props.finishGame(coins)} /> 
                }
            </div>
        </div>
    );
}

GameEndOverview.propTypes = {
    finishGame: PropTypes.func.isRequired,
    outcome: PropTypes.string.isRequired,
    awards: PropTypes.array.isRequired
};

export default GameEndOverview;