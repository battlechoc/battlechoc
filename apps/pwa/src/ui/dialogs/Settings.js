import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { updatePlayerStats, hideQuickMessage, showQuickMessage } from '../UiActions';
import { Jukebox } from '../misc';
import { translate as t, translationKeys as tr, setCurrentLanguage, getCurrentLanguage } from 'battlechoc-shared-functions';
import OfflineStore from '../../OfflineStore';
import { ServerRequest } from '../../helper/settings';
import PlayerNameInput from '../controls/PlayerNameInput';
import logger from '../../helper/logger';
import { createUseStyles } from 'react-jss';
import Dialog from './Dialog';
import { Button, Select, Progress } from '../controls';

const useStyles = createUseStyles(theme => ({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '70vw'
  },
  userReport: {
    margin: '5px 0',
    color: theme.color.secondary.dark,
    border: `3px solid ${theme.color.secondary.dark}`,
    borderRadius: 15,
    padding: 10,
    fontSize: '0.8rem'
  },
  username: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    userSelect: 'none',
    fontSize: '5vw',
    fontWeight: 'bolder',
    padding: '2vh'
  },
  editUsername: {
    marginLeft: '5vw'
  },
  accountCircle: {
    height: '5vw',
    width: '5vw',
    marginLeft: '1vw'
  },
  formular: {
    display: 'flex',
    flexDirection: 'column',
    paddingRight: 10,
    '& > label': {
      marginLeft: 5
    }
  },
  reportInformation: {
    marginTop: 15,
  },
  button: {
    marginTop: '2vh',
    width: '30vw',
    textAlign: 'center',
    height: '10vw',
    '& > div': {
      fontSize: '4vw'
    },
    [theme.breakpoints.orientation.portrait]: {
      width: '50vw',
      height: '16vw',
      '& > div': {
        fontSize: '6vw'
      }
    }
  },
  checkbox: {
    marginBottom: 10
  },
  select: {
    background: 'white',
    color: theme.color.secondary.dark,
    padding: 10,
    fontSize: '0.8rem'
  },
  playerName: {
    marginTop: '2vh',
    marginBottom: '2vh',
    width: '100%'
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    justifyContent: 'space-evenly'
  }
}));

const Settings = props => {
  const [showErrorReport, setShowErrorReport] = useState(false);
  const [withDeviceInformation, setWithDeviceInformation] = useState(false);
  const [additionalReportMessage, setAdditionalReportMessage] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [editPlayerName, setEditPlayerName] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);

  const classes = useStyles();

  const setPlayerName = async playerName => {
    try {
      await ServerRequest('post', '/user/username', { username: playerName })
      props.updatePlayerStats({ username: playerName });
      const playerStats = await OfflineStore.playerStore.get('stats')
      playerStats.username = playerName;
      OfflineStore.playerStore.set('stats', playerStats);
      setEditPlayerName(false);
    } catch(error) {
      logger.warn(error)
    }
  }

  const closeDialog = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.close();
    setShowErrorReport(false);
    setEditPlayerName(false);
  }

  const submitReport = async () => {
    if (!sendingReport) {
      setSendingReport(true);
      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
      try {
        let gamestate = props.game;
        console.log(gamestate);
        const report = {
          deviceInformation: withDeviceInformation ? navigator.userAgent : undefined,
          gamestate: gamestate,
          player: (typeof props.playerInfos.uid !== 'undefined') ? props.playerInfos.uid : props.playerInfos.stats.username,
          message: additionalReportMessage,
          logs: logger.summarize(),
          reported: (new Date()).getTime()
        };
        await ServerRequest('post', '/debugging/gamestate', { report: report });
        props.showQuickMessage({
          text: t(tr.SUCCESSFULLY_SENDING_PROBLEM_REPORT),
          variant: 'success'
        });
      } catch (error) {
        logger.warn(error);
        props.showQuickMessage({
          text: t(tr.ERROR_SENDING_PROBLEM_REPORT),
          variant: 'error'
        });
      } finally {
        setAdditionalReportMessage('')
        setWithDeviceInformation(false)
        setShowErrorReport(false);
        setSendingReport(false)
        props.close();
      }
    }
  } 

  const options = [{
    value: 'en',
    label: t(tr.ENGLISH)
  }, {
    value: 'de',
    label: t(tr.GERMAN)
  }, {
    value: 'jp',
    label: t(tr.JAPANESE)
  }, {
    value: 'es',
    label: t(tr.SPANISH)
  }, {
    value: 'fr',
    label: t(tr.FRENCH)
  }, {
    value: 'it',
    label: t(tr.ITALIAN)
  }, {
    value: 'pt',
    label: t(tr.PORTUGUESE)
  }, {
    value: 'vn',
    label: t(tr.VIETNAMESE)
  }];

  const changeLanguage = value => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    setCurrentLanguage(value, () => {
        ServerRequest('post', '/user/language', { language: value })
            .catch(error => {
                if (!error instanceof ReferenceError) {
                    console.warn(error);
                }
            })
            .finally(() => OfflineStore.settingsStore.set("language", value));
    });
    setForceUpdate(1 - forceUpdate);
  }

  return (
    <div>
      <Dialog
        open={showErrorReport}
        close={() => {
          setAdditionalReportMessage('');
          setWithDeviceInformation(false);
          setShowErrorReport(false)
        }}
        title={t(tr.REPORT_PROBLEM)}
        mode="stacked">
        <div>
          <form className={classes.formular} noValidate autoComplete="off">
            <label htmlFor="issue-message">{t(tr.REPORT_CUSTOM_MESSAGE)}</label>
            <textarea
              id="issue-message"
              name="issue-message"
              placeholder={t(tr.REPORT_CUSTOM_MESSAGE_PLACEHOLDER)}
              className={`${classes.userReport}`}
              onChange={event => setAdditionalReportMessage(event.target.value)}
            />
            <div className={classes.checkbox}>
              <input
                id="issue-device-information"
                name="issue-device-information"
                type="checkbox"
                checked={withDeviceInformation}
                onChange={event => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  setWithDeviceInformation(event.target.checked);
                }}
              />
              <label htmlFor="issue-device-information">{t(tr.REPORT_DEVICE_INFO)}</label>
            </div>
            <Button color="accent" onClick={submitReport}>{sendingReport ? <Progress size={18} infiniteAnimation /> : t(tr.REPORT_PROBLEM)}</Button>
          </form>
          <p className={classes.reportInformation}>{t(tr.REPORT_INFORMATION)}</p>
        </div>
      </Dialog>

      <Dialog
        open={props.open}
        close={closeDialog}
        icon="gears"
        title={t(tr.SETTINGS)}>
        <div className={classes.wrapper}>
          {
            (typeof props.playerInfos.stats.username !== 'undefined' && props.playerInfos.stats.username !== 'Chocnonymous') || props.playerInfos.stats.tutorialSkipped === true || props.playerInfos.stats.tutorialFinished === true ?
              <PlayerNameInput className={classes.playerName} onEditMode={() => setEditPlayerName(true)} editMode={editPlayerName} setPlayerName={setPlayerName} startValue={props.playerInfos.stats.username} current={props.playerInfos.stats.username}/> : null
          }
          <Select onChange={changeLanguage} options={options} defaultSelected={getCurrentLanguage()} />
          <div className={classes.actions}>
            <Button className={classes.button} onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              setShowErrorReport(true);
            }}>{t(tr.REPORT_PROBLEM)}</Button>
            {(() => {
              if ((props.playerInfos.stats.username !== 'Chocnonymous' && typeof props.game === 'undefined') || props.playerInfos.stats.tutorialSkipped === true || props.playerInfos.stats.tutorialFinished === true) {
                return (
                  <div>
                    <Button className={classes.button} color="accent" onClick={() => {
                      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                      props.startTutorial();
                      props.close();
                    }}>{t(tr.RESTART_TUTORIAL)}</Button>
                  </div>
                )
              }
            })()}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

Settings.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired,
  startTutorial: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
  playerInfos: state.ui.playerInfos,
  tutorial: state.ui.tutorial,
});

const mapDispatchToProps = {
  updatePlayerStats,
  hideQuickMessage,
  showQuickMessage
};

const SettingsContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Settings);

export default SettingsContainer;