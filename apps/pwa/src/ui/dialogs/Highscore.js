import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';
import Dialog from './Dialog';
import { Fab, Progress, Button, PlayerList } from '../controls';
import { translate as t, keys as tr } from '../misc';
import { multiplayer } from '../../Multiplayer';
import logger from '../../helper/logger';

const useStyles = createUseStyles(theme => ({
  fab: {
    position: 'absolute',
    top: 'calc(4vh + 4vw + 10px)',
    right: 5,
    zIndex: 4
  },
  paginator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 8,
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%'
  },
  info: {
    display: 'flex',
    justifyContent: 'center',
    flexGrow: 1    
  },
  rank: {
    fontFamily: 'Bangers',
    fontSize: '5vw',
    '-webkit-text-stroke': `0.1vw ${theme.color.secondary.dark}`,
    '-webkit-font-smoothing': 'antialiased',
    [theme.breakpoints.orientation.portrait]: {
      fontSize: '4vh',
      '-webkit-text-stroke': `0.1vh ${theme.color.secondary.dark}`,    
    }
  }
}));

const Highscore = props => {
  const classes = useStyles(props);
  const [open, setOpen] = useState(false);  
  const [loading, setLoading] = useState(false);
  const [highscore, setHighscore] = useState([]); 
  const [highscoreLastPage, setHighscoreLastPage] = useState(1); 
  const [highscorePage, setHighscorePage] = useState(1);
  const { showQuickMessage } = props;

  const openHighscorePage = useCallback(
    async page => {
      setLoading(true);
      setHighscore([]);
      try {
        const highscore = await multiplayer.fetchHighscore(page);
        setHighscore(highscore.list);
        setHighscorePage(highscore.page);
        setHighscoreLastPage(highscore.lastPage);
      } catch (error) {
        logger.warn(error);
        showQuickMessage({ text: t(tr.FETCH_HIGHSCORE_FAILED)});
      } finally {
        setLoading(false);
      }
    }, [showQuickMessage]
  );

  useEffect(() => {
    if (open) {
      openHighscorePage();
    }
  }, [open, openHighscorePage]);

  return (<div style={props.style}>
    <Fab onClick={() => setOpen(true)} color="gold" icon="trophy" className={classes.fab} />

    <Dialog
      open={open}
      close={() => setOpen(false)}
      icon="highscore"
      title="Highscore">
      <div className={classes.page}>
        <div className={classes.paginator}>
          <div>
            <Button
              icon="backward"
              disabled={highscorePage === 1}
              onClick={() => openHighscorePage(Math.max(highscorePage - 1, 1))}/>
            <Button
              color="accent"
              style={{
                marginTop: 5
              }}
              icon="fast-backward"
              disabled={highscorePage === 1}
              onClick={() => openHighscorePage(1) } />
          </div>
          <div className={classes.info}>{ loading ? <Progress infiniteAnimation /> : <span className={classes.rank}>{t(tr.ACCOUNT_OVERVIEW_RANK)}<br />{highscore.length > 0 ? `${highscore[0].ranking} - ${highscore[highscore.length - 1].ranking}` : '1 - 1'}</span> }</div>
          <div>
            <Button
              icon="forward"
              disabled={highscorePage === highscoreLastPage}
              onClick={() => {
                  openHighscorePage(Math.min(highscorePage + 1, highscoreLastPage))}
              }/> 
            <Button
              color="accent"
              style={{
                marginTop: 5
              }}
              icon="fast-forward"
              disabled={highscorePage === highscoreLastPage}
              onClick={() => openHighscorePage(highscoreLastPage) }/>
          </div>
        </div>
        {loading ? null : <PlayerList 
          withScore={true}
          players={highscore} 
          username={props.playername}
          showProfile={props.showPlayerProfile} /> }
      </div>
    </Dialog>
  </div>);
}

Highscore.defaultProps = {
  style: {},
  className: ''
}

Highscore.propTypes = {
  style: PropTypes.object,
  className: PropTypes.string,
  showQuickMessage: PropTypes.func.isRequired,
  showPlayerProfile: PropTypes.func.isRequired
}

export default Highscore;